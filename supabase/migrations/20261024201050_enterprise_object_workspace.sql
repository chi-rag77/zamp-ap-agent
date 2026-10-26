-- Additive enterprise workspace. Core financial columns and decision engines stay authoritative.
create table public.payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 payment_number text not null, invoice_id uuid references public.invoices(id), vendor_id uuid references public.vendors(id),
 amount numeric(18,4) not null check(amount >= 0), currency text not null check(currency ~ '^[A-Z]{3}$'),
 status text not null default 'RECORDED' check(status in ('RECORDED','PENDING','PAID','FAILED','CANCELLED')),
 payment_date date, created_at timestamptz not null default now(), unique(organization_id,payment_number)
);
create table public.object_schema_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 object_type text not null check(object_type in ('invoice','purchase_order','goods_receipt','vendor','payment')),
 version integer not null check(version > 0), configuration jsonb not null check(jsonb_typeof(configuration)='object'),
 change_summary text not null, created_by text not null, created_at timestamptz not null default now(),
 unique(organization_id,object_type,version), unique(id,organization_id,object_type)
);
create table public.object_schema_heads (
 organization_id uuid not null references public.organizations(id), object_type text not null,
 schema_id uuid not null, updated_at timestamptz not null default now(), primary key(organization_id,object_type),
 foreign key(schema_id,organization_id,object_type) references public.object_schema_versions(id,organization_id,object_type)
);
create table public.object_field_values (
 organization_id uuid not null references public.organizations(id), object_type text not null, object_id uuid not null,
 schema_id uuid not null, record_values jsonb not null default '{}', line_values jsonb not null default '{}', revision integer not null default 1,
 updated_by text not null, updated_at timestamptz not null default now(), primary key(organization_id,object_type,object_id),
 foreign key(schema_id,organization_id,object_type) references public.object_schema_versions(id,organization_id,object_type),
 check(jsonb_typeof(record_values)='object' and jsonb_typeof(line_values)='object')
);
create table public.object_messages (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 object_type text not null, object_id uuid not null, parent_id uuid references public.object_messages(id),
 body text not null check(length(body) between 1 and 10000), created_by text not null, author_name text not null,
 mentions text[] not null default '{}', resolved_at timestamptz, edited_at timestamptz, created_at timestamptz not null default now()
);
create table public.object_reactions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 object_type text not null, object_id uuid not null, message_id uuid not null references public.object_messages(id),
 created_by text not null, emoji text not null check(emoji in ('👍','✅','👀')), created_at timestamptz not null default now(),
 unique(message_id,created_by,emoji)
);
create table public.object_assignments (
 organization_id uuid not null references public.organizations(id), object_type text not null, object_id uuid not null,
 assignee text, waiting_on text, reason text not null default '', due_date date, tags text[] not null default '{}',
 updated_by text not null, updated_at timestamptz not null default now(), primary key(organization_id,object_type,object_id)
);
create table public.object_notifications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 object_type text not null, object_id uuid not null, recipient text not null, title text not null, message text not null,
 read_at timestamptz, created_at timestamptz not null default now()
);
create table public.object_attachments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 object_type text not null, object_id uuid not null, message_id uuid references public.object_messages(id),
 filename text not null, mime_type text not null, size_bytes bigint not null check(size_bytes between 1 and 10485760),
 storage_path text not null unique, file_hash text not null, created_by text not null, created_at timestamptz not null default now()
);
create table public.data_import_jobs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 object_type text not null, filename text not null, created_by text not null, status text not null default 'UPLOADED'
 check(status in ('UPLOADED','MAPPING','VALIDATING','READY','IMPORTING','COMPLETED','PARTIAL','FAILED')),
 rows jsonb not null default '[]', mapping jsonb not null default '{}', results jsonb not null default '[]',
 success_count integer not null default 0, error_count integer not null default 0,
 created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.object_saved_views (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 object_type text not null, created_by text not null, name text not null, configuration jsonb not null,
 created_at timestamptz not null default now(), unique(organization_id,object_type,created_by,name)
);
create table public.integration_field_mappings (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 integration_id uuid not null references public.integrations(id), object_type text not null, source_field text not null,
 target_field text not null, direction text not null check(direction in ('INBOUND','OUTBOUND')),
 transformation text not null default 'NONE' check(transformation in ('NONE','TRIM','UPPERCASE','LOWERCASE')),
 required boolean not null default false, created_by text not null, created_at timestamptz not null default now(),
 unique(integration_id,object_type,source_field,direction)
);
create or replace function private.check_workspace_object() returns trigger language plpgsql set search_path='' as $$
declare t text; owner_id uuid; related record;
begin
 if tg_op='UPDATE' and (old.organization_id<>new.organization_id or old.object_id<>new.object_id or old.object_type<>new.object_type) then raise exception 'Object ownership cannot change'; end if;
 t:=case new.object_type when 'invoice' then 'invoices' when 'purchase_order' then 'purchase_orders' when 'goods_receipt' then 'goods_receipts' when 'vendor' then 'vendors' when 'payment' then 'payments' else null end;
 if t is null then raise exception 'Invalid object type'; end if;
 execute format('select organization_id from public.%I where id=$1',t) into owner_id using new.object_id;
 if owner_id is distinct from new.organization_id then raise exception 'Object does not belong to organization'; end if;
 if tg_table_name='object_messages' then
 if new.parent_id is not null then
  select organization_id,object_type,object_id into related from public.object_messages where id=new.parent_id;
  if related.organization_id is distinct from new.organization_id or related.object_type<>new.object_type or related.object_id<>new.object_id then raise exception 'Reply must belong to the same object'; end if;
 end if;
 end if;
 if tg_table_name in ('object_reactions','object_attachments') then
  if new.message_id is not null then
   select organization_id,object_type,object_id into related from public.object_messages where id=new.message_id;
   if related.organization_id is distinct from new.organization_id or related.object_type<>new.object_type or related.object_id<>new.object_id then raise exception 'Message must belong to the same object'; end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function private.check_workspace_object() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['object_field_values','object_messages','object_reactions','object_assignments','object_notifications','object_attachments'] loop
 execute format('create trigger %I before insert or update on public.%I for each row execute function private.check_workspace_object()',t||'_owner',t);
 execute format('create index %I on public.%I (organization_id,object_type,object_id)',t||'_object_idx',t);
 end loop;
 foreach t in array array['payments','object_schema_versions','object_schema_heads','object_field_values','object_messages','object_reactions','object_assignments','object_notifications','object_attachments','data_import_jobs','object_saved_views','integration_field_mappings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy %I on public.%I for select to authenticated using (organization_id=(select private.current_organization_id())%s)',t||'_read',t,case when t='object_notifications' then ' and recipient=(select auth.jwt()->>''sub'')' when t='object_saved_views' then ' and created_by=(select auth.jwt()->>''sub'')' else '' end);
 end loop;
