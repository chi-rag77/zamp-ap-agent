import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {createServerClient} from '@zamp/database';
import {runAgent} from '@zamp/agent';
if(process.env.RUN_LIVE_AGENT_SMOKE!=='yes')throw new Error('Set RUN_LIVE_AGENT_SMOKE=yes to create labelled demo records');
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const db=createServerClient();let suffix=randomUUID().slice(0,8).toUpperCase();const today=new Date().toISOString().slice(0,10);
async function insert(table:string,record:Record<string,unknown>){const {data,error}=await db.from(table).insert(record).select('id').single();if(error||!data)throw new Error(`${table}: ${error?.message??'insert failed'}`);return data.id as string}
const existingId=process.env.PH5_SMOKE_APPROVED_INVOICE_ID;
let vendorId:string,poId:string,number:string,approvalId!:string;
if(existingId){
 const {data,error}=await db.from('invoices').select('id,source,status,invoice_number,vendor_id,po_id').eq('id',existingId).single();
 if(error||!data||data.source!=='DEMO'||data.status!=='APPROVED'||!data.invoice_number?.startsWith('INV-PH5-')||!data.vendor_id||!data.po_id)throw new Error('Reuse requires an approved Phase 5 smoke invoice');
 approvalId=data.id;vendorId=data.vendor_id;poId=data.po_id;number=data.invoice_number;suffix=number.slice('INV-PH5-'.length);
}else{
 vendorId=await insert('vendors',{vendor_code:`PH5-${suffix}`,legal_name:`Phase 5 Smoke Vendor ${suffix}`,display_name:`Phase 5 Smoke Vendor ${suffix}`,currency:'INR',status:'ACTIVE'});
 poId=await insert('purchase_orders',{po_number:`PO-PH5-${suffix}`,vendor_id:vendorId,currency:'INR',status:'OPEN',po_date:today,subtotal:'300.0000',tax:'54.0000',total:'354.0000'});
 await insert('purchase_order_lines',{po_id:poId,line_number:1,sku:`PH5-${suffix}`,description:'Phase 5 smoke widget',quantity:'2.0000',unit_price:'150.0000',tax_rate:'0.180000',amount:'300.0000',received_quantity:'0.0000'});
 number=`INV-PH5-${suffix}`;
}
async function invoice(){const id=await insert('invoices',{invoice_number:number,vendor_id:vendorId,po_id:poId,source:'DEMO',invoice_date:today,currency:'INR',subtotal:'300.0000',tax:'54.0000',total:'354.0000',extraction_confidence:'0.9900',status:'RECEIVED'});await insert('invoice_lines',{invoice_id:id,line_number:1,sku:`PH5-${suffix}`,description:'Phase 5 smoke widget',quantity:'2.0000',unit_price:'150.0000',tax_rate:'0.180000',amount:'300.0000'});return id}
let approvedRunId:string|null=null;
if(!existingId){approvalId=await invoice();const approvalSimulation=await runAgent(approvalId,{mode:'SIMULATION'});assert.equal(approvalSimulation.decision,'AUTO_APPROVED',`Synthetic approval simulation: ${approvalSimulation.summary}`);const approved=await runAgent(approvalId);assert.equal(approved.status,'COMPLETED',approved.summary);assert.equal(approved.decision,'AUTO_APPROVED',approved.summary);assert.equal(approved.verificationStatus,'VERIFIED');approvedRunId=approved.runId}
const duplicateId=await invoice();const rejectionSimulation=await runAgent(duplicateId,{mode:'SIMULATION'});
assert.equal(rejectionSimulation.decision,'AUTO_REJECTED',`Synthetic duplicate simulation: ${rejectionSimulation.summary}`);
const rejected=await runAgent(duplicateId);assert.equal(rejected.status,'COMPLETED',rejected.summary);assert.equal(rejected.decision,'AUTO_REJECTED',rejected.summary);assert.equal(rejected.verificationStatus,'VERIFIED');
const [approvedRow,rejectedRow]=await Promise.all([db.from('invoices').select('status,decision').eq('id',approvalId).single(),db.from('invoices').select('status,decision').eq('id',duplicateId).single()]);
assert.equal(approvedRow.data?.status,'APPROVED');assert.equal(rejectedRow.data?.status,'REJECTED');
console.log(JSON.stringify({fixture:suffix,approval:{invoiceId:approvalId,runId:approvedRunId,status:approvedRow.data?.status},rejection:{invoiceId:duplicateId,runId:rejected.runId,status:rejectedRow.data?.status}}));
