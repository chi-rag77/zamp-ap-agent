begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(6);

select has_table('public','organizations','Tenant registry exists');
select has_table('public','organization_memberships','WorkOS membership mapping exists');
select ok((select relrowsecurity from pg_class where oid='public.invoices'::regclass),'Invoices enforce row-level security');
select ok((select relrowsecurity from pg_class where oid='public.agent_runs'::regclass),'Agent runs enforce row-level security');

insert into organizations(id,workos_organization_id,name) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','org_test_alpha','Tenant Alpha'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','org_test_beta','Tenant Beta');
insert into organization_memberships(organization_id,workos_user_id,email) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','user_test_alpha','alpha@example.test'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user_test_beta','beta@example.test');
insert into invoices(id,organization_id,source,currency,status) values
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','DEMO','INR','RECEIVED'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','DEMO','INR','RECEIVED');

set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"user_test_alpha","org_id":"org_test_alpha"}',true);
select is((select count(*)::integer from invoices),1,'A WorkOS session sees only its own tenant rows');
select is((select count(*)::integer from invoices where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),0,'A tenant cannot read another tenant invoice by ID');
select * from finish();
rollback;
