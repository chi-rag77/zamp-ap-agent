-- Durable, one-step-at-a-time agent orchestration. Queue writes and run creation are atomic.
alter table agent_runs
  add column if not exists context jsonb not null default '{}'::jsonb,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists run_type text not null default 'FULL_PROCESSING'
    check (run_type in ('FULL_PROCESSING','REPROCESS','RETRY','MANUAL'));
alter table agent_runs drop constraint if exists agent_runs_final_decision_check;
alter table agent_runs add constraint agent_runs_final_decision_check
  check (final_decision in ('AUTO_APPROVED','AUTO_REJECTED','HUMAN_APPROVED','HUMAN_REJECTED','NEEDS_REVIEW','CANNOT_DECIDE'));
alter table action_idempotency drop constraint if exists action_idempotency_action_type_check;
alter table action_idempotency add constraint action_idempotency_action_type_check
  check (action_type in ('APPROVE','REJECT','CREATE_REVIEW','REQUEST_REVIEW','HUMAN_APPROVE','HUMAN_REJECT'));
alter table agent_actions drop constraint if exists agent_actions_action_type_check;
alter table agent_actions add constraint agent_actions_action_type_check
  check (action_type in ('APPROVE','REJECT','CREATE_REVIEW','REQUEST_REVIEW','HUMAN_APPROVE','HUMAN_REJECT'));

