/** Exercises a real NVIDIA Phase 02 extraction followed by Phase 03 against the dedicated demo project. */
import {existsSync,readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {extractInvoiceDocument,NvidiaVisionProvider} from '@zamp/ai';
import {createMatchingRepository} from '@zamp/database';
import {validateInvoice} from '@zamp/matching';

if(process.env.RUN_LIVE_SMOKE!=='yes')throw new Error('Set RUN_LIVE_SMOKE=yes for the dedicated demo project');
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key||!process.env.NVIDIA_API_KEY)throw new Error('Supabase and NVIDIA server configuration required');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
async function one(table:string,column:string,value:string):Promise<string|null>{
  const {data,error}=await db.from(table).select('id').eq(column,value).maybeSingle();
  if(error)throw new Error(`${table}: ${error.message}`);
  return data?.id??null;
}
async function insert(table:string,payload:Record<string,unknown>):Promise<string>{
  const {data,error}=await db.from(table).insert(payload).select('id').single();
  if(error)throw new Error(`${table}: ${error.message}`);
  return data.id as string;
}
const vendorId=await one('vendors','vendor_code','PH3-REAL-ACME')??await insert('vendors',{vendor_code:'PH3-REAL-ACME',legal_name:'Acme Industrial Supplies',display_name:'Acme Industrial Supplies',gstin:'27ABCDE1234F1Z5',currency:'INR',status:'ACTIVE'});
const poId=await one('purchase_orders','po_number','PO-884')??await insert('purchase_orders',{po_number:'PO-884',vendor_id:vendorId,currency:'INR',status:'OPEN',po_date:'2026-10-20',subtotal:'300',tax:'54',total:'354'});
async function poLine(number:number,description:string,quantity:string,amount:string){
  const {data,error}=await db.from('purchase_order_lines').select('id').eq('po_id',poId).eq('line_number',number).maybeSingle();
  if(error)throw error;
  return data?.id??await insert('purchase_order_lines',{po_id:poId,line_number:number,description,quantity,unit_price:'50',tax_rate:'0.18',amount});
}
const boltId=await poLine(1,'Steel bolts','2','100');
const gloveId=await poLine(2,'Safety gloves','4','200');
const grnId=await one('goods_receipts','grn_number','GRN-PH3-REAL-884')??await insert('goods_receipts',{grn_number:'GRN-PH3-REAL-884',po_id:poId,vendor_id:vendorId,receipt_date:'2026-10-21',status:'COMPLETE'});
for(const [poLineId,quantity] of [[boltId,'2'],[gloveId,'4']]){
  const {data,error}=await db.from('goods_receipt_lines').select('id').eq('goods_receipt_id',grnId).eq('po_line_id',poLineId).maybeSingle();
  if(error)throw error;
  if(!data)await insert('goods_receipt_lines',{goods_receipt_id:grnId,po_line_id:poLineId,received_quantity:quantity,accepted_quantity:quantity});
}
const invoiceId=await insert('invoices',{source:'DEMO',currency:'INR',status:'RECEIVED'});
const extraction=await extractInvoiceDocument({db,provider:new NvidiaVisionProvider(),invoiceId,document:{bytes:readFileSync('tests/fixtures/phase03-real-invoice.png'),mimeType:'image/png',filename:'phase03-real-invoice.png'}});
const result=await validateInvoice(invoiceId,createMatchingRepository(db));
const {data:stored,error}=await db.from('invoice_validation_runs').select('id,status,extraction_id,result').eq('run_id',result.runId).single();
if(error||!stored||stored.extraction_id!==extraction.extractionId||stored.result?.invoiceId!==invoiceId)throw new Error(`Validation persistence failed: ${error?.message??'identity mismatch'}`);
console.log(JSON.stringify({invoiceId,extractionId:extraction.extractionId,extractionStatus:extraction.status,validationId:stored.id,status:result.status,vendor:result.vendor.status,po:result.purchaseOrder.status,lines:result.lineMatches.map(x=>x.status),twoWay:result.twoWayMatch.status,threeWay:result.threeWayMatch.status,blockers:result.blockers,warnings:result.warnings}));
if(result.status!=='PASS'||result.twoWayMatch.status!=='PASS'||result.threeWayMatch.status!=='PASS')throw new Error('Real extraction did not fully match the seeded procurement records');
