-- WorkOS provides the authenticated organization claim; Zamp stores its local
-- organization mapping and applies row-level access to every business table.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  workos_organization_id text not null unique,
  name text not null,
  slug text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'DELETED')),
  plan text not null default 'TRIAL',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workos_user_id text not null,
  email text not null,
  role text not null default 'MEMBER' check (role in ('OWNER','ADMIN','AP_MANAGER','REVIEWER','MEMBER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, workos_user_id)
);
create index organization_memberships_user_idx on public.organization_memberships(workos_user_id, organization_id) where status = 'ACTIVE';

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.id
  from public.organizations o
  join public.organization_memberships m
    on m.organization_id = o.id
   and m.workos_user_id = (select auth.jwt() ->> 'sub')
   and m.status = 'ACTIVE'
  where o.workos_organization_id = (select auth.jwt() ->> 'org_id')
    and o.status = 'ACTIVE'
  limit 1
$$;
revoke all on function private.current_organization_id() from public, anon;
grant execute on function private.current_organization_id() to authenticated;
grant usage on schema private to authenticated;

-- Immutable business facts may receive their one-time tenant key during this
-- migration. All original fact columns remain append-only; tenant ownership
-- cannot be changed after it is set.
create or replace function public.reject_policy_decision_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     or old.organization_id is not null
     or (to_jsonb(old) - 'organization_id') is distinct from (to_jsonb(new) - 'organization_id') then
    raise exception 'Policy decisions are append-only';
  end if;
  return new;
end;
$$;

create or replace function public.reject_audit_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     or old.organization_id is not null
     or (to_jsonb(old) - 'organization_id') is distinct from (to_jsonb(new) - 'organization_id') then
    raise exception 'audit_events are append-only';
  end if;
  return new;
end;
$$;

create or replace function public.reject_validation_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     or old.organization_id is not null
     or (to_jsonb(old) - 'organization_id') is distinct from (to_jsonb(new) - 'organization_id') then
    raise exception 'invoice_validation_runs are append-only';
  end if;
  return new;
end;
$$;

create or replace function public.reject_extraction_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE'
     or old.organization_id is not null
     or (to_jsonb(old) - 'organization_id' - 'is_canonical') is distinct from (to_jsonb(new) - 'organization_id' - 'is_canonical') then
    raise exception 'invoice_extractions are append-only except canonical flag';
  end if;
  return new;
end;
$$;

create or replace function private.propagate_organization_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_organization_id uuid := nullif(v_row ->> 'organization_id', '')::uuid;
  v_parent_id uuid;
  v_parent_organization_id uuid;
  v_relation text;
  v_foreign_key text;
begin
  if tg_op = 'UPDATE' and old.organization_id is not null and old.organization_id is distinct from new.organization_id then
    raise exception 'organization_id cannot be changed after creation';
  end if;

  if v_organization_id is null then
    v_organization_id := private.current_organization_id();
  end if;

  -- The existing Gmail mailbox, webhook, and five-minute sync worker belong
  -- to Acme Corporation. These trusted system writes have no user JWT; pin
  -- only their intake/sync rows to the designated workspace tenant.
  if v_organization_id is null
     and tg_table_name in ('email_messages','email_intakes','email_sync_state','gmail_watches','email_sync_jobs','email_oauth_credentials')
     and current_setting('role', true) = 'service_role' then
    select id into v_organization_id from public.organizations
      where workos_organization_id = 'org_01M5Q9NAY3G32HHD27FTJ8TGSG' and status = 'ACTIVE';
  end if;

  -- Carry a tenant from the owning record into dependent rows written by the
  -- trusted extraction and agent workers.
  for v_relation, v_foreign_key in
    select * from (values
      ('invoices','invoice_id'),
      ('processing_runs','run_id'),
      ('agent_runs','run_id'),
      ('agent_runs','agent_run_id'),
      ('purchase_orders','po_id'),
      ('goods_receipts','goods_receipt_id'),
      ('integrations','integration_id'),
      ('email_intakes','email_intake_id'),
      ('email_messages','email_message_id'),
      ('email_messages','source_message_id'),
      ('email_attachments','source_attachment_id'),
      ('email_attachments','email_attachment_id'),
      ('email_attachments','email_attachment_id'),
      ('invoices','invoice_id'),
      ('agent_runs','agent_run_id'),
      ('processing_events','source_event_id'),
      ('policy_import_runs','import_run_id'),
      ('policy_source_documents','document_id')
    ) as tenant_parents(relation_name, foreign_key)
  loop
    v_parent_id := nullif(v_row ->> v_foreign_key, '')::uuid;
    if v_parent_id is not null then
      execute format('select organization_id from public.%I where id = $1', v_relation)
        into v_parent_organization_id using v_parent_id;
      if v_parent_organization_id is not null then
        if v_organization_id is not null and v_organization_id <> v_parent_organization_id then
          raise exception 'Related records must belong to the same organization';
        end if;
        v_organization_id := v_parent_organization_id;
      end if;
    end if;
  end loop;

  new.organization_id := v_organization_id;
  return new;
end;
$$;
revoke all on function private.propagate_organization_id() from public, anon, authenticated;

-- Existing unowned records are intentionally inaccessible until assigned to the
-- correct customer. Never guess an owner for financial data during rollout.
do $$
declare t text;
begin
  foreach t in array array[
    'vendors','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines',
    'email_messages','email_attachments','invoices','invoice_lines','processing_runs','agent_steps',
    'policies','agent_decisions','review_cases','audit_events','invoice_documents','invoice_extractions',
    'invoice_validation_runs','agent_runs','agent_run_steps','agent_run_decisions','action_idempotency',
    'agent_actions','agent_jobs','processing_events','notifications','email_intakes','email_sync_state',
    'gmail_watches','email_sync_jobs','email_oauth_credentials','email_documents',
    'policy_import_runs','policy_source_documents','policy_source_chunks','imported_policy_rules',
    'policy_import_issues','policy_import_simulations','integrations','integration_runs','integration_audit'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists organization_id uuid references public.organizations(id)', t);
      execute format('create index if not exists %I on public.%I (organization_id)', t || '_organization_id_idx', t);
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
      execute format('grant select on table public.%I to authenticated', t);
      execute format('create policy %I on public.%I for select to authenticated using (organization_id = (select private.current_organization_id()))', t || '_tenant_select', t);
      execute format('create trigger %I before insert or update on public.%I for each row execute function private.propagate_organization_id()', t || '_tenant_propagation', t);
    end if;
  end loop;
end $$;

-- The existing workspace data is intentionally assigned to Acme Corporation,
-- the organization the workspace owner designated for this rollout. New
-- tenants remain isolated by their own WorkOS organization and membership.
do $$
declare
  v_organization_id uuid;
  t text;
begin
  insert into public.organizations (workos_organization_id, name, slug)
  values ('org_01M5Q9NAY3G32HHD27FTJ8TGSG', 'Acme Corporation', 'zamp-acme')
  on conflict (workos_organization_id) do update
    set name = excluded.name, slug = excluded.slug, updated_at = now()
  returning id into v_organization_id;

  insert into public.organization_memberships
    (organization_id, workos_user_id, email, role, status)
  values (v_organization_id, 'user_01M42YWEY5SXX1PG52TF0KTGN1', 'chiragshetty8088@gmail.com', 'ADMIN', 'ACTIVE')
  on conflict (organization_id, workos_user_id) do update
    set email = excluded.email, role = 'ADMIN', status = 'ACTIVE', updated_at = now();

  -- Backfill every existing business record without changing its primary key
  -- or invoice/business content.
  for t in select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'vendors','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines',
        'email_messages','email_attachments','invoices','invoice_lines','processing_runs','agent_steps',
        'policies','agent_decisions','review_cases','audit_events','invoice_documents','invoice_extractions',
        'invoice_validation_runs','agent_runs','agent_run_steps','agent_run_decisions','action_idempotency',
        'agent_actions','agent_jobs','processing_events','notifications','email_intakes','email_sync_state',
        'gmail_watches','email_sync_jobs','email_oauth_credentials','email_documents',
        'policy_import_runs','policy_source_documents','policy_source_chunks','imported_policy_rules',
        'policy_import_issues','policy_import_simulations','integrations','integration_runs','integration_audit'
      )
  loop
    execute format('update public.%I set organization_id = $1 where organization_id is null', t)
      using v_organization_id;
  end loop;
end $$;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
revoke all on public.organizations, public.organization_memberships from anon, authenticated;
grant select on public.organizations, public.organization_memberships to authenticated;

create policy organizations_member_read on public.organizations for select to authenticated
  using (id = (select private.current_organization_id()));
create policy memberships_self_read on public.organization_memberships for select to authenticated
  using (organization_id = (select private.current_organization_id())
    and workos_user_id = (select auth.jwt() ->> 'sub'));

grant all on public.organizations, public.organization_memberships to service_role;
