-- Map exhausted PO billing quantity to Procurement review.
create or replace function execute_agent_review(p_run_id uuid,p_decision_id uuid,p_key text,p_reason text,p_title text,p_summary text,p_priority text,p_team text,p_evidence jsonb)
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
  when 'PO_BILLING_QUANTITY_EXCEEDED' then 'QUANTITY_VARIANCE'
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
