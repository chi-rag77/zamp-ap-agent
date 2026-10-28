-- External API credentials are organization scoped. Store only a SHA-256 digest;
-- the raw credential is returned exactly once by the authenticated key-creation route.
create table public.integration_api_keys (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 name text not null check (char_length(name) between 2 and 80),
 key_prefix text not null check (key_prefix like 'zamp_live_%'),
 key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
 created_by text not null,
 created_at timestamptz not null default now(),
 last_used_at timestamptz,
 revoked_at timestamptz
);
create index integration_api_keys_org_created on public.integration_api_keys(organization_id,created_at desc);
alter table public.integration_api_keys enable row level security;
revoke all on public.integration_api_keys from anon,authenticated;
grant select,insert,update on public.integration_api_keys to service_role;

-- Log only authenticated endpoint use; never store credentials, request bodies, or headers.
create table public.integration_api_requests (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 api_key_id uuid references public.integration_api_keys(id) on delete set null,
 method text not null check (method in ('GET','POST')),
 path text not null check (path in ('/api/v1/health','/api/v1/purchase-orders')),
 status_code integer not null check (status_code between 100 and 599),
 duration_ms integer not null check (duration_ms >= 0),
 created_at timestamptz not null default now()
);
create index integration_api_requests_org_created on public.integration_api_requests(organization_id,created_at desc);
alter table public.integration_api_requests enable row level security;
revoke all on public.integration_api_requests from anon,authenticated;
grant select,insert on public.integration_api_requests to service_role;

-- Create a purchase order and all its lines atomically for authenticated API clients.
create or replace function public.create_integration_purchase_order(
 p_organization_id uuid,
 p_api_key_id uuid,
 p_purchase_order jsonb,
 p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
 v_po_id uuid;
 v_po_number text := p_purchase_order->>'po_number';
 v_line jsonb;
 v_line_number integer := 0;
begin
 if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 or jsonb_array_length(p_lines) > 500 then
  raise exception 'PO must contain between 1 and 500 lines' using errcode = '22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || v_po_number, 0));
 if exists(select 1 from public.purchase_orders where organization_id=p_organization_id and po_number=v_po_number and archived_at is null) then
  raise exception 'A purchase order with this number already exists in the organization' using errcode = '23505';
 end if;
 if not exists(select 1 from public.vendors where organization_id=p_organization_id and id=(p_purchase_order->>'vendor_id')::uuid and status='ACTIVE' and archived_at is null) then
  raise exception 'Vendor not found or not active in this organization' using errcode = '23503';
 end if;
 insert into public.purchase_orders(organization_id,po_number,vendor_id,currency,status,po_date,valid_until,subtotal,tax,total,metadata)
 values(p_organization_id,v_po_number,(p_purchase_order->>'vendor_id')::uuid,p_purchase_order->>'currency','OPEN',
  (p_purchase_order->>'po_date')::date,nullif(p_purchase_order->>'valid_until','')::date,
  (p_purchase_order->>'subtotal')::numeric,(p_purchase_order->>'tax')::numeric,(p_purchase_order->>'total')::numeric,
  jsonb_build_object('created_via','integration_api','api_key_id',p_api_key_id))
 returning id into v_po_id;
 for v_line in select value from jsonb_array_elements(p_lines) loop
  v_line_number := v_line_number + 1;
  insert into public.purchase_order_lines(organization_id,po_id,line_number,sku,description,quantity,unit_price,tax_rate,amount,received_quantity,metadata)
  values(p_organization_id,v_po_id,v_line_number,nullif(v_line->>'sku',''),v_line->>'description',
   (v_line->>'quantity')::numeric,(v_line->>'unit_price')::numeric,nullif(v_line->>'tax_rate','')::numeric,
   (v_line->>'amount')::numeric,0,'{}'::jsonb);
 end loop;
 insert into public.audit_events(organization_id,actor_type,actor_id,event_type,description,metadata)
 values(p_organization_id,'SYSTEM',p_api_key_id::text,'PURCHASE_ORDER_CREATED','Purchase order created through the authenticated integration API',
  jsonb_build_object('objectType','purchase_order','objectId',v_po_id,'poNumber',v_po_number,'apiKeyId',p_api_key_id));
 return v_po_id;
end;
$$;
revoke all on function public.create_integration_purchase_order(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.create_integration_purchase_order(uuid,uuid,jsonb,jsonb) to service_role;
