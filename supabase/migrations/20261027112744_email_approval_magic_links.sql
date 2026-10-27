-- Single-use, action-bound links for email approval decisions. Token hashes only
-- are persisted; all access is server-side via service_role.
create table public.approval_email_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  step_id uuid not null references public.approval_steps(id) on delete cascade,
  approver_user_id text not null,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  action text not null check (action in ('APPROVE','REJECT')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index approval_email_tokens_expiry_idx on public.approval_email_tokens(expires_at) where consumed_at is null;
alter table public.approval_email_tokens enable row level security;
revoke all on public.approval_email_tokens from anon, authenticated;
grant select, insert, update, delete on public.approval_email_tokens to service_role;

create or replace function public.decide_invoice_approval_from_email(
  p_token_hash text,
  p_decision text,
  p_reason text default ''
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_token public.approval_email_tokens%rowtype;
        v_request public.approval_requests%rowtype;
        v_step public.approval_steps%rowtype;
        v_result jsonb;
begin
  if p_decision not in ('APPROVE','REJECT') then raise exception 'INVALID_DECISION'; end if;
  if p_decision='REJECT' and length(trim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_token from public.approval_email_tokens
    where token_hash=p_token_hash and action=p_decision for update;
  if not found or v_token.consumed_at is not null or v_token.expires_at<=now() then raise exception 'EMAIL_LINK_INVALID_OR_EXPIRED'; end if;
  select * into v_request from public.approval_requests
    where organization_id=v_token.organization_id and id=v_token.request_id for update;
  if not found or v_request.status<>'PENDING' then raise exception 'APPROVAL_NOT_PENDING'; end if;
  select * into v_step from public.approval_steps
    where organization_id=v_token.organization_id and id=v_token.step_id and request_id=v_request.id
      and step_number=v_request.current_step and approver_user_id=v_token.approver_user_id and status='PENDING' for update;
  if not found then raise exception 'EMAIL_LINK_NO_LONGER_CURRENT'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=v_token.organization_id
      and m.workos_user_id=v_token.approver_user_id and m.status='ACTIVE') then raise exception 'APPROVER_NOT_ACTIVE'; end if;
  v_result:=public.decide_invoice_approval(v_token.organization_id,v_request.id,v_token.approver_user_id,
    p_decision,coalesce(p_reason,''),v_request.invoice_updated_at);
  update public.approval_email_tokens set consumed_at=now()
    where request_id=v_request.id and step_id=v_step.id and approver_user_id=v_token.approver_user_id and consumed_at is null;
  return v_result;
end $$;
revoke all on function public.decide_invoice_approval_from_email(text,text,text) from public,anon,authenticated;
grant execute on function public.decide_invoice_approval_from_email(text,text,text) to service_role;
