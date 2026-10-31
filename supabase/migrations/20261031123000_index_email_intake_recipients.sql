-- Store recipient values in a consistent form so mailbox-scoped queries can use
-- a GIN index instead of scanning every intake row in application memory.
update public.email_intakes
set to_addresses = array(
  select lower(trim(regexp_replace(address, '^.*<([^<>]+)>.*$', '\1')))
  from unnest(to_addresses) as recipients(address)
  where trim(address) <> ''
)
where cardinality(to_addresses) > 0;

create index if not exists email_intakes_to_addresses_gin_idx
  on public.email_intakes using gin (to_addresses);
