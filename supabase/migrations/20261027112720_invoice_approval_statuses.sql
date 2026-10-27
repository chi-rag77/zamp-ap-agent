-- Extend the invoice state machine before any approval workflow function uses
-- these values. Kept as its own migration so PostgreSQL commits enum changes
-- before later migrations refer to them.
alter type public.invoice_status add value if not exists 'PENDING_APPROVAL';
alter type public.invoice_status add value if not exists 'RETURNED_FOR_CORRECTION';
