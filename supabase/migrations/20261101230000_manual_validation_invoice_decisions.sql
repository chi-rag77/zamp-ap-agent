create or replace function public.decide_validation_invoice_manually(
  p_org uuid,
  p_invoice uuid,
  p_actor text,
  p_decision text,
  p_reason text,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_status text;
  v_decision text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_decision not in ('APPROVE', 'REJECT') then raise exception 'INVALID_DECISION'; end if;
  if p_decision = 'REJECT' and length(coalesce(v_reason, '')) < 3 then raise exception 'REASON_REQUIRED'; end if;
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.workos_user_id = p_actor and m.status = 'ACTIVE'
  ) then raise exception 'NOT_AUTHORIZED'; end if;

  select * into v_invoice from public.invoices
  where organization_id = p_org and id = p_invoice and archived_at is null
  for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.updated_at is distinct from p_expected_updated_at then raise exception 'STALE_INVOICE'; end if;
  if v_invoice.status not in ('NEEDS_REVIEW', 'FAILED') then raise exception 'INVOICE_NOT_IN_HUMAN_REVIEW'; end if;
  if exists (
    select 1 from public.approval_requests r
    where r.organization_id = p_org and r.invoice_id = p_invoice and r.status = 'PENDING'
  ) then raise exception 'ROUTED_APPROVAL_PENDING'; end if;

  v_status := case p_decision when 'APPROVE' then 'APPROVED' else 'REJECTED' end;
  v_decision := case p_decision when 'APPROVE' then 'HUMAN_APPROVED' else 'HUMAN_REJECTED' end;
  update public.invoices set status = v_status::public.invoice_status,
    decision = v_decision::public.invoice_decision,
    decision_reason = coalesce(v_reason, 'Manually approved by an authorized organization approver'),
    processed_at = now(), updated_at = now()
  where organization_id = p_org and id = p_invoice;

  update public.agent_runs set status = 'COMPLETED', current_state = v_status,
    current_step = null, final_decision = v_decision,
    summary = case when p_decision = 'APPROVE' then 'Manually approved by an authorized organization approver'
                   else 'Manually rejected by an authorized organization approver' end,
    completed_at = now(), last_heartbeat_at = now()
  where organization_id = p_org and invoice_id = p_invoice and status = 'WAITING'
    and final_decision in ('NEEDS_REVIEW', 'PENDING_APPROVAL');

  insert into public.audit_events(organization_id, invoice_id, actor_type, actor_id, event_type, description, metadata)
  values (p_org, p_invoice, 'HUMAN', p_actor,
    case when p_decision = 'APPROVE' then 'INVOICE_MANUALLY_APPROVED' else 'INVOICE_MANUALLY_REJECTED' end,
    case when p_decision = 'APPROVE' then 'Invoice approved by an authorized human reviewer despite validation issues'
         else 'Invoice rejected by an authorized human reviewer' end,
    jsonb_build_object('decision', v_decision, 'reason', v_reason,
      'previousStatus', v_invoice.status, 'validationOverride', true));

  insert into public.approval_audit_events(organization_id, actor_user_id, event_type, target_type, target_id,
    before_state, after_state, reason)
  values (p_org, p_actor,
    case when p_decision = 'APPROVE' then 'MANUAL_VALIDATION_APPROVED' else 'MANUAL_VALIDATION_REJECTED' end,
    'INVOICE', p_invoice::text,
    jsonb_build_object('status', v_invoice.status, 'decision', v_invoice.decision),
    jsonb_build_object('status', v_status, 'decision', v_decision, 'validationOverride', true), v_reason);

  return jsonb_build_object('invoiceId', p_invoice, 'status', v_status, 'decision', v_decision);
end;
$$;

revoke all on function public.decide_validation_invoice_manually(uuid, uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.decide_validation_invoice_manually(uuid, uuid, text, text, text, timestamptz) to service_role;
