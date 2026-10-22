-- Zamp AP domain foundation. All application tables are private to server-side service-role access.
create extension if not exists pgcrypto;

create type vendor_status as enum ('ACTIVE','BLOCKED','INACTIVE');
create type po_status as enum ('DRAFT','OPEN','PARTIALLY_RECEIVED','FULLY_RECEIVED','CLOSED','CANCELLED');
create type grn_status as enum ('OPEN','PARTIAL','COMPLETE','REJECTED');
create type invoice_source as enum ('EMAIL','UPLOAD','API','DEMO');
create type invoice_status as enum ('RECEIVED','PROCESSING','NEEDS_REVIEW','APPROVED','REJECTED','FAILED');
create type invoice_decision as enum ('AUTO_APPROVED','HUMAN_APPROVED','AUTO_REJECTED','HUMAN_REJECTED','NEEDS_REVIEW');
create type run_status as enum ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED');
create type step_status as enum ('PENDING','RUNNING','COMPLETED','FAILED','SKIPPED');
create type step_type as enum ('SYSTEM','AI','VALIDATION','MATCHING','POLICY','ACTION');
create type agent_decision_type as enum ('AUTO_APPROVED','AUTO_REJECTED','NEEDS_REVIEW');
create type agent_action as enum ('NONE','APPROVE','REJECT','CREATE_REVIEW');
create type action_status as enum ('PENDING','EXECUTED','FAILED','VERIFIED');
create type policy_status as enum ('DRAFT','ACTIVE','ARCHIVED');
create type review_status as enum ('OPEN','IN_PROGRESS','RESOLVED','CANCELLED');
create type review_reason as enum ('MISSING_PO','VENDOR_MISMATCH','PO_NOT_FOUND','PO_AMBIGUOUS','PRICE_VARIANCE','QUANTITY_VARIANCE','TOTAL_VARIANCE','TAX_MISMATCH','DUPLICATE_SUSPECTED','LOW_CONFIDENCE','THREE_WAY_MATCH_FAILURE','CURRENCY_MISMATCH','INVALID_TOTAL','SYSTEM_ERROR','OTHER');
create type review_priority as enum ('LOW','MEDIUM','HIGH','CRITICAL');
create type actor_type as enum ('AGENT','HUMAN','SYSTEM','VENDOR');
create type email_provider as enum ('GMAIL','IMAP','DEMO');

