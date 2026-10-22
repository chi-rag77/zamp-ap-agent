create type extraction_status as enum ('COMPLETE','PARTIAL','INVALID','FAILED');

create table invoice_extractions (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references invoices(id),
 run_id uuid not null,
 provider text not null,
 model text not null,
 prompt_version text not null,
 schema_version text not null,
 status extraction_status not null,
 is_canonical boolean not null default false,
 raw_response text,
 structured_output jsonb,
 normalized_output jsonb,
 validation_result jsonb,
 overall_confidence numeric(5,4) check (overall_confidence between 0 and 1),
 page_count integer not null check (page_count > 0),
 finish_reason text,
 usage_metadata jsonb,
 latency_ms integer check (latency_ms >= 0),
 error_code text,
 created_at timestamptz not null default now(),
 foreign key (run_id,invoice_id) references processing_runs(id,invoice_id),
 check (status in ('FAILED','INVALID') or normalized_output is not null)
);
create index invoice_extractions_invoice_created_idx on invoice_extractions(invoice_id,created_at desc);
create unique index invoice_extractions_one_canonical on invoice_extractions(invoice_id) where is_canonical;
alter table invoices add column current_extraction_id uuid references invoice_extractions(id);

create function reject_extraction_mutation() returns trigger language plpgsql as $$
begin
 if tg_op = 'DELETE' then raise exception 'invoice_extractions are append-only'; end if;
 if (to_jsonb(old) - 'is_canonical') is distinct from (to_jsonb(new) - 'is_canonical')
 then raise exception 'invoice_extractions are append-only except canonical flag'; end if;
 return new;
end $$;
create trigger invoice_extractions_immutable before update or delete on invoice_extractions
for each row execute function reject_extraction_mutation();

