-- Preserve source and supporting email documents without treating supporting files as invoices.
create table email_documents (
 id uuid primary key default gen_random_uuid(), email_intake_id uuid not null references email_intakes(id),
 email_attachment_id uuid not null unique references email_attachments(id), invoice_id uuid references invoices(id),
 storage_bucket text not null default 'invoice-documents', storage_path text not null unique,
 filename text not null, mime_type text not null, size_bytes bigint not null check(size_bytes>=0),
 sha256 text not null check(sha256 ~ '^[0-9a-f]{64}$'),
 document_role text not null check(document_role in ('INVOICE','SUPPORTING_DOCUMENT')),
 status text not null default 'STORED' check(status in ('STORED','PROCESSING','PROCESSED','FAILED')),
 created_at timestamptz not null default now()
);
create index email_documents_intake_idx on email_documents(email_intake_id);
create index email_documents_invoice_idx on email_documents(invoice_id) where invoice_id is not null;
alter table email_documents enable row level security;
revoke all on email_documents from anon,authenticated;
grant all on email_documents to service_role;