create table vendors (
 id uuid primary key default gen_random_uuid(), vendor_code text not null unique, legal_name text not null,
 display_name text not null, gstin text, tax_id text, email_domain text,
 currency text not null check (currency ~ '^[A-Z]{3}$'), status vendor_status not null default 'ACTIVE',
 address jsonb, archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (length(trim(vendor_code)) > 0), check (length(trim(legal_name)) > 0)
);
create table purchase_orders (
 id uuid primary key default gen_random_uuid(), po_number text not null unique,
 vendor_id uuid not null references vendors(id), currency text not null check (currency ~ '^[A-Z]{3}$'),
 status po_status not null default 'DRAFT', po_date date not null, valid_until date,
 subtotal numeric(18,4) not null check (subtotal >= 0), tax numeric(18,4) not null check (tax >= 0),
 total numeric(18,4) not null check (total >= 0), metadata jsonb,
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (valid_until is null or valid_until >= po_date)
);
create table purchase_order_lines (
 id uuid primary key default gen_random_uuid(), po_id uuid not null references purchase_orders(id),
 line_number integer not null check (line_number > 0), sku text, description text not null,
 quantity numeric(18,4) not null check (quantity >= 0), unit_price numeric(18,4) not null check (unit_price >= 0),
 tax_rate numeric(9,6) check (tax_rate between 0 and 1), amount numeric(18,4) not null check (amount >= 0),
 received_quantity numeric(18,4) not null default 0 check (received_quantity >= 0), metadata jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (po_id,line_number), unique (id,po_id)
);
create table goods_receipts (
 id uuid primary key default gen_random_uuid(), grn_number text not null unique,
 po_id uuid not null references purchase_orders(id), vendor_id uuid not null references vendors(id),
 receipt_date date not null, status grn_status not null default 'OPEN', metadata jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (id,po_id)
);
create table goods_receipt_lines (
 id uuid primary key default gen_random_uuid(), goods_receipt_id uuid not null references goods_receipts(id),
 po_line_id uuid not null references purchase_order_lines(id), received_quantity numeric(18,4) not null check (received_quantity >= 0),
 accepted_quantity numeric(18,4) not null check (accepted_quantity >= 0 and accepted_quantity <= received_quantity),
 metadata jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (goods_receipt_id,po_line_id)
);
create table email_messages (
 id uuid primary key default gen_random_uuid(), provider email_provider not null, message_id text not null,
 thread_id text, sender text not null, recipient text not null, subject text, received_at timestamptz not null,
 body_preview text, metadata jsonb, created_at timestamptz not null default now(), unique (provider,message_id)
);
create table email_attachments (
 id uuid primary key default gen_random_uuid(), email_message_id uuid not null references email_messages(id),
 filename text not null, mime_type text not null, size_bytes bigint not null check (size_bytes >= 0),
 storage_path text not null, document_hash text check (document_hash ~ '^[0-9a-f]{64}$'),
 processed boolean not null default false, created_at timestamptz not null default now(), unique (email_message_id,storage_path)
);
create table invoices (
 id uuid primary key default gen_random_uuid(), invoice_number text,
 vendor_id uuid references vendors(id), po_id uuid references purchase_orders(id),
 source invoice_source not null, source_message_id uuid references email_messages(id),
 source_attachment_id uuid references email_attachments(id), document_path text,
 document_hash text check (document_hash ~ '^[0-9a-f]{64}$'), invoice_date date, due_date date,
 currency text not null check (currency ~ '^[A-Z]{3}$'), subtotal numeric(18,4) check (subtotal >= 0),
 tax numeric(18,4) check (tax >= 0), total numeric(18,4) check (total >= 0),
 extraction_confidence numeric(5,4) check (extraction_confidence between 0 and 1),
 status invoice_status not null default 'RECEIVED', decision invoice_decision, decision_reason text,
 received_at timestamptz not null default now(), processed_at timestamptz,
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (due_date is null or invoice_date is null or due_date >= invoice_date)
);
create table invoice_lines (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id),
 line_number integer not null check (line_number > 0), sku text, description text not null,
 quantity numeric(18,4) not null check (quantity >= 0), unit_price numeric(18,4) not null check (unit_price >= 0),
 tax_rate numeric(9,6) check (tax_rate between 0 and 1), amount numeric(18,4) not null check (amount >= 0),
 extraction_confidence numeric(5,4) check (extraction_confidence between 0 and 1), metadata jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (invoice_id,line_number)
);
create table processing_runs (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id),
 status run_status not null default 'QUEUED', started_at timestamptz, completed_at timestamptz,
 duration_ms integer check (duration_ms >= 0), agent_version text not null, policy_version text,
 error_code text, error_message text, metadata jsonb, created_at timestamptz not null default now(),
 unique (id,invoice_id), check (completed_at is null or started_at is null or completed_at >= started_at)
);
create table agent_steps (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references processing_runs(id),
 step_number integer not null check (step_number > 0), step_type step_type not null, name text not null,
 status step_status not null default 'PENDING', input jsonb, output jsonb,
 confidence numeric(5,4) check (confidence between 0 and 1), duration_ms integer check (duration_ms >= 0),
 started_at timestamptz, completed_at timestamptz, error_message text,
 created_at timestamptz not null default now(), unique (run_id,step_number)
);
create table policies (
 id uuid primary key default gen_random_uuid(), name text not null, version text not null,
 status policy_status not null default 'DRAFT', configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
 effective_from timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (name,version)
);
create unique index one_active_policy on policies ((status)) where status = 'ACTIVE';
create table agent_decisions (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id),
 run_id uuid not null, decision agent_decision_type not null,
 confidence numeric(5,4) check (confidence between 0 and 1), summary text not null,
 reasoning_summary text not null, policy_id uuid references policies(id), policy_version text,
 action agent_action not null default 'NONE', action_status action_status not null default 'PENDING',
 created_at timestamptz not null default now(), foreign key (run_id,invoice_id) references processing_runs(id,invoice_id)
);
create table review_cases (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id),
 run_id uuid, status review_status not null default 'OPEN', reason_code review_reason not null,
 reason text not null, priority review_priority not null default 'MEDIUM', assigned_to uuid references auth.users(id),
 resolution text, resolved_by uuid references auth.users(id), resolved_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (run_id,invoice_id) references processing_runs(id,invoice_id),
 check ((status = 'RESOLVED') = (resolved_at is not null))
);
create table audit_events (
 id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices(id),
 run_id uuid, actor_type actor_type not null, actor_id text,
 event_type text not null, description text not null, metadata jsonb,
 created_at timestamptz not null default now(),
 foreign key (run_id,invoice_id) references processing_runs(id,invoice_id),
 check (run_id is null or invoice_id is not null)
);
create table invoice_documents (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references invoices(id),
 storage_path text not null unique, filename text not null, mime_type text not null,
 size_bytes bigint not null check (size_bytes >= 0), document_hash text check (document_hash ~ '^[0-9a-f]{64}$'),
 page_count integer check (page_count > 0), created_at timestamptz not null default now(),
 check (storage_path like invoice_id::text || '/%')
);

