-- Phase 9: persist concise execution events and important workspace notifications.
-- agent_runs / agent_run_steps remain the canonical execution records.
alter table agent_runs add column if not exists error_class text check (error_class is null or error_class in (
  'EXTRACTION_ERROR','VENDOR_RESOLUTION_ERROR','PO_RESOLUTION_ERROR','LINE_MATCHING_ERROR',
  'VALIDATION_ERROR','POLICY_ERROR','ACTION_ERROR','VERIFICATION_ERROR','SYSTEM_ERROR'
));
alter table agent_run_steps add column if not exists error_class text check (error_class is null or error_class in (
  'EXTRACTION_ERROR','VENDOR_RESOLUTION_ERROR','PO_RESOLUTION_ERROR','LINE_MATCHING_ERROR',
  'VALIDATION_ERROR','POLICY_ERROR','ACTION_ERROR','VERIFICATION_ERROR','SYSTEM_ERROR'
));

create or replace function phase9_classify_error(p_code text) returns text language sql immutable as $$
  select case when p_code is null then null
    when upper(p_code) like '%VERIFICATION%' then 'VERIFICATION_ERROR'
    when upper(p_code) like '%EXTRACTION%' or upper(p_code) like '%MODEL%' or upper(p_code) like '%VISION%' then 'EXTRACTION_ERROR'
    when upper(p_code) like '%VENDOR%' then 'VENDOR_RESOLUTION_ERROR'
    when upper(p_code) like '%PURCHASE_ORDER%' or upper(p_code) like 'PO\_%' escape '\' then 'PO_RESOLUTION_ERROR'
    when upper(p_code) like '%MATCH%' then 'LINE_MATCHING_ERROR'
    when upper(p_code) like '%VALIDATION%' then 'VALIDATION_ERROR'
    when upper(p_code) like '%POLICY%' or upper(p_code) like '%DECISION%' then 'POLICY_ERROR'
    when upper(p_code) like '%ACTION%' or upper(p_code) like '%APPROVAL%' then 'ACTION_ERROR'
    else 'SYSTEM_ERROR' end
$$;
create or replace function phase9_set_run_error_class() returns trigger language plpgsql as $$
begin if new.error_code is not null then new.error_class:=phase9_classify_error(new.error_code);else new.error_class:=null;end if;return new;end $$;
create trigger agent_runs_error_class before insert or update of error_code on agent_runs for each row execute function phase9_set_run_error_class();
create or replace function phase9_set_step_error_class() returns trigger language plpgsql as $$
begin if new.error_code is not null then new.error_class:=phase9_classify_error(new.error_code);else new.error_class:=null;end if;return new;end $$;
create trigger agent_run_steps_error_class before insert or update of error_code on agent_run_steps for each row execute function phase9_set_step_error_class();

-- Normalize the execution state vocabulary while preserving the existing step history.
alter table agent_run_steps drop constraint if exists agent_run_steps_status_check;
update agent_run_steps set status='RUNNING' where status='STARTED';
alter table agent_run_steps add constraint agent_run_steps_status_check
  check (status in ('PENDING','STARTED','RUNNING','COMPLETED','FAILED','SKIPPED'));

create or replace function phase9_guard_run_transition() returns trigger language plpgsql as $$
begin
  if new.status is not distinct from old.status then return new;end if;
  if not (
    (old.status='QUEUED' and new.status in ('RUNNING','CANCELLED','FAILED')) or
    (old.status='RUNNING' and new.status in ('WAITING','COMPLETED','FAILED','CANCELLED')) or
    (old.status='WAITING' and new.status in ('COMPLETED','CANCELLED'))
  ) then raise exception 'INVALID_RUN_STATUS_TRANSITION: % -> %',old.status,new.status using errcode='23514';end if;
  return new;
end $$;
create trigger agent_runs_state_transition before update of status on agent_runs for each row execute function phase9_guard_run_transition();

