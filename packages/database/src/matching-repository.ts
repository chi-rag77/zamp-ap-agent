import type {SupabaseClient} from '@supabase/supabase-js';
import type {MatchingBase,MatchingRepository,RelatedData,InvoiceRecord,LineRecord,PORecord,VendorRecord,TaxComponent} from '@zamp/matching';
import {normalizeAmount} from '@zamp/matching';
import {InvoiceSchema,InvoiceLineSchema,PurchaseOrderSchema,PurchaseOrderLineSchema,VendorSchema,GoodsReceiptSchema,GoodsReceiptLineSchema,UuidSchema} from '@zamp/validation';
import type {Invoice,InvoiceLine,PurchaseOrder,PurchaseOrderLine,Vendor} from '@zamp/domain';
import {selects} from './repositories';
const candidateLimit=500;
function checked<T>(data:T|null,error:{message:string}|null):T{if(error)throw new Error(`DATABASE_ERROR: ${error.message}`);if(data===null)throw new Error('DATABASE_ERROR: Expected query data');return data}
function bounded<T>(data:T[]|null,count:number|null,error:{message:string}|null,name:string):T[]{const rows=checked(data,error);if((count??rows.length)>candidateLimit)throw new Error(`CANDIDATE_LIMIT: ${name} exceeds ${candidateLimit}`);return rows}
const invoice=(v:Invoice):InvoiceRecord=>({id:v.id,number:v.invoice_number,vendorId:v.vendor_id,poId:v.po_id,currency:v.currency,date:v.invoice_date,receivedAt:v.received_at,subtotal:v.subtotal,tax:v.tax,total:v.total,documentHash:v.document_hash,archivedAt:v.archived_at,status:v.status});
const line=(v:InvoiceLine):LineRecord=>({id:v.id,lineNumber:v.line_number,sku:v.sku,description:v.description,quantity:v.quantity,unitPrice:v.unit_price,taxRate:v.tax_rate,amount:v.amount});
const vendor=(v:Vendor):VendorRecord=>({id:v.id,name:v.legal_name,vendorCode:v.vendor_code,gstin:v.gstin,taxId:v.tax_id,emailDomain:v.email_domain,status:v.status});
const po=(v:PurchaseOrder):PORecord=>({id:v.id,number:v.po_number,vendorId:v.vendor_id,currency:v.currency,status:v.status,poDate:v.po_date,total:v.total});
const poLine=(v:PurchaseOrderLine)=>({id:v.id,poId:v.po_id,lineNumber:v.line_number,sku:v.sku,description:v.description,quantity:v.quantity,unitPrice:v.unit_price,taxRate:v.tax_rate,amount:v.amount});
const object=(value:unknown):Record<string,unknown>|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;
const text=(v:unknown):string|null=>typeof v==='string'&&v.trim()?v.trim():null;
function taxComponents(raw:Record<string,unknown>|null):TaxComponent[]{
  if(raw?.taxComponents===undefined||raw.taxComponents===null)return [];
  if(!Array.isArray(raw.taxComponents))throw new Error('INVALID_EXTRACTION_METADATA: taxComponents must be an array');
  return raw.taxComponents.map((item:unknown,index:number)=>{
    const c=object(item);if(!c||!text(c.name)||(typeof c.amount!=='string'&&typeof c.amount!=='number'))throw new Error(`INVALID_EXTRACTION_METADATA: taxComponents[${index}]`);
    return {name:text(c.name)!,rate:c.rate===null||c.rate===undefined?null:typeof c.rate==='string'?c.rate.trim().replace(/%$/,''):String(c.rate),amount:normalizeAmount(c.amount)};
  });
}
export function createMatchingRepository(db:SupabaseClient):MatchingRepository{
  return {
    async loadBase(invoiceId:string):Promise<MatchingBase|null>{
      const id=UuidSchema.parse(invoiceId);
      const invoiceResult=await db.from('invoices').select(`${selects.invoices},current_extraction_id`).eq('id',id).maybeSingle();
      if(invoiceResult.error)throw new Error(`DATABASE_ERROR: ${invoiceResult.error.message}`);
      if(!invoiceResult.data)return null;
      const rawInvoice=InvoiceSchema.parse(invoiceResult.data);
      const extractionId=invoiceResult.data.current_extraction_id as string|null;
      if(!extractionId&&rawInvoice.source!=='DEMO')throw new Error('EXTRACTION_UNAVAILABLE: No canonical extraction');
      const [linesResult,vendorResult,poResult,extractionResult]=await Promise.all([
        db.from('invoice_lines').select(selects.invoice_lines).eq('invoice_id',id).order('line_number'),
        db.from('vendors').select('*',{count:'exact'}).is('archived_at',null).limit(candidateLimit),
        db.from('purchase_orders').select(selects.purchase_orders,{count:'exact'}).is('archived_at',null).limit(candidateLimit),
        extractionId?db.from('invoice_extractions').select('id,status,normalized_output').eq('id',extractionId).maybeSingle():Promise.resolve({data:null,error:null})
      ]);
      const lines=checked(linesResult.data,linesResult.error).map(v=>line(InvoiceLineSchema.parse(v)));
      const vendors=bounded(vendorResult.data,vendorResult.count,vendorResult.error,'vendors').map(v=>vendor(VendorSchema.parse(v)));
      const purchaseOrders=bounded(poResult.data,poResult.count,poResult.error,'purchase orders').map(v=>po(PurchaseOrderSchema.parse(v)));
      if(extractionResult.error)throw new Error(`DATABASE_ERROR: ${extractionResult.error.message}`);
      if(extractionId&&(!extractionResult.data||!['COMPLETE','PARTIAL'].includes(extractionResult.data.status)))throw new Error('EXTRACTION_UNAVAILABLE: Canonical extraction is not usable');
      const raw=object(extractionResult.data?.normalized_output);
      const vendorRaw=object(raw?.vendor);
      const adjustments=object(raw?.adjustments);
      const linkedVendor=vendors.find(v=>v.id===rawInvoice.vendor_id);
      return {invoice:invoice(rawInvoice),invoiceLines:lines,extractionId,vendorClaim:{name:text(vendorRaw?.name)??(extractionId?null:linkedVendor?.name??null),gstin:text(vendorRaw?.gstin),taxId:text(vendorRaw?.taxId)},poNumber:text(raw?.poNumber),vendors,purchaseOrders,taxComponents:taxComponents(raw),adjustments:adjustments?{discount:adjustments.discount===undefined?'0':normalizeAmount(adjustments.discount as string|number),charges:adjustments.charges===undefined?'0':normalizeAmount(adjustments.charges as string|number)}:null};
    },
    async loadRelated(invoiceId:string,vendorId:string|null,poId:string|null):Promise<RelatedData>{
      const id=UuidSchema.parse(invoiceId);
      const [poLinesResult,receiptResult,previousResult]=await Promise.all([
        poId?db.from('purchase_order_lines').select(selects.purchase_order_lines).eq('po_id',UuidSchema.parse(poId)).order('line_number'):Promise.resolve({data:[],error:null}),
        poId?db.from('goods_receipts').select('*',{count:'exact'}).eq('po_id',UuidSchema.parse(poId)).limit(candidateLimit):Promise.resolve({data:[] as unknown[],count:0,error:null}),
        vendorId?db.from('invoices').select(selects.invoices,{count:'exact'}).eq('vendor_id',UuidSchema.parse(vendorId)).is('archived_at',null).limit(candidateLimit):Promise.resolve({data:[] as unknown[],count:0,error:null})
      ]);
      const poLines=checked(poLinesResult.data,poLinesResult.error).map(v=>poLine(PurchaseOrderLineSchema.parse(v)));
      const receipts=bounded(receiptResult.data,receiptResult.count,receiptResult.error,'goods receipts').map(v=>GoodsReceiptSchema.parse(v)).filter(v=>v.status!=='REJECTED');
      const oldInvoices=bounded(previousResult.data,previousResult.count,previousResult.error,'vendor invoices').map(v=>InvoiceSchema.parse(v));
      const receiptIds=receipts.map(v=>v.id),invoiceIds=oldInvoices.filter(v=>v.id!==id).map(v=>v.id);
      const [receiptLinesResult,oldLinesResult]=await Promise.all([
        receiptIds.length?db.from('goods_receipt_lines').select(selects.goods_receipt_lines,{count:'exact'}).in('goods_receipt_id',receiptIds).limit(1000):Promise.resolve({data:[] as unknown[],count:0,error:null}),
        invoiceIds.length?db.from('invoice_lines').select(selects.invoice_lines,{count:'exact'}).in('invoice_id',invoiceIds).limit(1000):Promise.resolve({data:[] as unknown[],count:0,error:null})
      ]);
      if((receiptLinesResult.count??0)>1000||(oldLinesResult.count??0)>1000)throw new Error('CANDIDATE_LIMIT: Related lines exceed 1000');
      const receiptLines=checked(receiptLinesResult.data,receiptLinesResult.error).map(v=>GoodsReceiptLineSchema.parse(v)).map(v=>({receiptId:v.goods_receipt_id,poLineId:v.po_line_id,acceptedQuantity:v.accepted_quantity}));
      const oldLines=checked(oldLinesResult.data,oldLinesResult.error).map(v=>InvoiceLineSchema.parse(v));
      return {poLines,receiptLines,previousInvoices:oldInvoices.filter(v=>v.id!==id).map(v=>({invoice:invoice(v),lines:oldLines.filter(l=>l.invoice_id===v.id).map(line)}))};
    },
    async startRun(invoiceId:string,version:string){const {data,error}=await db.rpc('start_invoice_validation_run',{p_invoice_id:UuidSchema.parse(invoiceId),p_engine_version:version});return checked(data,error) as string},
    async finishRun(runId:string,result){const {error}=await db.rpc('complete_invoice_validation_run',{p_invoice_id:result.invoiceId,p_run_id:UuidSchema.parse(runId),p_result:result});if(error)throw new Error(`DATABASE_ERROR: ${error.message}`)},
    async failRun(runId:string,invoiceId:string,code:string,message:string){const {error}=await db.rpc('fail_invoice_validation_run',{p_invoice_id:UuidSchema.parse(invoiceId),p_run_id:UuidSchema.parse(runId),p_error_code:code,p_message:message});if(error)throw new Error(`DATABASE_ERROR: ${error.message}`)}
  };
}