end $$;
create index object_notifications_recipient_idx on public.object_notifications(organization_id,recipient,created_at desc);
create index data_import_jobs_org_idx on public.data_import_jobs(organization_id,created_at desc);
create index integration_field_mappings_org_idx on public.integration_field_mappings(organization_id,integration_id);
create or replace function private.workspace_audit() returns trigger language plpgsql set search_path='' as $$
declare row_data jsonb:=to_jsonb(new); old_data jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else null end;
begin
 insert into public.audit_events(organization_id,actor_type,actor_id,event_type,description,metadata)
 values(new.organization_id,'USER',coalesce(row_data->>'updated_by',row_data->>'created_by'),tg_table_name||'_'||lower(tg_op),
 replace(tg_table_name,'_',' ')||' '||lower(tg_op),jsonb_build_object('objectType',row_data->>'object_type','objectId',row_data->>'object_id','before',old_data,'after',row_data));
 return new;
end $$;
revoke all on function private.workspace_audit() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['object_schema_versions','object_field_values','object_messages','object_assignments','object_attachments','data_import_jobs','integration_field_mappings'] loop
 execute format('create trigger %I after insert or update on public.%I for each row execute function private.workspace_audit()',t||'_audit',t);
 end loop;
end $$;
create or replace function private.immutable_schema_version() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Schema versions are immutable'; end $$;
revoke all on function private.immutable_schema_version() from public,anon,authenticated;
create trigger schema_version_immutable before update or delete on public.object_schema_versions for each row execute function private.immutable_schema_version();
create function public.publish_object_schema(p_org uuid,p_type text,p_config jsonb,p_actor text,p_summary text,p_expected uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare current_id uuid; next_version integer; new_id uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||p_type,0));
 select schema_id into current_id from public.object_schema_heads where organization_id=p_org and object_type=p_type;
 if current_id is distinct from p_expected then raise exception 'Schema changed. Reload before publishing.'; end if;
 select coalesce(max(version),0)+1 into next_version from public.object_schema_versions where organization_id=p_org and object_type=p_type;
 insert into public.object_schema_versions(organization_id,object_type,version,configuration,created_by,change_summary) values(p_org,p_type,next_version,p_config,p_actor,p_summary) returning id into new_id;
 insert into public.object_schema_heads(organization_id,object_type,schema_id) values(p_org,p_type,new_id) on conflict(organization_id,object_type) do update set schema_id=excluded.schema_id,updated_at=now();
 return new_id;