create or replace function phase9_guard_step_transition() returns trigger language plpgsql as $$
begin
  if new.status is not distinct from old.status then return new;end if;
  if not ((old.status='PENDING' and new.status='RUNNING') or
          (old.status in ('STARTED','RUNNING') and new.status in ('COMPLETED','FAILED','SKIPPED'))) then
    raise exception 'INVALID_STEP_STATUS_TRANSITION: % -> %',old.status,new.status using errcode='23514';
  end if;
  return new;
end $$;
create trigger agent_run_steps_state_transition before update of status on agent_run_steps for each row execute function phase9_guard_step_transition();

-- Keep the invoice lock and active-run deduplication from Phase 7, but record retry intent.
drop function if exists start_agent_run(uuid,text);
create function start_agent_run(p_invoice_id uuid,p_agent_version text,p_run_type text default 'FULL_PROCESSING')
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 if p_run_type not in ('FULL_PROCESSING','REPROCESS','RETRY','MANUAL') then raise exception 'INVALID_RUN_TYPE';end if;
 select id into v_id from invoices where id=p_invoice_id and archived_at is null for update;
 if not found then raise exception 'INVOICE_NOT_PROCESSABLE';end if;
 if not exists(select 1 from invoices where id=p_invoice_id and status in ('RECEIVED','PROCESSING','NEEDS_REVIEW','FAILED')) then
  raise exception 'INVOICE_NOT_PROCESSABLE';
 end if;
 select id into v_id from agent_runs where invoice_id=p_invoice_id and mode='LIVE'
   and status in ('QUEUED','RUNNING','WAITING') order by created_at desc limit 1;
 if v_id is not null then return v_id;end if;
 insert into agent_runs(invoice_id,status,current_state,mode,agent_version,run_type,started_at,last_heartbeat_at,context)
 values(p_invoice_id,'QUEUED','RECEIVED','LIVE',p_agent_version,p_run_type,now(),now(),'{}'::jsonb) returning id into v_id;
 insert into agent_jobs(run_id,invoice_id,step_key,payload)
 values(v_id,p_invoice_id,'LOAD_INVOICE',jsonb_build_object('correlationId',v_id));
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description,metadata)
 values(p_invoice_id,v_id,'AGENT','AGENT_RUN_QUEUED','Agent run and durable job queued atomically',jsonb_build_object('agent_version',p_agent_version,'run_type',p_run_type));
 return v_id;
end $$;
revoke all on function start_agent_run(uuid,text,text) from public,anon,authenticated;
grant execute on function start_agent_run(uuid,text,text) to service_role;
-- Preserve compatibility for already-running application instances during rolling deploys.
create function start_agent_run(p_invoice_id uuid,p_agent_version text)
returns uuid language sql security invoker set search_path=public as $$
  select start_agent_run(p_invoice_id,p_agent_version,'FULL_PROCESSING')
$$;
revoke all on function start_agent_run(uuid,text) from public,anon,authenticated;
grant execute on function start_agent_run(uuid,text) to service_role;

