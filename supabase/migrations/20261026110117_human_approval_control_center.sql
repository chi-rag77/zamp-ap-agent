-- Tenant-scoped human operations and approval configuration. Interactive
-- access remains behind the authenticated server layer; direct Data API access
-- is deliberately withheld from browser roles.
alter table public.organization_memberships
  add column if not exists first_name text,
  add column if not exists last_name text,
  drop constraint if exists organization_memberships_role_check;
alter table public.organization_memberships
  add constraint organization_memberships_role_check check (role ~ '^[A-Z][A-Z0-9_]{1,39}$');
alter table public.organization_memberships
  add column if not exists employee_id text,
  add column if not exists department text,
  add column if not exists team text,
  add column if not exists job_title text,
  add column if not exists manager_user_id text,
  add column if not exists approval_limit numeric(18,2),
  add column if not exists approval_currency text not null default 'INR',
  add column if not exists approval_categories text[] not null default array['INVOICES']::text[],
  add column if not exists routing_capabilities jsonb not null default '{"exceptions":true,"escalations":true,"manualAssignment":true}'::jsonb,
  add constraint organization_memberships_approval_limit_nonnegative check (approval_limit is null or approval_limit >= 0),
  add constraint organization_memberships_approval_currency_format check (approval_currency ~ '^[A-Z]{3}$');

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workos_invitation_id text not null unique,
  email text not null,
  first_name text,
  last_name text,
  role text not null check (role ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  employee_id text,
  department text,
  team text,
  job_title text,
  approval_limit numeric(18,2),
  approval_currency text not null default 'INR' check (approval_currency ~ '^[A-Z]{3}$'),
  approval_categories text[] not null default array['INVOICES']::text[],
  routing_capabilities jsonb not null default '{"exceptions":true,"escalations":true,"manualAssignment":true}'::jsonb,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  expires_at timestamptz,
  invited_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (approval_limit is null or approval_limit >= 0)
);
create index organization_invitations_org_status_idx on public.organization_invitations(organization_id,status,created_at desc);

create table public.organization_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_key text not null check (role_key ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text not null,
  description text not null default '',
  permissions jsonb not null default '[]'::jsonb check (jsonb_typeof(permissions)='array'),
  is_system boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,role_key)
);
create index organization_roles_org_idx on public.organization_roles(organization_id,name);

create table public.organization_teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  department text,
  description text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (organization_id,name)
);

create table public.approval_configurations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version integer not null check (version > 0),
  name text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','ARCHIVED')),
  rules jsonb not null default '[]'::jsonb check (jsonb_typeof(rules)='array'),
  created_by text not null,
  created_at timestamptz not null default now(),
  activated_by text,
  activated_at timestamptz,
  unique (organization_id,version),
  unique (organization_id,id),
  check (status<>'ACTIVE' or activated_at is not null)
);
create unique index approval_configurations_one_active_idx on public.approval_configurations(organization_id) where status='ACTIVE';
create index approval_configurations_history_idx on public.approval_configurations(organization_id,version desc);

create or replace function public.protect_approval_configuration_history()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status <> 'DRAFT' and (old.rules is distinct from new.rules or old.name is distinct from new.name or old.version is distinct from new.version) then
    raise exception 'Published approval configuration content is immutable';
  end if;
  if old.status='ARCHIVED' then raise exception 'Archived approval configurations are immutable'; end if;
  if old.organization_id is distinct from new.organization_id then raise exception 'Approval configuration organization cannot change'; end if;
  return new;
end;
$$;
create trigger approval_configurations_immutable before update on public.approval_configurations
for each row execute function public.protect_approval_configuration_history();

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  configuration_id uuid not null references public.approval_configurations(id),
  configuration_version integer not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','SENT_BACK','CANCELLED')),
  current_step integer not null default 1 check (current_step>0),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  requested_by text not null,
  unique (organization_id,invoice_id,configuration_version),
  foreign key (organization_id,configuration_id) references public.approval_configurations(organization_id,id)
);
create index approval_requests_queue_idx on public.approval_requests(organization_id,status,requested_at desc);

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.approval_requests(id) on delete cascade,
  step_number integer not null check (step_number>0),
  approver_user_id text,
  approver_role text,
  approval_mode text not null default 'SEQUENTIAL' check (approval_mode in ('SEQUENTIAL','PARALLEL','ANY_ONE','ALL_REQUIRED')),
  authority_limit numeric(18,2),
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED','SENT_BACK','SKIPPED')),
  decision text,
  comment text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,request_id,step_number,approver_user_id),
  check (authority_limit is null or authority_limit>=0),
  check (approver_user_id is not null or approver_role is not null)
);
create index approval_steps_user_queue_idx on public.approval_steps(organization_id,approver_user_id,status,created_at desc);

create table public.approval_delegations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delegator_user_id text not null,
  delegate_user_id text not null,
  scope jsonb not null default '{"categories":["INVOICES"]}'::jsonb check (jsonb_typeof(scope)='object'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','REVOKED','EXPIRED')),
  created_by text not null,
  created_at timestamptz not null default now(),
  check (delegator_user_id<>delegate_user_id),
  check (ends_at>starts_at)
);
create index approval_delegations_active_idx on public.approval_delegations(organization_id,delegator_user_id,starts_at,ends_at) where status='ACTIVE';

create table public.approval_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id text not null,
  event_type text not null,
  target_type text not null,
  target_id text not null,
  before_state jsonb,
  after_state jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index approval_audit_events_org_time_idx on public.approval_audit_events(organization_id,created_at desc);

create or replace function public.activate_approval_configuration(p_org uuid,p_configuration uuid,p_actor text)
returns integer language plpgsql set search_path = '' as $$
declare v_version integer; v_status text; v_rules jsonb;
begin
  select version,status,rules into v_version,v_status,v_rules
    from public.approval_configurations where organization_id=p_org and id=p_configuration for update;
  if not found or v_status<>'DRAFT' then raise exception 'A draft approval configuration is required'; end if;
  if not exists(select 1 from jsonb_array_elements(v_rules) r where coalesce((r->>'enabled')::boolean,false)) then raise exception 'Add at least one enabled approval rule before activating'; end if;
  if exists(
    select 1 from jsonb_array_elements(v_rules) r
    where coalesce((r->>'enabled')::boolean,false)
    group by (r->>'priority')::integer having count(*)>1
  ) then raise exception 'Enabled rules must have unique priorities to avoid route conflicts'; end if;
  update public.approval_configurations set status='ARCHIVED' where organization_id=p_org and status='ACTIVE';
  update public.approval_configurations set status='ACTIVE',activated_by=p_actor,activated_at=now()
    where organization_id=p_org and id=p_configuration;
  return v_version;
end;
$$;
revoke all on function public.activate_approval_configuration(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.activate_approval_configuration(uuid,uuid,text) to service_role;

create or replace function public.reject_approval_audit_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Approval audit events are append-only'; end;
$$;
create trigger approval_audit_events_immutable before update or delete on public.approval_audit_events
for each row execute function public.reject_approval_audit_mutation();

-- These tables are only available through authenticated server routes that
-- verify the active WorkOS organization and the caller's local membership role.
do $$ declare t text; begin
  foreach t in array array['organization_invitations','organization_roles','organization_teams','approval_configurations','approval_requests','approval_steps','approval_delegations','approval_audit_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