end $$;
revoke all on function public.publish_object_schema(uuid,text,jsonb,text,text,uuid) from public,anon,authenticated;
grant execute on function public.publish_object_schema(uuid,text,jsonb,text,text,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('object-attachments','object-attachments',false,10485760,array['application/pdf','image/png','image/jpeg','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict(id) do nothing;
-- A confirmed import commits as a single transaction and locks its job against retries.
create function public.commit_object_import(p_org uuid,p_job uuid,p_actor text,p_records jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare j public.data_import_jobs; r jsonb; n integer:=0; new_id uuid; ids jsonb:='[]'; owner_id uuid;
begin
 select * into j from public.data_import_jobs where id=p_job and organization_id=p_org and created_by=p_actor for update;
 if not found then raise exception 'Import not found'; end if;
 if j.status='COMPLETED' then return j.success_count; end if;
 if j.status<>'READY' or jsonb_array_length(p_records)<>jsonb_array_length(j.rows) then raise exception 'Import requires validation'; end if;
 update public.data_import_jobs set status='IMPORTING' where id=p_job;
 for r in select value from jsonb_array_elements(p_records) loop
  if r ? 'vendor_id' then select organization_id into owner_id from public.vendors where id=(r->>'vendor_id')::uuid; if owner_id is distinct from p_org then raise exception 'Vendor organization mismatch'; end if; end if;
  if r ? 'po_id' then select organization_id into owner_id from public.purchase_orders where id=(r->>'po_id')::uuid and vendor_id=(r->>'vendor_id')::uuid; if owner_id is distinct from p_org then raise exception 'PO organization or vendor mismatch'; end if; end if;
  if r ? 'invoice_id' then select organization_id into owner_id from public.invoices where id=(r->>'invoice_id')::uuid and vendor_id=(r->>'vendor_id')::uuid; if owner_id is distinct from p_org then raise exception 'Invoice organization or vendor mismatch'; end if; end if;
  case j.object_type
   when 'vendor' then insert into public.vendors(organization_id,vendor_code,legal_name,display_name,currency,gstin,tax_id,email_domain) values(p_org,r->>'vendor_code',r->>'legal_name',r->>'display_name',r->>'currency',r->>'gstin',r->>'tax_id',r->>'email_domain') returning id into new_id;
   when 'purchase_order' then insert into public.purchase_orders(organization_id,po_number,vendor_id,currency,po_date,valid_until,subtotal,tax,total) values(p_org,r->>'po_number',(r->>'vendor_id')::uuid,r->>'currency',(r->>'po_date')::date,(r->>'valid_until')::date,(r->>'subtotal')::numeric,(r->>'tax')::numeric,(r->>'total')::numeric) returning id into new_id;
   when 'invoice' then
    if exists(select 1 from public.invoices where organization_id=p_org and invoice_number=r->>'invoice_number') then raise exception 'Duplicate invoice'; end if;
    insert into public.invoices(organization_id,invoice_number,vendor_id,po_id,source,invoice_date,due_date,currency,subtotal,tax,total) values(p_org,r->>'invoice_number',(r->>'vendor_id')::uuid,(r->>'po_id')::uuid,'UPLOAD',(r->>'invoice_date')::date,(r->>'due_date')::date,r->>'currency',(r->>'subtotal')::numeric,(r->>'tax')::numeric,(r->>'total')::numeric) returning id into new_id;
   when 'goods_receipt' then insert into public.goods_receipts(organization_id,grn_number,po_id,vendor_id,receipt_date) values(p_org,r->>'grn_number',(r->>'po_id')::uuid,(r->>'vendor_id')::uuid,(r->>'receipt_date')::date) returning id into new_id;
   when 'payment' then insert into public.payments(organization_id,payment_number,invoice_id,vendor_id,amount,currency,payment_date) values(p_org,r->>'payment_number',(r->>'invoice_id')::uuid,(r->>'vendor_id')::uuid,(r->>'amount')::numeric,r->>'currency',(r->>'payment_date')::date) returning id into new_id;
   else raise exception 'Unsupported object';
  end case;
  n:=n+1;ids:=ids||jsonb_build_array(jsonb_build_object('row',n+1,'id',new_id,'status','IMPORTED'));
  insert into public.audit_events(organization_id,actor_type,actor_id,event_type,description,metadata) values(p_org,'USER',p_actor,'OBJECT_IMPORTED','Record created from reviewed import',jsonb_build_object('objectType',j.object_type,'objectId',new_id,'importId',p_job));
 end loop;
 update public.data_import_jobs set status='COMPLETED',success_count=n,error_count=0,results=ids,completed_at=now() where id=p_job;
 return n;
end $$;
revoke all on function public.commit_object_import(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_object_import(uuid,uuid,text,jsonb) to service_role;

create index payments_invoice_idx on public.payments(organization_id,invoice_id);
create index payments_vendor_idx on public.payments(organization_id,vendor_id);
create index object_messages_parent_idx on public.object_messages(parent_id);
create index object_attachments_message_idx on public.object_attachments(message_id);
create index object_values_schema_idx on public.object_field_values(schema_id,organization_id,object_type);
create index object_heads_schema_idx on public.object_schema_heads(schema_id,organization_id,object_type);
-- Enforce ownership even for writes made through service-role adapters.
create function private.workspace_reference_owner() returns trigger language plpgsql set search_path='' as $$
declare owner_id uuid;
begin
 if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Organization cannot change'; end if;
 if tg_table_name='payments' then
  if new.invoice_id is not null then select organization_id into owner_id from public.invoices where id=new.invoice_id; if owner_id is distinct from new.organization_id then raise exception 'Invoice organization mismatch'; end if; end if;
  if new.vendor_id is not null then select organization_id into owner_id from public.vendors where id=new.vendor_id; if owner_id is distinct from new.organization_id then raise exception 'Vendor organization mismatch'; end if; end if;
 elsif tg_table_name='integration_field_mappings' then
  select organization_id into owner_id from public.integrations where id=new.integration_id; if owner_id is distinct from new.organization_id then raise exception 'Integration organization mismatch'; end if;
 end if;
 return new;
end $$;
revoke all on function private.workspace_reference_owner() from public,anon,authenticated;
create trigger payment_owner before insert or update on public.payments for each row execute function private.workspace_reference_owner();
create trigger mapping_owner before insert or update on public.integration_field_mappings for each row execute function private.workspace_reference_owner();
