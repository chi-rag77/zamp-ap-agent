-- A live agent owns the invoice processing state before validation and action execution.
create or replace function start_agent_run(p_invoice_id uuid,p_agent_version text)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_id uuid;
begin
 if not exists(select 1 from invoices where id=p_invoice_id and archived_at is null and status in ('RECEIVED','PROCESSING','NEEDS_REVIEW','FAILED')) then
  raise exception 'INVOICE_NOT_PROCESSABLE';
 end if;
 insert into agent_runs(invoice_id,status,current_state,mode,agent_version)
 values(p_invoice_id,'QUEUED','RECEIVED','LIVE',p_agent_version) returning id into v_id;
 update invoices set status='PROCESSING' where id=p_invoice_id and archived_at is null and status in ('RECEIVED','PROCESSING','NEEDS_REVIEW','FAILED');
 if not found then raise exception 'INVOICE_NOT_PROCESSABLE';end if;
 insert into audit_events(invoice_id,agent_run_id,actor_type,event_type,description)
 values(p_invoice_id,v_id,'AGENT','AGENT_RUN_STARTED','Agent run queued and invoice claimed');
 return v_id;
end $$;
revoke all on function start_agent_run(uuid,text) from public,anon,authenticated;
grant execute on function start_agent_run(uuid,text) to service_role;
