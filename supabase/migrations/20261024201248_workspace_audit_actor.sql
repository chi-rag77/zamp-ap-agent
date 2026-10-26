create or replace function private.workspace_audit() returns trigger language plpgsql set search_path='' as $$
declare row_data jsonb:=to_jsonb(new); old_data jsonb:=case when tg_op='UPDATE' then to_jsonb(old) else null end;
begin
 insert into public.audit_events(organization_id,actor_type,actor_id,event_type,description,metadata)
 values(new.organization_id,'HUMAN',coalesce(row_data->>'updated_by',row_data->>'created_by'),tg_table_name||'_'||lower(tg_op),
 replace(tg_table_name,'_',' ')||' '||lower(tg_op),jsonb_build_object('objectType',row_data->>'object_type','objectId',row_data->>'object_id','before',old_data,'after',row_data));
 return new;
end $$;
create or replace function public.commit_object_import(p_org uuid,p_job uuid,p_actor text,p_records jsonb)
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
  insert into public.audit_events(organization_id,actor_type,actor_id,event_type,description,metadata) values(p_org,'HUMAN',p_actor,'OBJECT_IMPORTED','Record created from reviewed import',jsonb_build_object('objectType',j.object_type,'objectId',new_id,'importId',p_job));
 end loop;
 update public.data_import_jobs set status='COMPLETED',success_count=n,error_count=0,results=ids,completed_at=now() where id=p_job;
 return n;
end $$;
