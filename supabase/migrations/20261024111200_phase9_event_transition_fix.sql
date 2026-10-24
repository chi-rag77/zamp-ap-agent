-- Emit terminal events only on terminal state transitions, not on later metadata updates.
create or replace function public.phase9_capture_run()
returns trigger language plpgsql security invoker set search_path=public as $$
declare v_type text;v_status text;v_message text;v_meta jsonb:='{}'::jsonb;
begin
  if tg_op='INSERT' then
    v_type:=case when new.run_type='RETRY' then 'RUN_RETRYING' when new.status='QUEUED' then 'RUN_QUEUED' else 'RUN_STARTED' end;
    v_status:=case when new.status='QUEUED' then 'PENDING' else 'RUNNING' end;
    v_message:=case when new.run_type='RETRY' then 'Agent retry queued' when new.status='QUEUED' then 'Agent run queued' else 'Agent run started' end;
  elsif new.status is distinct from old.status or new.retry_count is distinct from old.retry_count
      or new.current_state is distinct from old.current_state or new.current_step is distinct from old.current_step
      or new.final_decision is distinct from old.final_decision then
    v_type:=case
      when new.retry_count>old.retry_count then 'RUN_RETRYING'
      when old.status='QUEUED' and new.status='RUNNING' then 'RUN_STARTED'
      when new.status is distinct from old.status and new.status='COMPLETED' then 'RUN_COMPLETED'
      when new.status is distinct from old.status and new.status='FAILED' then 'RUN_FAILED'
      when new.status is distinct from old.status and new.status='WAITING' and new.final_decision='NEEDS_REVIEW' then 'REVIEW_REQUIRED'
      when new.final_decision is distinct from old.final_decision and new.final_decision is not null then 'DECISION_GENERATED'
      else 'RUN_UPDATED' end;
    v_status:=case when new.status in ('COMPLETED','FAILED','CANCELLED') then 'COMPLETED' when new.status in ('QUEUED','WAITING') then 'PENDING' else 'RUNNING' end;
    v_message:=case v_type when 'RUN_RETRYING' then 'Agent run retry scheduled' when 'RUN_COMPLETED' then 'Agent run completed'
      when 'RUN_FAILED' then 'Agent run failed' when 'REVIEW_REQUIRED' then 'Invoice requires human review'
      when 'DECISION_GENERATED' then 'A policy decision was recorded' when 'RUN_UPDATED' then 'Agent run state updated'
      else 'Agent run started' end;
    if new.error_code is not null then v_meta:=jsonb_build_object('errorCode',new.error_code,'errorClass',public.phase9_classify_error(new.error_code)); end if;
    if new.final_decision is distinct from old.final_decision and new.final_decision is not null then v_meta:=v_meta||jsonb_build_object('decision',new.final_decision); end if;
  else return new; end if;
  perform public.phase9_event(new.id,new.invoice_id,v_type,new.current_step,v_status,v_message,v_meta);
  return new;
end $$;