-- One RPC commits the extraction, canonical fields, complete lines, run, steps, and audit event.
create function complete_invoice_extraction(p_invoice_id uuid,p_run_id uuid,p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_item jsonb; v_step jsonb; v_run processing_runs%rowtype; v_output jsonb;
begin
 select * into v_run from processing_runs where id=p_run_id and invoice_id=p_invoice_id for update;
 if not found or v_run.status <> 'RUNNING' then raise exception 'Extraction run is not active for invoice'; end if;
 perform 1 from invoices where id=p_invoice_id for update;
 if not found then raise exception 'Invoice not found'; end if;
 v_output:=p_payload->'normalized';
 if v_output is null or jsonb_typeof(v_output)<>'object' then raise exception 'Normalized output missing'; end if;
 update invoice_extractions set is_canonical=false where invoice_id=p_invoice_id and is_canonical;
 insert into invoice_extractions(invoice_id,run_id,provider,model,prompt_version,schema_version,status,is_canonical,raw_response,structured_output,normalized_output,validation_result,overall_confidence,page_count,finish_reason,usage_metadata,latency_ms)
 values(p_invoice_id,p_run_id,p_payload->>'provider',p_payload->>'model',p_payload->>'promptVersion',p_payload->>'schemaVersion',(p_payload->>'status')::extraction_status,true,p_payload->>'rawResponse',p_payload->'structured',v_output,p_payload->'validation',(p_payload->>'overallConfidence')::numeric,(p_payload->>'pageCount')::integer,p_payload->>'finishReason',p_payload->'usage',(p_payload->>'latencyMs')::integer)
 returning id into v_id;
 update invoices set
  current_extraction_id=v_id,
  invoice_number=coalesce(v_output->>'invoiceNumber',invoice_number),
  invoice_date=coalesce((v_output->>'invoiceDate')::date,invoice_date),
  due_date=coalesce((v_output->>'dueDate')::date,due_date),
  currency=coalesce(v_output->>'currency',currency),
  subtotal=coalesce((v_output->>'subtotal')::numeric,subtotal),
  tax=coalesce((v_output->>'tax')::numeric,tax),
  total=coalesce((v_output->>'total')::numeric,total),
  extraction_confidence=(p_payload->>'overallConfidence')::numeric
 where id=p_invoice_id;
 delete from invoice_lines where invoice_id=p_invoice_id;
 for v_item in select value from jsonb_array_elements(coalesce(v_output->'lineItems','[]'::jsonb)) loop
  if v_item->>'quantity' is not null and v_item->>'unitPrice' is not null and v_item->>'amount' is not null then
   insert into invoice_lines(invoice_id,line_number,sku,description,quantity,unit_price,tax_rate,amount,extraction_confidence,metadata)
   values(p_invoice_id,(v_item->>'lineNumber')::integer,v_item->>'sku',v_item->>'description',(v_item->>'quantity')::numeric,(v_item->>'unitPrice')::numeric,
    case when v_item->>'taxRate' is null then null when (v_item->>'taxRate')::numeric>1 then (v_item->>'taxRate')::numeric/100 else (v_item->>'taxRate')::numeric end,
    (v_item->>'amount')::numeric,(p_payload->>'overallConfidence')::numeric,jsonb_build_object('extraction_id',v_id));
  end if;
 end loop;
 for v_step in select value from jsonb_array_elements(coalesce(p_payload->'steps','[]'::jsonb)) loop
  insert into agent_steps(run_id,step_number,step_type,name,status,output,confidence,duration_ms,started_at,completed_at)
  values(p_run_id,(v_step->>'number')::integer,(v_step->>'type')::step_type,v_step->>'name','COMPLETED',v_step->'output',(v_step->>'confidence')::numeric,(v_step->>'durationMs')::integer,now(),now());
 end loop;
 update processing_runs set status='COMPLETED',completed_at=now(),duration_ms=greatest(0,(extract(epoch from now()-started_at)*1000)::integer),metadata=jsonb_build_object('phase','EXTRACTION','extraction_id',v_id) where id=p_run_id;
 insert into audit_events(invoice_id,run_id,actor_type,event_type,description,metadata)
 values(p_invoice_id,p_run_id,'AGENT','INVOICE_EXTRACTED','Invoice extraction completed',jsonb_build_object('extraction_id',v_id,'status',p_payload->>'status','provider',p_payload->>'provider'));
 return v_id;
end $$;

create function fail_invoice_extraction(p_invoice_id uuid,p_run_id uuid,p_payload jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_id uuid; v_run processing_runs%rowtype;
begin
 select * into v_run from processing_runs where id=p_run_id and invoice_id=p_invoice_id for update;
 if not found or v_run.status <> 'RUNNING' then raise exception 'Extraction run is not active for invoice'; end if;
 insert into invoice_extractions(invoice_id,run_id,provider,model,prompt_version,schema_version,status,page_count,error_code,raw_response)
 values(p_invoice_id,p_run_id,coalesce(p_payload->>'provider','NVIDIA_NIM'),coalesce(p_payload->>'model','unknown'),coalesce(p_payload->>'promptVersion','invoice-extraction-v1'),coalesce(p_payload->>'schemaVersion','invoice-extraction-schema-v1'),'FAILED',greatest(1,coalesce((p_payload->>'pageCount')::integer,1)),p_payload->>'errorCode',p_payload->>'rawResponse') returning id into v_id;
 update processing_runs set status='FAILED',completed_at=now(),duration_ms=greatest(0,(extract(epoch from now()-started_at)*1000)::integer),error_code=p_payload->>'errorCode',error_message=p_payload->>'message' where id=p_run_id;
 update invoices set status='FAILED' where id=p_invoice_id;
 insert into agent_steps(run_id,step_number,step_type,name,status,output,error_message,started_at,completed_at)
 values(p_run_id,1,'AI','Invoice extraction','FAILED',jsonb_build_object('errorCode',p_payload->>'errorCode'),p_payload->>'message',now(),now());
 insert into audit_events(invoice_id,run_id,actor_type,event_type,description,metadata)
 values(p_invoice_id,p_run_id,'AGENT','INVOICE_EXTRACTION_FAILED','Invoice extraction failed',jsonb_build_object('error_code',p_payload->>'errorCode','extraction_id',v_id));
 return v_id;
end $$;

alter table invoice_extractions enable row level security;
revoke all on table invoice_extractions from anon,authenticated;
grant all on table invoice_extractions to service_role;
revoke all on function complete_invoice_extraction(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function fail_invoice_extraction(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function complete_invoice_extraction(uuid,uuid,jsonb) to service_role;
grant execute on function fail_invoice_extraction(uuid,uuid,jsonb) to service_role;
