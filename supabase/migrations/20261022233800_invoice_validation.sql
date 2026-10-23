-- Phase 03 stores immutable, versioned facts for the policy engine. All matching math remains in TypeScript.
create table invoice_validation_runs (
 id uuid primary key default gen_random_uuid(),
 invoice_id uuid not null references invoices(id),
 run_id uuid not null unique,
 extraction_id uuid references invoice_extractions(id),
 engine_version text not null check (length(trim(engine_version)) > 0),
 status text not null check (status in ('PASS','FAIL','INCOMPLETE','ERROR')),
 result jsonb not null check (jsonb_typeof(result) = 'object'),
 created_at timestamptz not null default now(),
 foreign key (run_id,invoice_id) references processing_runs(id,invoice_id)
);
create index invoice_validation_runs_invoice_created_idx on invoice_validation_runs(invoice_id,created_at desc);
create index invoice_validation_runs_status_idx on invoice_validation_runs(status,created_at desc);
alter table invoice_validation_runs enable row level security;
revoke all on table invoice_validation_runs from anon,authenticated;
grant all on table invoice_validation_runs to service_role;

create function reject_validation_mutation() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'invoice_validation_runs are append-only'; end $$;
create trigger invoice_validation_runs_immutable before update or delete on invoice_validation_runs
for each row execute function reject_validation_mutation();

create function start_invoice_validation_run(p_invoice_id uuid,p_engine_version text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from invoices where id=p_invoice_id) then raise exception 'Invoice not found'; end if;
 insert into processing_runs(invoice_id,status,started_at,agent_version,metadata)
 values(p_invoice_id,'RUNNING',now(),'matching-'||p_engine_version,jsonb_build_object('phase','MATCHING')) returning id into v_id;
 insert into audit_events(invoice_id,run_id,actor_type,event_type,description,metadata)
 values(p_invoice_id,v_id,'SYSTEM','VALIDATION_STARTED','Deterministic invoice validation started',jsonb_build_object('engine_version',p_engine_version));
 return v_id;
end $$;

create function complete_invoice_validation_run(p_invoice_id uuid,p_run_id uuid,p_result jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid; v_run processing_runs%rowtype; v_status text;
begin
 select * into v_run from processing_runs where id=p_run_id and invoice_id=p_invoice_id for update;
 if not found or v_run.status<>'RUNNING' or v_run.agent_version not like 'matching-%' then raise exception 'Validation run is not active'; end if;
 if p_result->>'invoiceId'<>p_invoice_id::text or p_result->>'engineVersion'<>substring(v_run.agent_version from 10) then raise exception 'Validation result identity mismatch'; end if;
 v_status:=p_result->>'status';
 if v_status not in ('PASS','FAIL','INCOMPLETE') or jsonb_typeof(p_result->'checks')<>'array' then raise exception 'Invalid validation result'; end if;
 insert into invoice_validation_runs(invoice_id,run_id,extraction_id,engine_version,status,result)
 values(p_invoice_id,p_run_id,(p_result->>'extractionId')::uuid,p_result->>'engineVersion',v_status,p_result) returning id into v_id;
 insert into agent_steps(run_id,step_number,step_type,name,status,output,started_at,completed_at)
 values(p_run_id,1,'MATCHING','Deterministic matching','COMPLETED',jsonb_build_object('vendor',p_result->'vendor','purchaseOrder',p_result->'purchaseOrder','lineMatches',p_result->'lineMatches'),now(),now()),
       (p_run_id,2,'VALIDATION','Financial checks completed','COMPLETED',jsonb_build_object('status',v_status,'summary',p_result->'summary','blockers',p_result->'blockers'),now(),now());
 update processing_runs set status='COMPLETED',completed_at=now(),duration_ms=greatest(0,(extract(epoch from now()-started_at)*1000)::integer),metadata=jsonb_build_object('phase','MATCHING','validation_id',v_id) where id=p_run_id;
 insert into audit_events(invoice_id,run_id,actor_type,event_type,description,metadata)
 values(p_invoice_id,p_run_id,'SYSTEM','VALIDATION_COMPLETED','Deterministic invoice validation completed',jsonb_build_object('validation_id',v_id,'status',v_status,'blockers',p_result->'blockers'));
 return v_id;
end $$;

create function fail_invoice_validation_run(p_invoice_id uuid,p_run_id uuid,p_error_code text,p_message text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid; v_run processing_runs%rowtype;
begin
 select * into v_run from processing_runs where id=p_run_id and invoice_id=p_invoice_id for update;
 if not found or v_run.status<>'RUNNING' or v_run.agent_version not like 'matching-%' then raise exception 'Validation run is not active'; end if;
 insert into invoice_validation_runs(invoice_id,run_id,engine_version,status,result)
 values(p_invoice_id,p_run_id,substring(v_run.agent_version from 10),'ERROR',jsonb_build_object('invoiceId',p_invoice_id,'status','ERROR','errorCode',p_error_code,'message',p_message)) returning id into v_id;
 update processing_runs set status='FAILED',completed_at=now(),duration_ms=greatest(0,(extract(epoch from now()-started_at)*1000)::integer),error_code=p_error_code,error_message=p_message,metadata=jsonb_build_object('phase','MATCHING','validation_id',v_id) where id=p_run_id;
 insert into audit_events(invoice_id,run_id,actor_type,event_type,description,metadata)
 values(p_invoice_id,p_run_id,'SYSTEM','VALIDATION_FAILED','Deterministic validation could not complete',jsonb_build_object('validation_id',v_id,'error_code',p_error_code));
 return v_id;
end $$;
revoke all on function start_invoice_validation_run(uuid,text) from public,anon,authenticated;
revoke all on function complete_invoice_validation_run(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function fail_invoice_validation_run(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function start_invoice_validation_run(uuid,text) to service_role;
grant execute on function complete_invoice_validation_run(uuid,uuid,jsonb) to service_role;
grant execute on function fail_invoice_validation_run(uuid,uuid,text,text) to service_role;
