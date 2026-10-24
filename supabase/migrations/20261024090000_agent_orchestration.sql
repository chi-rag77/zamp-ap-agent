-- Phase 5. Agent decisions stay immutable; mutations are serialized and checked in Postgres.
create table agent_runs (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id),
 status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','WAITING','COMPLETED','FAILED','CANCELLED')),
 current_state text not null default 'RECEIVED', current_step text,
 mode text not null default 'LIVE' check (mode in ('LIVE','SIMULATION')),
 agent_version text not null, extraction_version text, matching_engine_version text, policy_version text,
 started_at timestamptz not null default now(), completed_at timestamptz, duration_ms integer check(duration_ms>=0),
 retry_count integer not null default 0 check(retry_count>=0), step_count integer not null default 0 check(step_count>=0),
 final_decision text check(final_decision in ('AUTO_APPROVED','AUTO_REJECTED','NEEDS_REVIEW','CANNOT_DECIDE')),
 summary text, error_code text, error_message text, verification_status text check(verification_status in ('VERIFIED','FAILED','NOT_APPLICABLE')),
 action_executed text, created_at timestamptz not null default now(),
 unique(id,invoice_id)
);
create unique index agent_runs_one_active_invoice on agent_runs(invoice_id) where status in ('QUEUED','RUNNING','WAITING') and mode='LIVE';
create index agent_runs_invoice_created on agent_runs(invoice_id,created_at desc);
create index agent_runs_status_created on agent_runs(status,created_at desc);

-- Existing agent_steps belongs to Phase 1 processing_runs; link Phase 5 runs independently.
create table agent_run_steps (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references agent_runs(id),
 step_number integer not null check(step_number>0), step_type text not null check(step_type in ('INITIALIZE','READ','AI','VALIDATION','POLICY','ACTION','VERIFICATION','ERROR')),
 name text not null, tool_name text, status text not null check(status in ('STARTED','COMPLETED','FAILED','SKIPPED')),
 input jsonb, output jsonb, duration_ms integer check(duration_ms>=0), error_code text,
 started_at timestamptz not null default now(), completed_at timestamptz,
 unique(run_id,step_number)
);
create index agent_run_steps_run on agent_run_steps(run_id,step_number);

create table agent_run_decisions (
 agent_run_id uuid primary key references agent_runs(id), decision_id uuid not null unique references agent_decisions(id),
 validation_run_id uuid not null references invoice_validation_runs(id), created_at timestamptz not null default now()
);

create table action_idempotency (
 id uuid primary key default gen_random_uuid(), idempotency_key text not null unique,
 run_id uuid not null references agent_runs(id), invoice_id uuid not null references invoices(id),
 action_type text not null check(action_type in ('APPROVE','REJECT','CREATE_REVIEW','REQUEST_REVIEW')),
 status text not null check(status in ('STARTED','COMPLETED','FAILED')),
 result jsonb, created_at timestamptz not null default now(), completed_at timestamptz
);
create index action_idempotency_run on action_idempotency(run_id);

create table agent_actions (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references agent_runs(id), invoice_id uuid not null references invoices(id),
 action_type text not null check(action_type in ('APPROVE','REJECT','CREATE_REVIEW','REQUEST_REVIEW')),
 status text not null check(status in ('REQUESTED','GUARDED','EXECUTING','EXECUTED','VERIFIED','FAILED')),
 idempotency_key text not null unique references action_idempotency(idempotency_key),
 guard_result jsonb, result jsonb, error_code text, requested_at timestamptz not null default now(),
 executed_at timestamptz, verified_at timestamptz
);
create index agent_actions_run on agent_actions(run_id,requested_at);

alter table review_cases add column if not exists agent_run_id uuid references agent_runs(id),
 add column if not exists title text, add column if not exists summary text,
 add column if not exists evidence jsonb not null default '[]'::jsonb,
 add column if not exists assigned_team text;
create unique index review_cases_agent_run_unique on review_cases(agent_run_id) where agent_run_id is not null;
alter table audit_events add column if not exists agent_run_id uuid references agent_runs(id);
create index audit_events_agent_run on audit_events(agent_run_id,created_at);

create function start_agent_run(p_invoice_id uuid,p_agent_version text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from invoices where id=p_invoice_id and archived_at is null and status in ('RECEIVED','PROCESSING','NEEDS_REVIEW','FAILED')) then
  raise exception 'INVOICE_NOT_PROCESSABLE';
 end if;
 insert into agent_runs(invoice_id,status,current_state,mode,agent_version)
 values(p_invoice_id,'QUEUED','RECEIVED','LIVE',p_agent_version) returning id into v_id;
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description)
 values(p_invoice_id,v_id,'AGENT','AGENT_RUN_STARTED','Agent run queued');
 return v_id;
end $$;

