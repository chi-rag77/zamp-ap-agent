create index if not exists audit_events_purchase_order_creator_lookup_idx
  on public.audit_events (organization_id, (metadata ->> 'objectId'), created_at asc)
  where metadata ->> 'objectType' = 'purchase_order'
    and actor_id is not null;
