-- Phase 6: server-only Gmail intake. Existing invoice_documents remains the canonical document table.
create table email_intakes (
 id uuid primary key default gen_random_uuid(), provider email_provider not null, message_id text not null,
 email_message_id uuid references email_messages(id), thread_id text, from_address text not null,
 to_addresses text[] not null default '{}', cc_addresses text[] not null default '{}', subject text,
 received_at timestamptz not null, classification text not null default 'POSSIBLE_INVOICE'
   check (classification in ('INVOICE','POSSIBLE_INVOICE','NON_INVOICE','UNSUPPORTED')),
 classification_confidence numeric(5,4) check (classification_confidence between 0 and 1),
 classification_reasons text[] not null default '{}', status text not null default 'RECEIVED'
   check (status in ('RECEIVED','PROCESSING','PROCESSED','IGNORED','FAILED','NEEDS_REVIEW')),
 stage text not null default 'RECEIVED', invoice_id uuid references invoices(id),
 error_code text, error_message text, processing_started_at timestamptz, processed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (provider,message_id)
);
create table email_sync_state (
 id uuid primary key default gen_random_uuid(), provider email_provider not null default 'GMAIL', mailbox text not null,
 last_history_id text, last_successful_sync_at timestamptz,
 status text not null default 'HEALTHY' check (status in ('HEALTHY','SYNCING','FAILED','REQUIRES_FULL_SYNC')),
 last_error text, updated_at timestamptz not null default now(), unique(provider,mailbox)
);
create table gmail_watches (
 id uuid primary key default gen_random_uuid(), mailbox text not null unique, history_id text not null,
 expiration_at timestamptz not null, status text not null check(status in ('ACTIVE','EXPIRED','FAILED')),
 last_renewed_at timestamptz not null default now()
);
alter table email_messages add column if not exists to_addresses text[] not null default '{}';
alter table email_messages add column if not exists cc_addresses text[] not null default '{}';
alter table email_messages add column if not exists history_id text;
alter table email_attachments alter column storage_path drop not null;
alter table email_attachments add column if not exists email_intake_id uuid references email_intakes(id);
alter table email_attachments add column if not exists attachment_id text;
alter table email_attachments add column if not exists sanitized_filename text;
alter table email_attachments add column if not exists document_status text not null default 'DISCOVERED'
 check (document_status in ('DISCOVERED','DOWNLOADED','VALIDATED','STORED','REJECTED','FAILED'));
alter table email_attachments add column if not exists document_role text not null default 'INVOICE'
 check(document_role in ('INVOICE','SUPPORTING_DOCUMENT','IGNORE'));
alter table email_attachments add column if not exists rejection_reason text;
alter table email_attachments add column if not exists invoice_id uuid references invoices(id);
alter table email_attachments add column if not exists agent_run_id uuid references agent_runs(id);
alter table email_attachments add column if not exists extraction_status text;
alter table invoices add column if not exists source_email_intake_id uuid references email_intakes(id);
alter table invoice_documents add column if not exists email_intake_id uuid references email_intakes(id);
alter table invoice_documents add column if not exists email_attachment_id uuid references email_attachments(id);
alter table invoice_documents add column if not exists storage_bucket text not null default 'invoice-documents';
create unique index email_attachments_message_attachment_unique on email_attachments(email_message_id,attachment_id);
create unique index email_attachments_invoice_hash_unique on email_attachments(document_hash) where document_role='INVOICE' and document_status='STORED' and document_hash is not null;
create unique index invoices_email_attachment_unique on invoices(source_attachment_id) where source='EMAIL' and source_attachment_id is not null;
create index email_intakes_status_idx on email_intakes(status,received_at desc);
create index email_intakes_received_idx on email_intakes(received_at desc);
create index email_attachments_intake_idx on email_attachments(email_intake_id);
create index email_attachments_status_idx on email_attachments(document_status);
create index invoices_email_intake_idx on invoices(source_email_intake_id);
create index email_sync_state_mailbox_idx on email_sync_state(mailbox);
create trigger email_intakes_updated_at before update on email_intakes for each row execute function set_updated_at();
alter table email_intakes enable row level security;
alter table email_sync_state enable row level security;
alter table gmail_watches enable row level security;
revoke all on email_intakes,email_sync_state,gmail_watches from anon,authenticated;
grant all on email_intakes,email_sync_state,gmail_watches to service_role;
-- Existing bucket is private; keep it private if an operator changed it.
update storage.buckets set public=false where id='invoice-documents';
create table email_sync_jobs (
 id uuid primary key default gen_random_uuid(), mailbox text not null, history_id text not null,
 status text not null default 'QUEUED' check(status in ('QUEUED','RUNNING','COMPLETED','FAILED')),
 attempts integer not null default 0, last_error text, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(mailbox,history_id)
);
create index email_sync_jobs_status_idx on email_sync_jobs(status,created_at);
alter table email_sync_jobs enable row level security;
revoke all on email_sync_jobs from anon,authenticated;
grant all on email_sync_jobs to service_role;