-- This function is the final financial authority. The client cannot bypass its row locks,
-- current-run decision link, policy freshness, validation identity, and idempotency checks.
create function execute_agent_action(p_run_id uuid,p_decision_id uuid,p_action text,p_key text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_run agent_runs%rowtype;v_invoice invoices%rowtype;v_decision agent_decisions%rowtype;
 v_validation invoice_validation_runs%rowtype;v_previous action_idempotency%rowtype;
 v_expected text;v_final text;v_result jsonb;
begin
 if p_action not in ('APPROVE','REJECT') then raise exception 'ACTION_NOT_ALLOWED';end if;
 select * into v_run from agent_runs where id=p_run_id for update;
 if not found then raise exception 'ACTION_NOT_ALLOWED';end if;
 if p_key <> lower(p_action)||':'||v_run.invoice_id::text||':'||p_run_id::text then raise exception 'INVALID_IDEMPOTENCY_KEY';end if;
 select * into v_previous from action_idempotency where idempotency_key=p_key;
 if found then
  if v_previous.run_id<>p_run_id or v_previous.action_type<>p_action then raise exception 'DUPLICATE_ACTION';end if;
  if v_previous.status='COMPLETED' then return v_previous.result;end if;
  raise exception 'DUPLICATE_ACTION';
 end if;
 if v_run.status<>'RUNNING' or v_run.mode<>'LIVE' or v_run.current_state<>'EXECUTING' then raise exception 'ACTION_NOT_ALLOWED';end if;
 select * into v_invoice from invoices where id=v_run.invoice_id for update;
 if not found or v_invoice.status<>'PROCESSING' or v_invoice.archived_at is not null then raise exception 'ACTION_NOT_ALLOWED';end if;
 select * into v_decision from agent_decisions where id=p_decision_id;
 if not found or v_decision.invoice_id<>v_run.invoice_id or not exists(select 1 from agent_run_decisions where agent_run_id=p_run_id and decision_id=p_decision_id) then raise exception 'ACTION_NOT_ALLOWED';end if;
 if (p_action='APPROVE' and v_decision.decision<>'AUTO_APPROVED') or (p_action='REJECT' and v_decision.decision<>'AUTO_REJECTED') then raise exception 'ACTION_NOT_ALLOWED';end if;
 if v_decision.reason_code is null or jsonb_typeof(v_decision.evidence)<>'array' or jsonb_array_length(v_decision.evidence)=0 then raise exception 'ACTION_NOT_ALLOWED';end if;
 select * into v_validation from invoice_validation_runs where id=v_decision.validation_run_id;
 if not found or v_validation.invoice_id<>v_run.invoice_id or v_validation.extraction_id is distinct from v_invoice.current_extraction_id or v_validation.status='ERROR' then raise exception 'STALE_DECISION';end if;
 if exists(select 1 from agent_decisions where invoice_id=v_run.invoice_id and (created_at,id)>(v_decision.created_at,v_decision.id)) then raise exception 'STALE_DECISION';end if;
 if not exists(select 1 from policies where id=v_decision.policy_id and status='ACTIVE' and version=v_decision.policy_version) then raise exception 'STALE_DECISION';end if;
 if now()-v_decision.created_at>interval '10 minutes' then raise exception 'STALE_DECISION';end if;
 if p_action='REJECT' and v_decision.reason_code='APPROVAL_RULES_PASSED' then raise exception 'ACTION_NOT_ALLOWED';end if;
 insert into action_idempotency(idempotency_key,run_id,invoice_id,action_type,status) values(p_key,p_run_id,v_run.invoice_id,p_action,'STARTED');
 insert into agent_actions(run_id,invoice_id,action_type,status,idempotency_key,guard_result)
 values(p_run_id,v_run.invoice_id,p_action,'EXECUTING',p_key,'{"allowed":true}'::jsonb);
 v_expected:=case p_action when 'APPROVE' then 'APPROVED' else 'REJECTED' end;
 v_final:=case p_action when 'APPROVE' then 'AUTO_APPROVED' else 'AUTO_REJECTED' end;
 update invoices set status=v_expected::invoice_status,decision=v_final::invoice_decision,decision_reason=v_decision.reason_code,processed_at=now()
 where id=v_run.invoice_id and status='PROCESSING';
 if not found then raise exception 'ACTION_EXECUTION_FAILED';end if;
 v_result:=jsonb_build_object('invoiceId',v_run.invoice_id,'status',v_expected,'decision',v_final,'decisionId',p_decision_id);
 update action_idempotency set status='COMPLETED',result=v_result,completed_at=now() where idempotency_key=p_key;
 update agent_actions set status='EXECUTED',result=v_result,executed_at=now() where idempotency_key=p_key;
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description,metadata)
 values(v_run.invoice_id,p_run_id,'AGENT','ACTION_EXECUTED',p_action||' executed by guarded agent action',jsonb_build_object('decision_id',p_decision_id,'action',p_action));
 return v_result;
end $$;

