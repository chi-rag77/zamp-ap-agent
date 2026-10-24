-- Single protected workspace, matching the application's existing access boundary.
-- No browser role may access connection configuration or execution logs directly.
create table public.integrations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 80),
 provider text not null check(provider in ('rest','odata')),
 environment text not null check(environment in ('development','staging','production')),
 status text not null default 'CONFIGURING' check(status in ('CONFIGURING','HEALTHY','ERROR','DISCONNECTED')),
 endpoint text not null, test_path text not null default '/',
 auth_type text not null check(auth_type in ('none','bearer','api_key')),
 credential_ref text check(credential_ref ~ '^INTEGRATION_[A-Z0-9_]{1,80}$'),
 header_name text not null default 'X-API-Key', version integer not null default 1,
 last_tested_at timestamptz, last_error text, created_at timestamptz not null default now()
);
create table public.integration_runs (
 id uuid primary key default gen_random_uuid(), integration_id uuid not null references public.integrations(id),
 operation text not null default 'TEST_CONNECTION', status text not null check(status in ('RUNNING','SUCCEEDED','FAILED')),
 duration_ms integer, http_status integer, error_code text, created_at timestamptz not null default now()
);
create index integration_runs_integration_created on public.integration_runs(integration_id,created_at desc);
create unique index integration_one_running on public.integration_runs(integration_id) where status='RUNNING';
create table public.integration_audit (
 id uuid primary key default gen_random_uuid(), integration_id uuid not null references public.integrations(id),
 action text not null, created_at timestamptz not null default now()
);
create index integration_audit_integration_created on public.integration_audit(integration_id,created_at desc);
alter table public.integrations enable row level security;
alter table public.integration_runs enable row level security;
alter table public.integration_audit enable row level security;
revoke all on public.integrations,public.integration_runs,public.integration_audit from anon,authenticated;
grant select,insert,update on public.integrations,public.integration_runs to service_role;
grant select,insert on public.integration_audit to service_role;
revoke update,delete,truncate on public.integration_audit from service_role;
-- Record every configuration/status change atomically, without credential values or endpoints.
create function public.audit_integration_change() returns trigger language plpgsql security invoker set search_path=public as $$
begin
 insert into public.integration_audit(integration_id,action) values(new.id,
 case when TG_OP='INSERT' then 'Connection draft created' when new.status is distinct from old.status then 'Connection status: '||new.status else 'Connection test recorded' end);
 return new;
end $$;
revoke all on function public.audit_integration_change() from public,anon,authenticated;
grant execute on function public.audit_integration_change() to service_role;
create trigger integration_change_audit after insert or update on public.integrations for each row execute function public.audit_integration_change();
