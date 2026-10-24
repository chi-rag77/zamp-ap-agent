-- Reserve each invoice content hash before creating an invoice, including parallel attachments.
drop index if exists email_attachments_invoice_hash_unique;
create unique index email_attachments_invoice_hash_unique on email_attachments(document_hash)
 where document_role='INVOICE' and document_status in ('VALIDATED','STORED') and document_hash is not null;
