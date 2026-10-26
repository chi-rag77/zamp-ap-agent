-- Human triage metadata is separate from financial resolution. A case may be
-- assigned or started here; only the guarded invoice decision path can decide it.
alter table public.review_cases
  add column if not exists assigned_member_id text,
  add column if not exists waiting_on text check (waiting_on is null or waiting_on in ('ME','AP','PROCUREMENT','FINANCE','VENDOR','CUSTOMER')),
  add column if not exists sla_due_at timestamptz;
create index if not exists review_cases_org_queue_idx
  on public.review_cases(organization_id,status,priority,created_at desc);

create or replace function public.update_human_review_triage(
  p_organization uuid,
  p_case uuid,
  p_actor text,
  p_assignee text,
  p_waiting_on text,
  p_status text,
  p_reason text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_case public.review_cases%rowtype; v_before jsonb;
begin
  if p_status not in ('OPEN','IN_PROGRESS') then
    raise exception 'Human triage can only open or start a case; resolve it through the guarded invoice workflow';
  end if;
  if p_waiting_on is not null and p_waiting_on not in ('ME','AP','PROCUREMENT','FINANCE','VENDOR','CUSTOMER') then
    raise exception 'Invalid waiting-on owner';
  end if;
  if p_assignee is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=p_organization and m.workos_user_id=p_assignee and m.status='ACTIVE'
  ) then raise exception 'Assignee must be an active member of this organization'; end if;
  select * into v_case from public.review_cases
    where organization_id=p_organization and id=p_case for update;
  if not found then raise exception 'Review case not found in this organization'; end if;
  if v_case.status in ('RESOLVED','CANCELLED') then raise exception 'Closed review cases cannot be reassigned'; end if;
  v_before:=jsonb_build_object('status',v_case.status,'assigned_member_id',v_case.assigned_member_id,'waiting_on',v_case.waiting_on,'sla_due_at',v_case.sla_due_at);
  update public.review_cases set assigned_member_id=p_assignee,waiting_on=p_waiting_on,status=p_status,updated_at=now()
   where organization_id=p_organization and id=p_case returning * into v_case;
  insert into public.approval_audit_events(organization_id,actor_user_id,event_type,target_type,target_id,before_state,after_state,reason)
   values(p_organization,p_actor,'EXCEPTION_TRIAGE_UPDATED','REVIEW_CASE',p_case::text,v_before,
     jsonb_build_object('status',v_case.status,'assigned_member_id',v_case.assigned_member_id,'waiting_on',v_case.waiting_on,'sla_due_at',v_case.sla_due_at),
     nullif(left(trim(coalesce(p_reason,'')),1000),''));
  return jsonb_build_object('id',v_case.id,'status',v_case.status,'assigned_member_id',v_case.assigned_member_id,'waiting_on',v_case.waiting_on,'sla_due_at',v_case.sla_due_at);
end;
$$;
revoke all on function public.update_human_review_triage(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.update_human_review_triage(uuid,uuid,text,text,text,text,text) to service_role;
