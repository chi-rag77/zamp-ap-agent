-- Deterministic demo fixtures; loaded by `supabase db reset` after migrations.
insert into vendors(id,vendor_code,legal_name,display_name,gstin,email_domain,currency,status) values
('10000000-0000-0000-0000-000000000001','ACME-001','Acme Industrial Supplies','Acme Industrial Supplies','27ABCDE1234F1Z5','acme.example','INR','ACTIVE'),
('10000000-0000-0000-0000-000000000002','GLOBAL-001','Global Components','Global Components',null,'global.example','INR','ACTIVE'),
('10000000-0000-0000-0000-000000000003','DELTA-001','Delta Office Systems','Delta Office Systems',null,'delta.example','INR','ACTIVE'),
('10000000-0000-0000-0000-000000000004','NOVA-001','Nova Manufacturing','Nova Manufacturing',null,'nova.example','INR','ACTIVE'),
('10000000-0000-0000-0000-000000000005','VERTEX-001','Vertex Technologies','Vertex Technologies',null,'vertex.example','INR','ACTIVE');

insert into purchase_orders(id,po_number,vendor_id,currency,status,po_date,subtotal,tax,total) values
('20000000-0000-0000-0000-000000000001','PO-10234','10000000-0000-0000-0000-000000000001','INR','OPEN','2026-10-01',100000,12100,112100),
('20000000-0000-0000-0000-000000000002','PO-10231','10000000-0000-0000-0000-000000000002','INR','OPEN','2026-10-01',160000,12000,172000),
('20000000-0000-0000-0000-000000000003','PO-10198','10000000-0000-0000-0000-000000000003','INR','OPEN','2026-09-23',50000,9000,59000),
('20000000-0000-0000-0000-000000000004','PO-10245','10000000-0000-0000-0000-000000000004','INR','OPEN','2026-10-05',75000,13500,88500),
('20000000-0000-0000-0000-000000000005','PO-10250','10000000-0000-0000-0000-000000000005','INR','OPEN','2026-10-07',90000,16200,106200);
insert into purchase_order_lines(id,po_id,line_number,sku,description,quantity,unit_price,tax_rate,amount,received_quantity) values
('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'VALVE-01','Industrial Valve',10,8000,0.12,80000,10),
('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',2,'GAUGE-01','Pressure Gauge',4,5000,0.125,20000,4),
('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002',1,'COMP-01','Control Components',20,8000,0.075,160000,20),
('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000003',1,'DESK-01','Office Workstations',10,5000,0.18,50000,10),
('30000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000004',1,'PART-01','Machined Parts',10,7500,0.18,75000,8),
('30000000-0000-0000-0000-000000000006','20000000-0000-0000-0000-000000000005',1,'TECH-01','Network Equipment',10,9000,0.18,90000,10);
insert into goods_receipts(id,grn_number,po_id,vendor_id,receipt_date,status) values
('40000000-0000-0000-0000-000000000001','GRN-2045','20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','2026-10-15','PARTIAL');
insert into goods_receipt_lines(goods_receipt_id,po_line_id,received_quantity,accepted_quantity) values
('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005',8,8);

insert into invoices(id,invoice_number,vendor_id,po_id,source,invoice_date,due_date,currency,subtotal,tax,total,extraction_confidence,status,received_at) values
('50000000-0000-0000-0000-000000000001','INV-1048','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','DEMO','2026-10-16','2026-11-15','INR',100000,12100,112100,0.984,'RECEIVED','2026-10-17 09:00:00+05:30'),
('50000000-0000-0000-0000-000000000002','INV-1047','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','DEMO','2026-10-16','2026-11-15','INR',172500,12000,184500,0.965,'RECEIVED','2026-10-17 09:10:00+05:30'),
('50000000-0000-0000-0000-000000000003','INV-1046','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','DEMO','2026-10-14','2026-11-13','INR',50000,9000,59000,0.976,'RECEIVED','2026-10-17 09:20:00+05:30'),
('50000000-0000-0000-0000-000000000004','INV-1046','10000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','DEMO','2026-10-14','2026-11-13','INR',50000,9000,59000,0.973,'RECEIVED','2026-10-18 09:20:00+05:30'),
('50000000-0000-0000-0000-000000000005','INV-1042','10000000-0000-0000-0000-000000000004',null,'DEMO','2026-10-15','2026-11-14','INR',75000,13500,88500,0.958,'RECEIVED','2026-10-18 10:00:00+05:30'),
('50000000-0000-0000-0000-000000000006','INV-1041','10000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000005','DEMO','2026-10-15','2026-11-14','INR',90000,16200,106200,0.710,'RECEIVED','2026-10-18 10:10:00+05:30'),
('50000000-0000-0000-0000-000000000007','INV-1040','10000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','DEMO','2026-10-16','2026-11-15','INR',75000,13500,88500,0.962,'RECEIVED','2026-10-18 10:20:00+05:30');
insert into invoice_lines(invoice_id,line_number,sku,description,quantity,unit_price,tax_rate,amount,extraction_confidence) values
('50000000-0000-0000-0000-000000000001',1,'VALVE-01','Industrial Valve',10,8000,0.12,80000,0.987),
('50000000-0000-0000-0000-000000000001',2,'GAUGE-01','Pressure Gauge',4,5000,0.125,20000,0.982),
('50000000-0000-0000-0000-000000000002',1,'COMP-01','Control Components',20,8625,0.069565,172500,0.965),
('50000000-0000-0000-0000-000000000003',1,'DESK-01','Office Workstations',10,5000,0.18,50000,0.976),
('50000000-0000-0000-0000-000000000004',1,'DESK-01','Office Workstations',10,5000,0.18,50000,0.973),
('50000000-0000-0000-0000-000000000005',1,'PART-01','Machined Parts',10,7500,0.18,75000,0.958),
('50000000-0000-0000-0000-000000000006',1,'TECH-01','Network Equipment',10,9000,0.18,90000,0.710),
('50000000-0000-0000-0000-000000000007',1,'PART-01','Machined Parts',10,7500,0.18,75000,0.962);
insert into policies(id,name,version,status,effective_from,configuration) values
('60000000-0000-0000-0000-000000000001','Default AP Auto-Approval Policy','1','ACTIVE','2026-10-01',
'{"autoApproval":{"requiresPo":true,"maxQuantityVariance":0,"maxPriceVariance":0.02,"maxTotalVariance":0.02,"minExtractionConfidence":0.9},"review":{"missingPo":true,"vendorMismatch":true,"lowConfidence":true,"priceVarianceAboveLimit":true,"quantityVarianceAboveLimit":true,"threeWayMatchFailure":true},"reject":{"confirmedDuplicate":true,"blockedVendor":true}}'::jsonb);
insert into audit_events(invoice_id,actor_type,event_type,description,metadata)
select id,'SYSTEM','INVOICE_RECEIVED','Demo invoice received',jsonb_build_object('source','DEMO','scenario',case id
 when '50000000-0000-0000-0000-000000000001' then 'perfect'
 when '50000000-0000-0000-0000-000000000002' then 'price_variance'
 when '50000000-0000-0000-0000-000000000003' then 'duplicate_original'
 when '50000000-0000-0000-0000-000000000004' then 'duplicate_candidate'
 when '50000000-0000-0000-0000-000000000005' then 'missing_po'
 when '50000000-0000-0000-0000-000000000006' then 'low_confidence'
 else 'three_way_failure' end) from invoices;
-- These are explicitly labelled historical demo fixtures, not output from a live agent.
insert into processing_runs(id,invoice_id,status,started_at,completed_at,duration_ms,agent_version,policy_version,metadata) values
('70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','COMPLETED','2026-10-17 09:01:00+05:30','2026-10-17 09:01:12+05:30',12000,'demo-fixture-v1','1','{"fixture":true}'),
('70000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','COMPLETED','2026-10-17 09:11:00+05:30','2026-10-17 09:11:12+05:30',12000,'demo-fixture-v1','1','{"fixture":true}'),
('70000000-0000-0000-0000-000000000003','50000000-0000-0000-0000-000000000003','COMPLETED','2026-10-17 09:21:00+05:30','2026-10-17 09:21:12+05:30',12000,'demo-fixture-v1','1','{"fixture":true}'),
('70000000-0000-0000-0000-000000000004','50000000-0000-0000-0000-000000000004','COMPLETED','2026-10-18 09:21:00+05:30','2026-10-18 09:21:12+05:30',12000,'demo-fixture-v1','1','{"fixture":true}'),
('70000000-0000-0000-0000-000000000005','50000000-0000-0000-0000-000000000005','COMPLETED','2026-10-18 10:01:00+05:30','2026-10-18 10:01:12+05:30',12000,'demo-fixture-v1','1','{"fixture":true}'),
('70000000-0000-0000-0000-000000000006','50000000-0000-0000-0000-000000000006','COMPLETED','2026-10-18 10:11:00+05:30','2026-10-18 10:11:12+05:30',12000,'demo-fixture-v1','1','{"fixture":true}'),
('70000000-0000-0000-0000-000000000007','50000000-0000-0000-0000-000000000007','COMPLETED','2026-10-18 10:21:00+05:30','2026-10-18 10:21:12+05:30',12000,'demo-fixture-v1','1','{"fixture":true}');
insert into agent_steps(run_id,step_number,step_type,name,status,input,output,confidence,duration_ms,started_at,completed_at)
select id,1,'SYSTEM','Demo invoice received','COMPLETED','{"fixture":true}'::jsonb,'{"source":"DEMO"}'::jsonb,null,1000,started_at,started_at + interval '1 second' from processing_runs;
insert into agent_steps(run_id,step_number,step_type,name,status,input,output,confidence,duration_ms,started_at,completed_at)
select id,2,'VALIDATION','Demo scenario evaluated','COMPLETED','{"fixture":true}'::jsonb,
 jsonb_build_object('scenario',metadata->>'fixture','note','precomputed demo fixture'),null,10000,started_at + interval '1 second',completed_at from processing_runs;
insert into agent_decisions(invoice_id,run_id,decision,confidence,summary,reasoning_summary,policy_id,policy_version,action,action_status) values
('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','AUTO_APPROVED',0.984,'Demo: exact PO match','Invoice total equals PO total; confidence above 0.90.','60000000-0000-0000-0000-000000000001','1','APPROVE','VERIFIED'),
('50000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','NEEDS_REVIEW',0.965,'Demo: total variance','Invoice total 184500 vs PO total 172000; variance 7.27% exceeds 2% threshold.','60000000-0000-0000-0000-000000000001','1','CREATE_REVIEW','VERIFIED'),
('50000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000003','AUTO_APPROVED',0.976,'Demo: original invoice','Original vendor invoice predates duplicate candidate.','60000000-0000-0000-0000-000000000001','1','APPROVE','VERIFIED'),
('50000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000004','AUTO_REJECTED',0.973,'Demo: confirmed duplicate','Same vendor and invoice number as earlier record.','60000000-0000-0000-0000-000000000001','1','REJECT','VERIFIED'),
('50000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000005','NEEDS_REVIEW',0.958,'Demo: missing PO','Invoice has no purchase order reference.','60000000-0000-0000-0000-000000000001','1','CREATE_REVIEW','VERIFIED'),
('50000000-0000-0000-0000-000000000006','70000000-0000-0000-0000-000000000006','NEEDS_REVIEW',0.710,'Demo: low confidence','Extraction confidence 0.71 is below 0.90 threshold.','60000000-0000-0000-0000-000000000001','1','CREATE_REVIEW','VERIFIED'),
('50000000-0000-0000-0000-000000000007','70000000-0000-0000-0000-000000000007','NEEDS_REVIEW',0.962,'Demo: three-way mismatch','Invoice quantity 10 exceeds accepted goods receipt quantity 8.','60000000-0000-0000-0000-000000000001','1','CREATE_REVIEW','VERIFIED');
insert into review_cases(invoice_id,run_id,reason_code,reason,priority) values
('50000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','TOTAL_VARIANCE','Invoice exceeds PO by 7.27%; policy tolerance is 2%.','HIGH'),
('50000000-0000-0000-0000-000000000005','70000000-0000-0000-0000-000000000005','MISSING_PO','Purchase order not identified.','MEDIUM'),
('50000000-0000-0000-0000-000000000006','70000000-0000-0000-0000-000000000006','LOW_CONFIDENCE','Extraction confidence is 0.71.','HIGH'),
('50000000-0000-0000-0000-000000000007','70000000-0000-0000-0000-000000000007','THREE_WAY_MATCH_FAILURE','Invoice quantity 10; accepted receipt quantity 8.','HIGH');
update invoices set status = case id
 when '50000000-0000-0000-0000-000000000001' then 'APPROVED'::invoice_status
 when '50000000-0000-0000-0000-000000000003' then 'APPROVED'::invoice_status
 when '50000000-0000-0000-0000-000000000004' then 'REJECTED'::invoice_status
 else 'NEEDS_REVIEW'::invoice_status end,
 decision = case id
 when '50000000-0000-0000-0000-000000000001' then 'AUTO_APPROVED'::invoice_decision
 when '50000000-0000-0000-0000-000000000003' then 'AUTO_APPROVED'::invoice_decision
 when '50000000-0000-0000-0000-000000000004' then 'AUTO_REJECTED'::invoice_decision
 else 'NEEDS_REVIEW'::invoice_decision end,
 processed_at = '2026-10-18 10:22:00+05:30';
insert into audit_events(invoice_id,run_id,actor_type,event_type,description,metadata)
select d.invoice_id,d.run_id,'AGENT','DECISION_GENERATED',d.summary,jsonb_build_object('decision',d.decision,'fixture',true)
from agent_decisions d;
insert into audit_events(invoice_id,run_id,actor_type,event_type,description,metadata,created_at) values
('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','AGENT','EXTRACTION_COMPLETED','Demo invoice fields extracted','{"fixture":true,"confidence":0.984}','2026-10-17 09:01:03+05:30'),
('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','AGENT','VENDOR_MATCHED','Demo vendor matched to Acme master record','{"fixture":true,"vendorCode":"ACME-001"}','2026-10-17 09:01:05+05:30'),
('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','AGENT','PO_MATCHED','Demo purchase order PO-10234 matched','{"fixture":true,"poNumber":"PO-10234"}','2026-10-17 09:01:07+05:30'),
('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','AGENT','VALIDATION_COMPLETED','Demo PO variance 0.00%','{"fixture":true,"variance":0}','2026-10-17 09:01:09+05:30'),
('50000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','AGENT','INVOICE_APPROVED','Demo invoice automatically approved under policy v1','{"fixture":true,"policyVersion":"1"}','2026-10-17 09:01:12+05:30');