create function execute_agent_review(p_run_id uuid,p_decision_id uuid,p_key text,p_reason text,p_title text,p_summary text,p_priority text,p_team text,p_evidence jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_run agent_runs%rowtype;v_decision agent_decisions%rowtype;v_previous action_idempotency%rowtype;v_case uuid;v_result jsonb;v_reason review_reason;
begin
 select * into v_run from agent_runs where id=p_run_id for update;
 if not found then raise exception 'ACTION_NOT_ALLOWED';end if;
 if p_key<>'create_review:'||v_run.invoice_id::text||':'||p_run_id::text then raise exception 'INVALID_IDEMPOTENCY_KEY';end if;
 select * into v_previous from action_idempotency where idempotency_key=p_key;
 if found then
  if v_previous.run_id<>p_run_id then raise exception 'DUPLICATE_ACTION';end if;
  if v_previous.status='COMPLETED' then return v_previous.result;end if;
  raise exception 'DUPLICATE_ACTION';
 end if;
 if v_run.status<>'RUNNING' or v_run.mode<>'LIVE' or v_run.current_state not in ('EXECUTING','CANNOT_DECIDE') then raise exception 'ACTION_NOT_ALLOWED';end if;
 if p_decision_id is not null then
  select * into v_decision from agent_decisions where id=p_decision_id;
  if not found or v_decision.invoice_id<>v_run.invoice_id or v_decision.decision not in ('NEEDS_REVIEW','CANNOT_DECIDE')
    or not exists(select 1 from agent_run_decisions where agent_run_id=p_run_id and decision_id=p_decision_id) then raise exception 'ACTION_NOT_ALLOWED';end if;
 end if;
 if p_priority not in ('LOW','MEDIUM','HIGH','CRITICAL') or jsonb_typeof(p_evidence)<>'array' then raise exception 'INVALID_INPUT';end if;
 v_reason:=case p_reason
  when 'MISSING_PURCHASE_ORDER' then 'MISSING_PO' when 'AMBIGUOUS_PURCHASE_ORDER' then 'PO_AMBIGUOUS'
  when 'PRICE_VARIANCE_EXCEEDED' then 'PRICE_VARIANCE' when 'QUANTITY_VARIANCE_EXCEEDED' then 'QUANTITY_VARIANCE'
  when 'TOTAL_VARIANCE_EXCEEDED' then 'TOTAL_VARIANCE' when 'CONFIRMED_DUPLICATE' then 'DUPLICATE_SUSPECTED'
  when 'POSSIBLE_DUPLICATE' then 'DUPLICATE_SUSPECTED' when 'LOW_EXTRACTION_CONFIDENCE' then 'LOW_CONFIDENCE'
  when 'CURRENCY_MISMATCH' then 'CURRENCY_MISMATCH' when 'TAX_MISMATCH' then 'TAX_MISMATCH'
  when 'VENDOR_MISMATCH' then 'VENDOR_MISMATCH' when 'AMBIGUOUS_VENDOR' then 'VENDOR_MISMATCH'
  when 'THREE_WAY_MATCH_FAILED' then 'THREE_WAY_MATCH_FAILURE' else 'SYSTEM_ERROR' end::review_reason;
 insert into action_idempotency(idempotency_key,run_id,invoice_id,action_type,status) values(p_key,p_run_id,v_run.invoice_id,'CREATE_REVIEW','STARTED');
 insert into review_cases(invoice_id,run_id,agent_run_id,status,reason_code,reason,priority,title,summary,evidence,assigned_team)
 values(v_run.invoice_id,case when p_decision_id is null then null else v_decision.run_id end,p_run_id,'OPEN',v_reason,p_summary,p_priority::review_priority,p_title,p_summary,p_evidence,p_team)
 returning id into v_case;
 update invoices set status='NEEDS_REVIEW',decision='NEEDS_REVIEW',decision_reason=p_reason where id=v_run.invoice_id and status in ('RECEIVED','PROCESSING','FAILED','NEEDS_REVIEW');
 if not found then raise exception 'ACTION_NOT_ALLOWED';end if;
 v_result:=jsonb_build_object('reviewCaseId',v_case,'invoiceId',v_run.invoice_id,'status','NEEDS_REVIEW');
 update action_idempotency set status='COMPLETED',result=v_result,completed_at=now() where idempotency_key=p_key;
 insert into agent_actions(run_id,invoice_id,action_type,status,idempotency_key,guard_result,result,executed_at,verified_at)
 values(p_run_id,v_run.invoice_id,'CREATE_REVIEW','VERIFIED',p_key,'{"allowed":true}'::jsonb,v_result,now(),now());
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description,metadata)
 values(v_run.invoice_id,p_run_id,'AGENT','REVIEW_CASE_CREATED',p_summary,jsonb_build_object('review_case_id',v_case,'reason_code',p_reason));
 return v_result;
end $$;

do $$ declare t text; begin
 foreach t in array array['agent_runs','agent_run_steps','agent_run_decisions','action_idempotency','agent_actions'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on table %I from anon, authenticated',t);
  execute format('grant all on table %I to service_role',t);
 end loop;
end $$;
revoke all on function start_agent_run(uuid,text) from public,anon,authenticated;
grant execute on function start_agent_run(uuid,text) to service_role;
revoke all on function execute_agent_action(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function execute_agent_action(uuid,uuid,text,text) to service_role;
revoke all on function execute_agent_review(uuid,uuid,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function execute_agent_review(uuid,uuid,text,text,text,text,text,text,jsonb) to service_role;