create table processing_events (
  sequence bigint generated always as identity unique,
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  event_type text not null check (event_type in (
    'EMAIL_RECEIVED','ATTACHMENT_DISCOVERED','ATTACHMENT_DOWNLOADED','DOCUMENT_STORED','INVOICE_CREATED',
    'RUN_QUEUED','RUN_STARTED','RUN_UPDATED','RUN_COMPLETED','RUN_FAILED','RUN_RETRYING',
    'EXTRACTION_STARTED','EXTRACTION_COMPLETED','EXTRACTION_FAILED',
    'VENDOR_RESOLUTION_STARTED','VENDOR_RESOLVED','VENDOR_RESOLUTION_FAILED',
    'PO_RESOLUTION_STARTED','PO_RESOLVED','PO_RESOLUTION_FAILED',
    'LINE_MATCHING_STARTED','LINE_MATCHING_COMPLETED','LINE_MATCHING_FAILED',
    'VALIDATION_STARTED','VALIDATION_COMPLETED','VALIDATION_FAILED',
    'POLICY_EVALUATION_STARTED','POLICY_EVALUATED','POLICY_EVALUATION_FAILED',
    'DECISION_GENERATED','REVIEW_REQUIRED','ACTION_STARTED','ACTION_COMPLETED','ACTION_FAILED',
    'ACTION_VERIFICATION_STARTED','ACTION_VERIFIED','ACTION_VERIFICATION_FAILED',
    'HUMAN_REVIEW_STARTED','HUMAN_APPROVED','HUMAN_REJECTED','HUMAN_OVERRIDE',
    'STEP_STARTED','STEP_COMPLETED','STEP_FAILED','INVOICE_UPDATED','REVIEW_UPDATED'
  )),
  step_name text,
  status text not null check (status in ('PENDING','RUNNING','COMPLETED','FAILED')),
  message text not null check (length(message) between 1 and 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now()
);
create index processing_events_run_created on processing_events(run_id,created_at,id);
create index processing_events_invoice_created on processing_events(invoice_id,created_at,id);
create index processing_events_type on processing_events(event_type);
create index processing_events_created on processing_events(created_at desc);
create index processing_events_sequence on processing_events(sequence);
alter table processing_events enable row level security;
revoke all on table processing_events from anon,authenticated;
grant select,insert on table processing_events to service_role;
grant usage,select on sequence processing_events_sequence_seq to service_role;

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('NEW_INVOICE','REVIEW_REQUIRED','AUTO_APPROVED','AUTO_REJECTED','RUN_FAILED','ACTION_FAILED','VERIFICATION_FAILED')),
  title text not null check (length(title) between 1 and 160),
  message text not null check (length(message) between 1 and 500),
  invoice_id uuid references invoices(id) on delete cascade,
  run_id uuid references agent_runs(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  source_event_id uuid not null unique references processing_events(id) on delete cascade
);
create index notifications_workspace_created on notifications(created_at desc);
create index notifications_unread_created on notifications(created_at desc) where read_at is null;
alter table notifications enable row level security;
revoke all on table notifications from anon,authenticated;
grant select,insert,update on table notifications to service_role;