create table if not exists agent_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  job_type text not null default 'ADVANCE_RUN' check (job_type='ADVANCE_RUN'),
  step_key text not null,
  attempt integer not null default 0 check (attempt>=0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload)='object'),
  status text not null default 'QUEUED' check (status in ('QUEUED','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  available_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error_code text,
  last_error_message text,
  unique(run_id,step_key)
);
create index if not exists agent_jobs_claim_idx on agent_jobs(status,available_at,priority,created_at);
create index if not exists agent_jobs_run_idx on agent_jobs(run_id,created_at);
create index if not exists agent_runs_heartbeat_idx on agent_runs(status,last_heartbeat_at) where status='RUNNING';
alter table agent_jobs enable row level security;
revoke all on table agent_jobs from anon,authenticated;
grant all on table agent_jobs to service_role;

-- Return the existing active run under the invoice lock rather than creating duplicates.
create or replace function start_agent_run(p_invoice_id uuid,p_agent_version text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 select id into v_id from invoices where id=p_invoice_id and archived_at is null for update;
 if not found then raise exception 'INVOICE_NOT_PROCESSABLE';end if;
 if not exists(select 1 from invoices where id=p_invoice_id and status in ('RECEIVED','PROCESSING','NEEDS_REVIEW','FAILED')) then
  raise exception 'INVOICE_NOT_PROCESSABLE';
 end if;
 select id into v_id from agent_runs where invoice_id=p_invoice_id and mode='LIVE'
   and status in ('QUEUED','RUNNING','WAITING') order by created_at desc limit 1;
 if v_id is not null then return v_id;end if;
 insert into agent_runs(invoice_id,status,current_state,mode,agent_version,started_at,last_heartbeat_at,context)
 values(p_invoice_id,'QUEUED','RECEIVED','LIVE',p_agent_version,now(),now(),'{}'::jsonb) returning id into v_id;
 insert into agent_jobs(run_id,invoice_id,step_key,payload)
 values(v_id,p_invoice_id,'LOAD_INVOICE',jsonb_build_object('correlationId',v_id));
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description,metadata)
 values(p_invoice_id,v_id,'AGENT','AGENT_RUN_QUEUED','Agent run and durable job queued atomically',jsonb_build_object('agent_version',p_agent_version));
 return v_id;
end $$;

create or replace function claim_agent_job(p_lease_seconds integer default 150)
returns setof agent_jobs language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 if p_lease_seconds<10 or p_lease_seconds>600 then raise exception 'INVALID_LEASE';end if;
 select id into v_id from agent_jobs
 where (status='QUEUED' and available_at<=now()) or (status='PROCESSING' and lease_expires_at<now())
 order by case priority when 'HIGH' then 0 when 'NORMAL' then 1 else 2 end,available_at,created_at
 for update skip locked limit 1;
 if v_id is null then return;end if;
 return query update agent_jobs set status='PROCESSING',attempt=attempt+1,
   lease_expires_at=now()+make_interval(secs=>p_lease_seconds),last_error_code=null,last_error_message=null
   where id=v_id returning *;
 update agent_runs set status='RUNNING',started_at=coalesce(started_at,now()),last_heartbeat_at=now()
 where id=(select run_id from agent_jobs where id=v_id) and status='QUEUED';
end $$;

create function complete_agent_job(
 p_job_id uuid,p_context jsonb,p_state text,p_step_count integer,p_current_step text,
 p_run_status text,p_next_step text,p_final_decision text,p_summary text,p_reason_code text,
 p_action_executed text,p_verification_status text
) returns boolean language plpgsql security invoker set search_path=public as $$
declare v_job agent_jobs%rowtype;v_completed integer;
begin
 if jsonb_typeof(p_context)<>'object' or p_run_status not in ('RUNNING','WAITING','COMPLETED') then raise exception 'INVALID_CHECKPOINT';end if;
 update agent_jobs set status='COMPLETED',processed_at=now(),lease_expires_at=null
 where id=p_job_id and status='PROCESSING' returning * into v_job;
 if not found then return false;end if;
 update agent_runs set context=p_context,current_state=p_state,current_step=p_current_step,step_count=p_step_count,
   status=p_run_status,last_heartbeat_at=now(),
   final_decision=coalesce(p_final_decision,final_decision),summary=coalesce(p_summary,summary),
   reason_code=coalesce(p_reason_code,reason_code),action_executed=coalesce(p_action_executed,action_executed),
   verification_status=coalesce(p_verification_status,verification_status),
   completed_at=case when p_run_status='COMPLETED' then now() else null end,
   duration_ms=case when p_run_status='COMPLETED' then greatest(0,(extract(epoch from now()-started_at)*1000)::integer) else duration_ms end
 where id=v_job.run_id and status in ('RUNNING','QUEUED');
 get diagnostics v_completed=row_count;
 if v_completed=0 then raise exception 'AGENT_RUN_NOT_ACTIVE';end if;
 if p_run_status='RUNNING' and p_next_step is not null then
  insert into agent_jobs(run_id,invoice_id,step_key,payload,priority)
  values(v_job.run_id,v_job.invoice_id,p_next_step,jsonb_build_object('correlationId',v_job.run_id),v_job.priority)
  on conflict(run_id,step_key) do update set status='QUEUED',available_at=now(),lease_expires_at=null,processed_at=null;
 end if;
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description,metadata)
 values(v_job.invoice_id,v_job.run_id,'AGENT',case when p_run_status='COMPLETED' then 'AGENT_RUN_COMPLETED' when p_run_status='WAITING' then 'AGENT_RUN_WAITING' else 'AGENT_STEP_CHECKPOINTED' end,
   coalesce(p_summary,'Agent step checkpoint saved'),jsonb_build_object('job_id',p_job_id,'step',v_job.step_key,'state',p_state,'status',p_run_status,'decision',p_final_decision,'reason_code',p_reason_code));
 return true;
end $$;

