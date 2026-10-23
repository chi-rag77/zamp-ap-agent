/** Creates labelled synthetic records in the dedicated Zamp demo project. */
import {existsSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {validateInvoice} from '@zamp/matching';
import {createMatchingRepository} from '@zamp/database';
if(process.env.RUN_LIVE_SMOKE!=='yes')throw new Error('Set RUN_LIVE_SMOKE=yes for the dedicated demo project');
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Supabase server configuration missing');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const suffix=crypto.randomUUID().slice(0,8).toUpperCase();
async function insert(table:string,payload:Record<string,unknown>){const {data,error}=await db.from(table).insert(payload).select('id').single();if(error)throw new Error(`${table}: ${error.message}`);return data.id as string}
const vendorId=await insert('vendors',{vendor_code:`PH3-${suffix}`,legal_name:`Phase 3 Demo ${suffix}`,display_name:`Phase 3 Demo ${suffix}`,currency:'INR',status:'ACTIVE'});
const poId=await insert('purchase_orders',{po_number:`PO-PH3-${suffix}`,vendor_id:vendorId,currency:'INR',status:'OPEN',po_date:'2026-10-22',subtotal:'100',tax:'18',total:'118'});
const poLineId=await insert('purchase_order_lines',{po_id:poId,line_number:1,sku:'TEST-A',description:'Synthetic steel bolts',quantity:'2',unit_price:'50',tax_rate:'0.18',amount:'100'});
const receiptId=await insert('goods_receipts',{grn_number:`GRN-PH3-${suffix}`,po_id:poId,vendor_id:vendorId,receipt_date:'2026-10-22',status:'COMPLETE'});
await insert('goods_receipt_lines',{goods_receipt_id:receiptId,po_line_id:poLineId,received_quantity:'2',accepted_quantity:'2'});
const invoiceId=await insert('invoices',{invoice_number:`INV-PH3-${suffix}`,vendor_id:vendorId,po_id:poId,source:'DEMO',invoice_date:'2026-10-22',currency:'INR',subtotal:'100',tax:'18',total:'118',status:'RECEIVED'});
await insert('invoice_lines',{invoice_id:invoiceId,line_number:1,sku:'TEST-A',description:'Synthetic steel bolts',quantity:'2',unit_price:'50',tax_rate:'0.18',amount:'100'});
const result=await validateInvoice(invoiceId,createMatchingRepository(db));
if(result.status!=='PASS'||result.twoWayMatch.status!=='PASS'||result.threeWayMatch.status!=='PASS')throw new Error(`Expected full match: ${JSON.stringify({status:result.status,blockers:result.blockers,warnings:result.warnings})}`);
const {data:stored,error}=await db.from('invoice_validation_runs').select('id,status,engine_version,result').eq('run_id',result.runId).single();
if(error||stored?.status!=='PASS'||stored.result?.invoiceId!==invoiceId)throw new Error(`Validation did not persist: ${error?.message??'wrong result'}`);
console.log(JSON.stringify({invoiceId,runId:result.runId,validationId:stored.id,status:result.status,twoWay:result.twoWayMatch.status,threeWay:result.threeWayMatch.status,checks:result.checks.length}));