create or replace function phase9_event(
  p_run_id uuid,p_invoice_id uuid,p_type text,p_step_name text,p_status text,p_message text,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid;v_payload jsonb;
begin
  insert into processing_events(run_id,invoice_id,event_type,step_name,status,message,metadata)
  values(p_run_id,p_invoice_id,p_type,p_step_name,p_status,left(p_message,500),coalesce(p_metadata,'{}'::jsonb)) returning id into v_id;
  v_payload:=jsonb_build_object('id',v_id,'type',p_type,'runId',p_run_id,'invoiceId',p_invoice_id,'stepName',p_step_name,'status',p_status,'message',left(p_message,500),'timestamp',now(),'metadata',coalesce(p_metadata,'{}'::jsonb));
  -- Broadcast only compact identifiers and status summaries. Database writes remain authoritative.
  begin
    if p_run_id is not null then perform realtime.send(v_payload,'processing_event','run:'||p_run_id::text,true); end if;
    perform realtime.send(v_payload,'processing_event','invoice:'||p_invoice_id::text,true);
    if p_type in ('RUN_QUEUED','RUN_STARTED','RUN_COMPLETED','RUN_FAILED','RUN_RETRYING','REVIEW_REQUIRED','DECISION_GENERATED','ACTION_FAILED') then
      perform realtime.send(v_payload,'processing_event','agent:activity',true);
      perform realtime.send(v_payload,'processing_event','dashboard:metrics',true);
    end if;
  exception when others then
    raise log 'Phase 9 Broadcast delivery unavailable; persisted event % remains authoritative',v_id;
  end;
  return v_id;
end $$;
revoke all on function phase9_event(uuid,uuid,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function phase9_event(uuid,uuid,text,text,text,text,jsonb) to service_role;

create or replace function phase9_create_notification() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_type text;v_title text;v_message text;
begin
  v_type:=case
    when new.event_type='INVOICE_CREATED' then 'NEW_INVOICE'
    when new.event_type='REVIEW_REQUIRED' then 'REVIEW_REQUIRED'
    when new.event_type in ('DECISION_GENERATED','RUN_COMPLETED') and new.metadata->>'decision'='AUTO_APPROVED' then 'AUTO_APPROVED'
    when new.event_type in ('DECISION_GENERATED','RUN_COMPLETED') and new.metadata->>'decision'='AUTO_REJECTED' then 'AUTO_REJECTED'
    when new.event_type='RUN_FAILED' then 'RUN_FAILED'
    when new.event_type='ACTION_FAILED' then 'ACTION_FAILED'
    when new.event_type='ACTION_VERIFICATION_FAILED' then 'VERIFICATION_FAILED'
    else null end;
  if v_type is null then return new; end if;
  v_title:=case v_type when 'NEW_INVOICE' then 'New invoice received' when 'REVIEW_REQUIRED' then 'Invoice needs review'
    when 'AUTO_APPROVED' then 'Invoice approved' when 'AUTO_REJECTED' then 'Invoice rejected'
    when 'RUN_FAILED' then 'Agent processing failed' when 'ACTION_FAILED' then 'Invoice action failed'
    else 'Action verification failed' end;
  v_message:=new.message;
  insert into notifications(type,title,message,invoice_id,run_id,source_event_id)
  values(v_type,v_title,v_message,new.invoice_id,new.run_id,new.id) on conflict(source_event_id) do nothing;
  return new;
end $$;
create trigger processing_events_notification after insert on processing_events for each row execute function phase9_create_notification();

create or replace function phase9_capture_run() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_type text;v_status text;v_message text;v_meta jsonb:='{}'::jsonb;
begin
  if tg_op='INSERT' then
    v_type:=case when new.run_type='RETRY' then 'RUN_RETRYING' when new.status='QUEUED' then 'RUN_QUEUED' else 'RUN_STARTED' end;
    v_status:=case when new.status='QUEUED' then 'PENDING' else 'RUNNING' end;
    v_message:=case when new.run_type='RETRY' then 'Agent retry queued' when new.status='QUEUED' then 'Agent run queued' else 'Agent run started' end;
  elsif new.status is distinct from old.status or new.retry_count is distinct from old.retry_count
      or new.current_state is distinct from old.current_state or new.current_step is distinct from old.current_step
      or new.final_decision is distinct from old.final_decision then
    v_type:=case when new.retry_count>old.retry_count then 'RUN_RETRYING'
      when new.status='RUNNING' and old.status='QUEUED' then 'RUN_STARTED'
      when new.status='COMPLETED' then 'RUN_COMPLETED'
      when new.status='FAILED' then 'RUN_FAILED'
      when new.status='WAITING' and new.final_decision='NEEDS_REVIEW' then 'REVIEW_REQUIRED'
      when new.final_decision is distinct from old.final_decision and new.final_decision is not null then 'DECISION_GENERATED'
      else 'RUN_UPDATED' end;
    v_status:=case when new.status in ('COMPLETED','FAILED','CANCELLED') then 'COMPLETED' when new.status in ('QUEUED','WAITING') then 'PENDING' else 'RUNNING' end;
    v_message:=case v_type when 'RUN_RETRYING' then 'Agent run retry scheduled' when 'RUN_COMPLETED' then 'Agent run completed'
      when 'RUN_FAILED' then 'Agent run failed' when 'REVIEW_REQUIRED' then 'Invoice requires human review'
      when 'DECISION_GENERATED' then 'A policy decision was recorded' when 'RUN_UPDATED' then 'Agent run state updated'
      else 'Agent run started' end;
    if new.error_code is not null then v_meta:=jsonb_build_object('errorCode',new.error_code,'errorClass',case
      when new.error_code like '%EXTRACTION%' then 'EXTRACTION_ERROR'
      when new.error_code like '%VENDOR%' then 'VENDOR_RESOLUTION_ERROR'
      when new.error_code like '%PO_%' or new.error_code like '%PURCHASE_ORDER%' then 'PO_RESOLUTION_ERROR'
      when new.error_code like '%MATCH%' then 'LINE_MATCHING_ERROR'
      when new.error_code like '%VALIDATION%' then 'VALIDATION_ERROR'
      when new.error_code like '%POLICY%' then 'POLICY_ERROR'
      when new.error_code like '%ACTION%' then 'ACTION_ERROR'
      when new.error_code like '%VERIFICATION%' then 'VERIFICATION_ERROR' else 'SYSTEM_ERROR' end); end if;
    if new.final_decision is distinct from old.final_decision and new.final_decision is not null then v_meta:=v_meta||jsonb_build_object('decision',new.final_decision); end if;
  else return new; end if;
  perform phase9_event(new.id,new.invoice_id,v_type,new.current_step,v_status,v_message,v_meta);
  return new;
end $$;
create trigger agent_runs_processing_event after insert or update on agent_runs for each row execute function phase9_capture_run();

create or replace function phase9_capture_step() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_type text;v_status text;v_name text;v_run agent_runs%rowtype;v_code text;
begin
  select * into v_run from agent_runs where id=new.run_id;
  if not found then return new; end if;
  v_name:=coalesce(new.tool_name,new.name);
  v_code:=upper(coalesce(new.tool_name,new.name,''));
  if tg_op='INSERT' then v_status:='RUNNING';else
    if new.status is not distinct from old.status and new.error_code is not distinct from old.error_code then return new;end if;
    v_status:=case when new.status='FAILED' then 'FAILED' when new.status in ('COMPLETED','SKIPPED') then 'COMPLETED' else 'RUNNING' end;
  end if;
  v_type:=case
    when v_code like '%EXTRACT%' then case when v_status='FAILED' then 'EXTRACTION_FAILED' when v_status='COMPLETED' then 'EXTRACTION_COMPLETED' else 'EXTRACTION_STARTED' end
    when v_code like '%VENDOR%' then case when v_status='FAILED' then 'VENDOR_RESOLUTION_FAILED' when v_status='COMPLETED' then 'VENDOR_RESOLVED' else 'VENDOR_RESOLUTION_STARTED' end
    when v_code like '%PO%' or v_code like '%PURCHASE_ORDER%' then case when v_status='FAILED' then 'PO_RESOLUTION_FAILED' when v_status='COMPLETED' then 'PO_RESOLVED' else 'PO_RESOLUTION_STARTED' end
    when v_code like '%MATCH%' or v_code like '%VALIDATE%' then case when v_status='FAILED' then 'VALIDATION_FAILED' when v_status='COMPLETED' then 'VALIDATION_COMPLETED' else 'VALIDATION_STARTED' end
    when v_code like '%POLICY%' or v_code like '%DECISION%' then case when v_status='FAILED' then 'POLICY_EVALUATION_FAILED' when v_status='COMPLETED' then 'POLICY_EVALUATED' else 'POLICY_EVALUATION_STARTED' end
    when v_code like '%VERIFY%' then case when v_status='FAILED' then 'ACTION_VERIFICATION_FAILED' when v_status='COMPLETED' then 'ACTION_VERIFIED' else 'ACTION_VERIFICATION_STARTED' end
    when v_code like '%ACTION%' or v_code like '%APPROVE%' or v_code like '%REJECT%' then case when v_status='FAILED' then 'ACTION_FAILED' when v_status='COMPLETED' then 'ACTION_COMPLETED' else 'ACTION_STARTED' end
    else case when v_status='FAILED' then 'STEP_FAILED' when v_status='COMPLETED' then 'STEP_COMPLETED' else 'STEP_STARTED' end end;
  perform phase9_event(new.run_id,v_run.invoice_id,v_type,v_name,v_status,
    case when v_status='FAILED' then 'Processing step failed' when v_status='COMPLETED' then 'Processing step completed' else 'Processing step started' end,
    jsonb_strip_nulls(jsonb_build_object('stepNumber',new.step_number,'durationMs',new.duration_ms,'errorCode',new.error_code)));
  return new;
end $$;
create trigger agent_run_steps_processing_event after insert or update on agent_run_steps for each row execute function phase9_capture_step();

create or replace function phase9_capture_invoice() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_type text;v_status text;v_meta jsonb:='{}'::jsonb;v_msg text;
begin
  if tg_op='INSERT' then v_type:='INVOICE_CREATED';v_status:='PENDING';v_msg:='Invoice created from intake';
  elsif new.status is distinct from old.status or new.decision is distinct from old.decision then
    v_type:=case when new.status='NEEDS_REVIEW' and old.status is distinct from 'NEEDS_REVIEW' then 'REVIEW_REQUIRED' else 'INVOICE_UPDATED' end;
    v_status:=case when new.status in ('APPROVED','REJECTED') then 'COMPLETED' when new.status='FAILED' then 'FAILED' else 'RUNNING' end;
    v_msg:=case when v_type='REVIEW_REQUIRED' then 'Invoice requires human review' else 'Invoice state updated' end;
    if new.decision is not null then v_meta:=jsonb_build_object('decision',new.decision::text);end if;
  else return new;end if;
  perform phase9_event(null,new.id,v_type,null,v_status,v_msg,v_meta);return new;
end $$;
create trigger invoices_processing_event after insert or update on invoices for each row execute function phase9_capture_invoice();

create or replace function phase9_capture_review() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_run uuid;v_type text;v_status text;
begin
  v_run:=coalesce(new.agent_run_id,new.run_id);
  if tg_op='INSERT' then return new;
  elsif new.status is distinct from old.status then v_type:='REVIEW_UPDATED';v_status:=case when new.status='RESOLVED' then 'COMPLETED' else 'RUNNING' end;
  else return new;end if;
  perform phase9_event(v_run,new.invoice_id,v_type,'Human review',v_status,
    case when v_type='REVIEW_REQUIRED' then 'Invoice requires human review' else 'Human review state updated' end,
    jsonb_strip_nulls(jsonb_build_object('reasonCode',new.reason_code::text,'reviewStatus',new.status::text)));
  return new;
end $$;
create trigger review_cases_processing_event after insert or update on review_cases for each row execute function phase9_capture_review();

create or replace function phase9_capture_action() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_type text;v_status text;
begin
  if tg_op='UPDATE' and new.status is not distinct from old.status then return new;end if;
  v_type:=case when new.status='FAILED' then 'ACTION_FAILED' when new.status='VERIFIED' then 'ACTION_VERIFIED'
    when new.status='EXECUTED' then 'ACTION_COMPLETED' else 'ACTION_STARTED' end;
  v_status:=case when new.status='FAILED' then 'FAILED' when new.status in ('EXECUTED','VERIFIED') then 'COMPLETED' else 'RUNNING' end;
  perform phase9_event(new.run_id,new.invoice_id,v_type,new.action_type,v_status,
    case v_type when 'ACTION_FAILED' then 'Guarded invoice action failed' when 'ACTION_VERIFIED' then 'Invoice action was verified'
      when 'ACTION_COMPLETED' then 'Invoice action completed' else 'Guarded invoice action started' end,
    jsonb_strip_nulls(jsonb_build_object('actionType',new.action_type,'errorCode',new.error_code)));
  return new;
end $$;
create trigger agent_actions_processing_event after insert or update on agent_actions for each row execute function phase9_capture_action();

-- Shared protected-workspace notifications are server-only; there is no Supabase user session in this app.
-- Vercel Workspace Protection remains the user access boundary for the web UI and these APIs.