create function fail_agent_job(p_job_id uuid,p_error_code text,p_error_message text,p_retryable boolean,p_delay_seconds integer)
returns text language plpgsql security invoker set search_path=public as $$
declare v_job agent_jobs%rowtype;v_run agent_runs%rowtype;v_result text;
begin
 select * into v_job from agent_jobs where id=p_job_id for update;
 if not found or v_job.status<>'PROCESSING' then return 'STALE';end if;
 select * into v_run from agent_runs where id=v_job.run_id for update;
 if p_retryable and v_job.attempt<v_job.max_attempts and v_run.status not in ('CANCELLED','COMPLETED') then
  update agent_jobs set status='QUEUED',available_at=now()+make_interval(secs=>greatest(0,least(p_delay_seconds,3600))),lease_expires_at=null,last_error_code=p_error_code,last_error_message=left(p_error_message,2000) where id=p_job_id;
  update agent_runs set status='RUNNING',last_heartbeat_at=now(),retry_count=retry_count+1 where id=v_job.run_id;
  return 'REQUEUED';
 end if;
 update agent_jobs set status='FAILED',processed_at=now(),lease_expires_at=null,last_error_code=p_error_code,last_error_message=left(p_error_message,2000) where id=p_job_id;
 update agent_runs set status='FAILED',current_state='FAILED',current_step=null,error_code=p_error_code,error_message=left(p_error_message,2000),
   final_decision='CANNOT_DECIDE',completed_at=now(),last_heartbeat_at=now(),duration_ms=greatest(0,(extract(epoch from now()-started_at)*1000)::integer)
 where id=v_job.run_id and status not in ('COMPLETED','CANCELLED');
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description,metadata)
 values(v_job.invoice_id,v_job.run_id,'AGENT','AGENT_RUN_FAILED','Agent job exhausted retries or failed permanently',jsonb_build_object('job_id',p_job_id,'step',v_job.step_key,'error_code',p_error_code,'retryable',p_retryable));
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description,metadata)
 values(v_job.invoice_id,v_job.run_id,'SYSTEM','SYSTEM_PROCESSING_FAILURE','Agent processing exhausted retries; no financial action was authorized',jsonb_build_object('job_id',p_job_id,'step',v_job.step_key,'error_code',p_error_code,'severity','HIGH'));
 return 'FAILED';
end $$;

