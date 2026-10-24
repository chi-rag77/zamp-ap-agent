-- OAuth refresh tokens are only accessed by server code using the service role.
create table email_oauth_credentials (
  mailbox text primary key,
  provider email_provider not null default 'GMAIL' check (provider = 'GMAIL'),
  refresh_token text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table email_oauth_credentials enable row level security;
revoke all on email_oauth_credentials from anon, authenticated;
grant all on email_oauth_credentials to service_role;

create trigger email_oauth_credentials_updated_at
before update on email_oauth_credentials
for each row execute function set_updated_at();
