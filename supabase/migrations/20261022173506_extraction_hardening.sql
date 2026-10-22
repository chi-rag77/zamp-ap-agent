-- Preserve the distinction between malformed model output and provider failure.
create function classify_failed_extraction() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status='FAILED' and new.error_code in ('EXTRACTION_JSON_INVALID','EXTRACTION_SCHEMA_INVALID','EXTRACTION_INCOMPLETE','NVIDIA_INVALID_RESPONSE') then
  new.status:='INVALID';
 end if;
 return new;
end $$;
create trigger invoice_extractions_classify before insert on invoice_extractions
for each row execute function classify_failed_extraction();

alter function set_updated_at() set search_path=public;
alter function reject_audit_mutation() set search_path=public;
alter function reject_extraction_mutation() set search_path=public;

create index invoice_extractions_run_invoice_idx on invoice_extractions(run_id,invoice_id);
create index invoices_current_extraction_idx on invoices(current_extraction_id) where current_extraction_id is not null;
create index invoice_documents_invoice_idx on invoice_documents(invoice_id,created_at desc);