create function resolve_agent_human_decision(p_run_id uuid,p_decision text,p_reason text,p_actor text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_run agent_runs%rowtype;v_case review_cases%rowtype;v_invoice invoices%rowtype;v_previous action_idempotency%rowtype;v_action text;v_decision text;v_status invoice_status;v_result jsonb;v_key text;
begin
 if p_decision not in ('APPROVE','REJECT') or length(trim(coalesce(p_reason,'')))<3 then raise exception 'INVALID_HUMAN_DECISION';end if;
 select * into v_run from agent_runs where id=p_run_id for update;
 if not found then raise exception 'AGENT_RUN_NOT_FOUND';end if;
 v_action:=case p_decision when 'APPROVE' then 'HUMAN_APPROVE' else 'HUMAN_REJECT' end;
 v_decision:=case p_decision when 'APPROVE' then 'HUMAN_APPROVED' else 'HUMAN_REJECTED' end;
 v_key:=lower(v_action)||':'||v_run.invoice_id::text||':'||p_run_id::text;
 select * into v_previous from action_idempotency where idempotency_key=v_key;
 if found then
  if v_previous.action_type<>v_action then raise exception 'DUPLICATE_ACTION';end if;
  if v_previous.status='COMPLETED' then return v_previous.result;end if;
  raise exception 'DUPLICATE_ACTION';
 end if;
 if v_run.status<>'WAITING' then raise exception 'AGENT_RUN_NOT_WAITING';end if;
 select * into v_case from review_cases where agent_run_id=p_run_id and status in ('OPEN','IN_PROGRESS') for update;
 if not found then raise exception 'REVIEW_CASE_NOT_OPEN';end if;
 select * into v_invoice from invoices where id=v_run.invoice_id for update;
 if not found or v_invoice.status<>'NEEDS_REVIEW' then raise exception 'INVOICE_NOT_AWAITING_REVIEW';end if;
 v_status:=case p_decision when 'APPROVE' then 'APPROVED'::invoice_status else 'REJECTED'::invoice_status end;
 insert into action_idempotency(idempotency_key,run_id,invoice_id,action_type,status)
 values(v_key,p_run_id,v_invoice.id,v_action,'COMPLETED');
 update invoices set status=v_status,decision=v_decision::invoice_decision,decision_reason=left(trim(p_reason),2000),processed_at=now() where id=v_invoice.id;
 update review_cases set status='RESOLVED',resolution=left(trim(p_reason),2000),resolved_at=now(),updated_at=now() where id=v_case.id;
 v_result:=jsonb_build_object('invoiceId',v_invoice.id,'reviewCaseId',v_case.id,'decision',v_decision,'status',v_status);
 update action_idempotency set result=v_result,completed_at=now() where idempotency_key=v_key;
 insert into agent_actions(run_id,invoice_id,action_type,status,idempotency_key,guard_result,result,executed_at,verified_at)
 values(p_run_id,v_invoice.id,v_action,'VERIFIED',v_key,jsonb_build_object('allowed',true,'actor',p_actor),v_result,now(),now());
 update agent_runs set status='COMPLETED',current_state='COMPLETED',current_step=null,final_decision=v_decision,
  summary='Human decision recorded: '||left(trim(p_reason),1000),reason_code='HUMAN_DECISION',action_executed=v_action,
  verification_status='VERIFIED',completed_at=now(),last_heartbeat_at=now()
 where id=p_run_id;
 insert into audit_events(invoice_id,agent_run_id,actor_type,actor_id,event_type,description,metadata)
 values(v_invoice.id,p_run_id,'HUMAN',p_actor,'HUMAN_REVIEW_RESOLVED',left(trim(p_reason),2000),jsonb_build_object('decision',v_decision,'original_decision',v_run.final_decision,'review_case_id',v_case.id));
 return v_result;
end $$;

create function recover_stale_agent_runs(p_stale_seconds integer default 180)
returns integer language plpgsql security invoker set search_path=public as $$
declare v_count integer;
begin
 if p_stale_seconds<30 or p_stale_seconds>86400 then raise exception 'INVALID_STALE_WINDOW';end if;
 with stale as (
   select r.id,r.invoice_id,coalesce(nullif(r.current_step,''),'LOAD_INVOICE') as step_key
   from agent_runs r where r.status='RUNNING' and coalesce(r.last_heartbeat_at,r.started_at)<now()-make_interval(secs=>p_stale_seconds)
   and not exists(select 1 from agent_jobs j where j.run_id=r.id and j.status='PROCESSING' and j.lease_expires_at>now())
   for update skip locked
 ), requeued as (
   insert into agent_jobs(run_id,invoice_id,step_key,payload)
   select id,invoice_id,step_key,jsonb_build_object('recovered',true) from stale
   on conflict(run_id,step_key) do update set status='QUEUED',available_at=now(),lease_expires_at=null
   where agent_jobs.status in ('FAILED','CANCELLED')
   returning run_id
 )
 update agent_runs r set last_heartbeat_at=now() where r.id in (select id from stale);
 get diagnostics v_count=row_count;return v_count;
end $$;

create function cancel_agent_run(p_run_id uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
declare v_run agent_runs%rowtype;
begin
 select * into v_run from agent_runs where id=p_run_id for update;
 if not found or v_run.status not in ('QUEUED','RUNNING') or v_run.current_state in ('EXECUTING','VERIFYING') then return false;end if;
 update agent_runs set status='CANCELLED',current_state='CANCELLED',current_step=null,completed_at=now(),last_heartbeat_at=now()
 where id=p_run_id;
 update agent_jobs set status='CANCELLED',processed_at=now(),lease_expires_at=null
 where run_id=p_run_id and status='QUEUED';
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description,metadata)
 values(v_run.invoice_id,p_run_id,'HUMAN','AGENT_RUN_CANCELLED','Agent run cancelled before an action began',jsonb_build_object('previous_state',v_run.current_state));
 return true;
end $$;

revoke all on function claim_agent_job(integer) from public,anon,authenticated;
grant execute on function claim_agent_job(integer) to service_role;
revoke all on function complete_agent_job(uuid,jsonb,text,integer,text,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function complete_agent_job(uuid,jsonb,text,integer,text,text,text,text,text,text,text,text) to service_role;
revoke all on function fail_agent_job(uuid,text,text,boolean,integer) from public,anon,authenticated;
grant execute on function fail_agent_job(uuid,text,text,boolean,integer) to service_role;
revoke all on function recover_stale_agent_runs(integer) from public,anon,authenticated;
grant execute on function recover_stale_agent_runs(integer) to service_role;
revoke all on function start_agent_run(uuid,text) from public,anon,authenticated;
grant execute on function start_agent_run(uuid,text) to service_role;
revoke all on function resolve_agent_human_decision(uuid,text,text,text) from public,anon,authenticated;
grant execute on function resolve_agent_human_decision(uuid,text,text,text) to service_role;
revoke all on function cancel_agent_run(uuid) from public,anon,authenticated;
grant execute on function cancel_agent_run(uuid) to service_role;
