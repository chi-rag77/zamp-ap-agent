-- In-app invoice approval workflow. Decisions are tenant-scoped, atomic, and
-- retain the configured rule and invoice version that produced the task.
alter table public.approval_requests
  add column if not exists rule_id text,
  add column if not exists rule_name text,
  add column if not exists invoice_updated_at timestamptz,
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists due_at timestamptz;
create index if not exists approval_steps_role_queue_idx
  on public.approval_steps(organization_id,approver_role,status,step_number);
alter table public.agent_runs drop constraint if exists agent_runs_final_decision_check;
alter table public.agent_runs add constraint agent_runs_final_decision_check
  check (final_decision in ('AUTO_APPROVED','AUTO_REJECTED','HUMAN_APPROVED','HUMAN_REJECTED','NEEDS_REVIEW','CANNOT_DECIDE','PENDING_APPROVAL'));
alter table public.approval_requests drop constraint if exists approval_requests_organization_id_invoice_id_configuration_version_key;
create unique index if not exists approval_requests_one_pending_per_invoice_idx
  on public.approval_requests(organization_id,invoice_id) where status='PENDING';

create or replace function public.create_invoice_approval_request(
  p_org uuid,p_invoice uuid,p_actor text,p_configuration uuid,p_rule_id text,
  p_rule_name text,p_expected_updated_at timestamptz,p_evidence jsonb,p_route jsonb,p_due_at timestamptz default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_invoice public.invoices%rowtype; v_config public.approval_configurations%rowtype;
        v_request uuid; v_step jsonb; v_user text; v_role text; v_number integer:=0;
        v_mode text; v_authority numeric; v_currency text; v_categories text[]; v_new_updated_at timestamptz;
begin
  if jsonb_typeof(p_route)<>'array' or jsonb_array_length(p_route)=0 then raise exception 'APPROVER_NOT_FOUND'; end if;
  select * into v_invoice from public.invoices where organization_id=p_org and id=p_invoice and archived_at is null for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.updated_at is distinct from p_expected_updated_at then raise exception 'STALE_INVOICE'; end if;
  if v_invoice.status not in ('RECEIVED','PROCESSING','NEEDS_REVIEW','FAILED') then raise exception 'INVOICE_NOT_PENDING'; end if;
  select * into v_config from public.approval_configurations where organization_id=p_org and id=p_configuration and status='ACTIVE' for share;
  if not found then raise exception 'ACTIVE_CONFIGURATION_REQUIRED'; end if;
  if not exists(select 1 from jsonb_array_elements(v_config.rules) r where r->>'id'=p_rule_id and r->>'name'=p_rule_name and coalesce((r->>'enabled')::boolean,false)) then raise exception 'APPROVAL_RULE_CHANGED'; end if;
  if exists(select 1 from public.approval_requests where organization_id=p_org and invoice_id=p_invoice and status='PENDING') then raise exception 'APPROVAL_ALREADY_PENDING'; end if;
  insert into public.approval_requests(organization_id,invoice_id,configuration_id,configuration_version,status,current_step,requested_by,rule_id,rule_name,invoice_updated_at,evidence,due_at)
  values(p_org,p_invoice,p_configuration,v_config.version,'PENDING',1,p_actor,p_rule_id,p_rule_name,v_invoice.updated_at,coalesce(p_evidence,'{}'),p_due_at)
  returning id into v_request;
  for v_step in select value from jsonb_array_elements(p_route) loop
    v_number:=(v_step->>'stepNumber')::integer;
    v_mode:=coalesce(v_step->>'mode','SEQUENTIAL'); v_authority:=(v_step->>'authorityLimit')::numeric; v_currency:=v_step->>'currency';
    v_user:=nullif(v_step->>'approverUserId',''); v_role:=nullif(v_step->>'approverRole','');
    if v_number<1 or v_authority<0 or v_currency !~ '^[A-Z]{3}$' or (v_user is null and v_role is null) then raise exception 'INVALID_APPROVER_ROUTE'; end if;
    if v_user is not null then
      select approval_categories into v_categories from public.organization_memberships
       where organization_id=p_org and workos_user_id=v_user and status='ACTIVE'
         and approval_limit>=v_authority and approval_currency=v_currency
         and approval_categories @> array['INVOICES']::text[];
      if not found or v_user=p_actor then raise exception 'APPROVER_NOT_ELIGIBLE'; end if;
      if not exists(select 1 from public.organization_roles r join public.organization_memberships m on m.organization_id=r.organization_id and m.role=r.role_key
        where r.organization_id=p_org and m.workos_user_id=v_user and r.permissions @> '["invoices.approve"]'::jsonb) then raise exception 'APPROVER_NOT_ELIGIBLE'; end if;
    else
      if not exists(select 1 from public.organization_roles where organization_id=p_org and role_key=v_role and permissions @> '["invoices.approve"]'::jsonb) then raise exception 'APPROVER_NOT_ELIGIBLE'; end if;
      if not exists(select 1 from public.organization_memberships where organization_id=p_org and role=v_role and status='ACTIVE' and workos_user_id<>p_actor and approval_limit>=v_authority and approval_currency=v_currency and approval_categories @> array['INVOICES']::text[]) then raise exception 'APPROVER_NOT_ELIGIBLE'; end if;
    end if;
    insert into public.approval_steps(organization_id,request_id,step_number,approver_user_id,approver_role,approval_mode,authority_limit,status,started_at)
    values(p_org,v_request,v_number,v_user,v_role,v_mode,v_authority,case when v_number=1 then 'PENDING' else 'PENDING' end,case when v_number=1 then now() else null end);
  end loop;
  if not exists(select 1 from public.approval_steps where organization_id=p_org and request_id=v_request and step_number=1) then raise exception 'INVALID_APPROVER_ROUTE'; end if;
  update public.invoices set status='PENDING_APPROVAL',updated_at=now() where organization_id=p_org and id=p_invoice returning updated_at into v_new_updated_at;
  update public.approval_requests set invoice_updated_at=v_new_updated_at where id=v_request;
  insert into public.approval_audit_events(organization_id,actor_user_id,event_type,target_type,target_id,before_state,after_state,reason)
  values(p_org,p_actor,'APPROVAL_REQUESTED','INVOICE',p_invoice::text,jsonb_build_object('status',v_invoice.status,'updatedAt',v_invoice.updated_at),jsonb_build_object('requestId',v_request,'ruleId',p_rule_id,'ruleName',p_rule_name,'configurationVersion',v_config.version,'invoiceUpdatedAt',v_invoice.updated_at),'Approval rule matched');
  insert into public.object_notifications(organization_id,object_type,object_id,recipient,title,message)
  select p_org,'invoice',p_invoice::text,m.workos_user_id,'Approval required',coalesce(v_invoice.invoice_number,'Invoice')||' · '||coalesce(p_rule_name,'Approval rule')
  from public.approval_steps s join public.organization_memberships m on m.organization_id=s.organization_id and m.status='ACTIVE'
   and ((s.approver_user_id is not null and m.workos_user_id=s.approver_user_id) or (s.approver_role is not null and m.role=s.approver_role))
  where s.organization_id=p_org and s.request_id=v_request and s.step_number=1 and m.workos_user_id<>p_actor
  on conflict do nothing;
  return v_request;
end $$;

create or replace function public.decide_invoice_approval(
  p_org uuid,p_request uuid,p_actor text,p_decision text,p_reason text,p_expected_invoice_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_req public.approval_requests%rowtype; v_invoice public.invoices%rowtype;
        v_step public.approval_steps%rowtype; v_mode text; v_count integer; v_approved integer; v_next integer;
        v_final boolean:=false; v_invoice_status text; v_invoice_decision text;
begin
  if p_decision not in ('APPROVE','REJECT','REQUEST_CORRECTION') then raise exception 'INVALID_DECISION'; end if;
  if p_decision<>'APPROVE' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_req from public.approval_requests where organization_id=p_org and id=p_request for update;
  if not found or v_req.status<>'PENDING' then raise exception 'APPROVAL_NOT_PENDING'; end if;
  select * into v_invoice from public.invoices where organization_id=p_org and id=v_req.invoice_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.status<>'PENDING_APPROVAL' or v_invoice.updated_at is distinct from p_expected_invoice_updated_at or v_req.invoice_updated_at is distinct from p_expected_invoice_updated_at then raise exception 'STALE_INVOICE'; end if;
  select * into v_step from public.approval_steps s where s.organization_id=p_org and s.request_id=p_request and s.step_number=v_req.current_step and s.status='PENDING'
    and (s.approver_user_id=p_actor or (s.approver_role is not null and exists(select 1 from public.organization_memberships m join public.organization_roles r on r.organization_id=m.organization_id and r.role_key=m.role where m.organization_id=p_org and m.workos_user_id=p_actor and m.status='ACTIVE' and m.role=s.approver_role and r.permissions @> '["invoices.approve"]'::jsonb and m.approval_limit>=coalesce(s.authority_limit,0) and m.approval_currency=v_invoice.currency and m.approval_categories @> array['INVOICES']::text[])))
    order by s.approver_user_id nulls last limit 1 for update;
  if not found then raise exception 'NOT_ASSIGNED_APPROVER'; end if;
  if not exists(select 1 from public.organization_memberships m join public.organization_roles r on r.organization_id=m.organization_id and r.role_key=m.role where m.organization_id=p_org and m.workos_user_id=p_actor and m.status='ACTIVE' and r.permissions @> to_jsonb(array[case when p_decision='APPROVE' then 'invoices.approve' else 'invoices.reject' end])) then raise exception 'NOT_AUTHORIZED'; end if;
  if v_req.requested_by=p_actor then raise exception 'SELF_APPROVAL_FORBIDDEN'; end if;
  update public.approval_steps set status=case p_decision when 'APPROVE' then 'APPROVED' when 'REJECT' then 'REJECTED' else 'SENT_BACK' end,decision=p_decision,comment=nullif(trim(p_reason),''),completed_at=now()
   where id=v_step.id;
  if p_decision='APPROVE' then
    select approval_mode,count(*),count(*) filter(where status='APPROVED') into v_mode,v_count,v_approved from public.approval_steps where organization_id=p_org and request_id=p_request and step_number=v_req.current_step group by approval_mode;
    if v_mode='ALL_REQUIRED' or v_mode='PARALLEL' then v_final:=v_approved=v_count; else v_final:=true; end if;
    if v_final then
      update public.approval_steps set status='SKIPPED',completed_at=now() where organization_id=p_org and request_id=p_request and step_number=v_req.current_step and status='PENDING' and v_mode='ANY_ONE';
      select min(step_number) into v_next from public.approval_steps where organization_id=p_org and request_id=p_request and step_number>v_req.current_step;
      if v_next is null then update public.approval_requests set status='APPROVED',completed_at=now() where id=p_request; v_invoice_status:='APPROVED';v_invoice_decision:='HUMAN_APPROVED';
      else update public.approval_requests set current_step=v_next where id=p_request;update public.approval_steps set started_at=now() where organization_id=p_org and request_id=p_request and step_number=v_next and started_at is null; end if;
    end if;
  else
    update public.approval_steps set status='SKIPPED',completed_at=now() where organization_id=p_org and request_id=p_request and status='PENDING';
    update public.approval_requests set status=case when p_decision='REJECT' then 'REJECTED' else 'SENT_BACK' end,completed_at=now() where id=p_request;
    v_invoice_status:=case when p_decision='REJECT' then 'REJECTED' else 'RETURNED_FOR_CORRECTION' end;
    v_invoice_decision:=case when p_decision='REJECT' then 'HUMAN_REJECTED' else null end;
    v_final:=true;
  end if;
  if v_invoice_status is not null then update public.invoices set status=v_invoice_status::public.invoice_status,decision=case when v_invoice_decision is null then null else v_invoice_decision::public.invoice_decision end,decision_reason=coalesce(nullif(trim(p_reason),''),p_decision),processed_at=now(),updated_at=now() where organization_id=p_org and id=v_req.invoice_id; end if;
  if v_final then update public.agent_runs set status='COMPLETED',current_state='COMPLETED',current_step=null,final_decision=case when p_decision='APPROVE' and v_invoice_status='APPROVED' then 'HUMAN_APPROVED' when p_decision='REJECT' then 'HUMAN_REJECTED' else 'NEEDS_REVIEW' end,summary=case when v_invoice_status='APPROVED' then 'Approval chain completed by an authorized approver' when v_invoice_status='REJECTED' then 'Invoice rejected by an authorized approver' else 'Invoice returned for correction' end,reason_code=case when p_decision='REQUEST_CORRECTION' then 'CORRECTION_REQUESTED' else reason_code end,completed_at=now(),last_heartbeat_at=now() where organization_id=p_org and invoice_id=v_req.invoice_id and status='WAITING' and final_decision='PENDING_APPROVAL'; end if;
  insert into public.approval_audit_events(organization_id,actor_user_id,event_type,target_type,target_id,before_state,after_state,reason)
  values(p_org,p_actor,case p_decision when 'APPROVE' then 'APPROVAL_STEP_APPROVED' when 'REJECT' then 'APPROVAL_REJECTED' else 'CORRECTION_REQUESTED' end,'INVOICE',v_req.invoice_id::text,jsonb_build_object('requestStatus',v_req.status,'step',v_req.current_step,'invoiceStatus',v_invoice.status),jsonb_build_object('requestId',p_request,'decision',p_decision,'reason',nullif(trim(p_reason),''),'final',v_final,'nextStep',case when v_final then v_next else v_req.current_step end,'configurationVersion',v_req.configuration_version,'invoiceUpdatedAt',p_expected_invoice_updated_at),nullif(trim(p_reason),''));
  insert into public.object_notifications(organization_id,object_type,object_id,recipient,title,message)
  select p_org,'invoice',v_req.invoice_id::text,m.workos_user_id,
    case when v_invoice_status='APPROVED' then 'Invoice approved' when v_invoice_status='REJECTED' then 'Invoice rejected' when v_invoice_status='RETURNED_FOR_CORRECTION' then 'Correction requested' else 'Approval updated' end,
    coalesce(v_invoice.invoice_number,'Invoice')||' · '||case when v_invoice_status='APPROVED' then 'All approval steps completed' when v_invoice_status='REJECTED' then 'Rejected by an approver' when v_invoice_status='RETURNED_FOR_CORRECTION' then 'Returned for correction' else 'A new approval step is ready' end
  from public.organization_memberships m where m.organization_id=p_org and m.status='ACTIVE' and m.workos_user_id<>p_actor
    and (m.workos_user_id=v_req.requested_by or (v_next is not null and exists(select 1 from public.approval_steps s where s.organization_id=p_org and s.request_id=p_request and s.step_number=v_next and (s.approver_user_id=m.workos_user_id or s.approver_role=m.role))))
  on conflict do nothing;
  return jsonb_build_object('requestId',p_request,'status',case when v_invoice_status is not null then v_invoice_status else 'PENDING' end,'step',case when v_final then v_next else v_req.current_step end,'final',v_final);
end $$;

create or replace function public.cancel_invoice_approval_request(p_org uuid,p_request uuid,p_actor text,p_expected_invoice_updated_at timestamptz)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_req public.approval_requests%rowtype;v_invoice public.invoices%rowtype;
begin
  select * into v_req from public.approval_requests where organization_id=p_org and id=p_request for update;
  if not found or v_req.status<>'PENDING' then raise exception 'APPROVAL_NOT_PENDING'; end if;
  select * into v_invoice from public.invoices where organization_id=p_org and id=v_req.invoice_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.status<>'PENDING_APPROVAL' or v_invoice.updated_at is distinct from p_expected_invoice_updated_at or v_req.invoice_updated_at is distinct from p_expected_invoice_updated_at then raise exception 'STALE_INVOICE'; end if;
  if not exists(select 1 from public.organization_memberships m join public.organization_roles r on r.organization_id=m.organization_id and r.role_key=m.role where m.organization_id=p_org and m.workos_user_id=p_actor and m.status='ACTIVE' and r.permissions @> '["invoices.edit"]'::jsonb) then raise exception 'NOT_AUTHORIZED'; end if;
  update public.approval_requests set status='CANCELLED',completed_at=now() where id=p_request;
  update public.approval_steps set status='SKIPPED',completed_at=now() where organization_id=p_org and request_id=p_request and status='PENDING';
  update public.invoices set status='NEEDS_REVIEW',decision=null,decision_reason='Approval cancelled for invoice correction',updated_at=now() where organization_id=p_org and id=v_req.invoice_id;
  update public.agent_runs set status='COMPLETED',current_state='NEEDS_REVIEW',current_step=null,final_decision='NEEDS_REVIEW',summary='Approval cancelled so the invoice can be corrected',reason_code='CORRECTION_REQUESTED',completed_at=now(),last_heartbeat_at=now() where organization_id=p_org and invoice_id=v_req.invoice_id and status='WAITING' and final_decision='PENDING_APPROVAL';
  insert into public.approval_audit_events(organization_id,actor_user_id,event_type,target_type,target_id,before_state,after_state,reason)
  values(p_org,p_actor,'APPROVAL_CANCELLED','INVOICE',v_req.invoice_id::text,jsonb_build_object('requestId',p_request,'status','PENDING'),jsonb_build_object('status','CANCELLED','invoiceStatus','NEEDS_REVIEW'),'Approval cancelled before invoice correction');
  return jsonb_build_object('requestId',p_request,'status','CANCELLED','invoiceStatus','NEEDS_REVIEW');
end $$;

revoke all on function public.create_invoice_approval_request(uuid,uuid,text,uuid,text,text,timestamptz,jsonb,jsonb,timestamptz) from public,anon,authenticated;
revoke all on function public.decide_invoice_approval(uuid,uuid,text,text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.cancel_invoice_approval_request(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.create_invoice_approval_request(uuid,uuid,text,uuid,text,text,timestamptz,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.decide_invoice_approval(uuid,uuid,text,text,text,timestamptz) to service_role;
grant execute on function public.cancel_invoice_approval_request(uuid,uuid,text,timestamptz) to service_role;