create index vendors_gstin_idx on vendors(gstin) where gstin is not null;
create index vendors_status_idx on vendors(status);
create index purchase_orders_vendor_status_idx on purchase_orders(vendor_id,status);
create index purchase_orders_status_idx on purchase_orders(status);
create index purchase_order_lines_po_idx on purchase_order_lines(po_id);
create index goods_receipts_po_idx on goods_receipts(po_id);
create index goods_receipts_vendor_idx on goods_receipts(vendor_id);
create index goods_receipt_lines_po_line_idx on goods_receipt_lines(po_line_id);
create index invoices_number_vendor_idx on invoices(vendor_id,invoice_number);
create index invoices_po_idx on invoices(po_id);
create index invoices_status_received_idx on invoices(status,received_at desc);
create index invoices_decision_idx on invoices(decision);
create index invoices_hash_idx on invoices(document_hash) where document_hash is not null;
create index invoices_received_idx on invoices(received_at desc);
create index invoice_lines_invoice_idx on invoice_lines(invoice_id);
create index processing_runs_invoice_created_idx on processing_runs(invoice_id,created_at desc);
create index processing_runs_status_idx on processing_runs(status);
create index agent_steps_run_idx on agent_steps(run_id);
create index agent_steps_status_idx on agent_steps(status);
create index agent_decisions_invoice_idx on agent_decisions(invoice_id);
create index agent_decisions_run_idx on agent_decisions(run_id);
create index review_cases_invoice_idx on review_cases(invoice_id);
create index review_cases_status_priority_idx on review_cases(status,priority);
create index audit_events_invoice_created_idx on audit_events(invoice_id,created_at desc);
create index audit_events_run_idx on audit_events(run_id);
create index audit_events_created_idx on audit_events(created_at desc);
create index email_messages_message_idx on email_messages(message_id);
create index email_attachments_message_idx on email_attachments(email_message_id);
create index email_attachments_hash_idx on email_attachments(document_hash);

create function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
 foreach t in array array['vendors','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines','invoices','invoice_lines','policies','review_cases'] loop
  execute format('create trigger set_updated_at before update on %I for each row execute function set_updated_at()',t);
 end loop;
end $$;

-- Financial audit history is append-only, including for the privileged application role.
create function reject_audit_mutation() returns trigger language plpgsql as $$
begin raise exception 'audit_events are append-only'; end $$;
create trigger audit_events_immutable before update or delete on audit_events
for each row execute function reject_audit_mutation();

-- A run and its first audit event are created atomically; the caller records later steps separately.
create function start_processing_run(p_invoice_id uuid, p_agent_version text, p_policy_version text default null)
returns uuid language plpgsql security invoker set search_path = public as $$
declare v_run_id uuid;
begin
 insert into processing_runs(invoice_id,status,started_at,agent_version,policy_version)
 values (p_invoice_id,'RUNNING',now(),p_agent_version,p_policy_version) returning id into v_run_id;
 update invoices set status = 'PROCESSING' where id = p_invoice_id;
 insert into audit_events(invoice_id,run_id,actor_type,event_type,description)
 values (p_invoice_id,v_run_id,'SYSTEM','PROCESSING_STARTED','Invoice processing run started');
 return v_run_id;
end $$;
revoke all on function start_processing_run(uuid,text,text) from public, anon, authenticated;
grant execute on function start_processing_run(uuid,text,text) to service_role;

-- Defense in depth: no browser role policies in Phase 01. Only the server-held service role can access data.
do $$ declare t text; begin
 foreach t in array array['vendors','purchase_orders','purchase_order_lines','goods_receipts','goods_receipt_lines','email_messages','email_attachments','invoices','invoice_lines','processing_runs','agent_steps','policies','agent_decisions','review_cases','audit_events','invoice_documents'] loop
  execute format('alter table %I enable row level security',t);
  execute format('revoke all on table %I from anon, authenticated',t);
  execute format('grant all on table %I to service_role',t);
 end loop;
end $$;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('invoice-documents','invoice-documents',false,20971520,array['application/pdf','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
