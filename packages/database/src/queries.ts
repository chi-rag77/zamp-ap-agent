import type { SupabaseClient } from '@supabase/supabase-js';
import { selects } from './repositories';
import type { Invoice, InvoiceLine, PurchaseOrder, PurchaseOrderLine, GoodsReceipt, ProcessingRun, Vendor } from '@zamp/domain';
import {InvoiceSchema,InvoiceLineSchema,PurchaseOrderSchema,PurchaseOrderLineSchema,GoodsReceiptSchema,ProcessingRunSchema,VendorSchema,UuidSchema} from '@zamp/validation';

function requireData<T>(data:unknown,error:{message:string}|null,parse:(value:unknown)=>T):T {
  if(error)throw new Error(error.message);
  return parse(data);
}
export function createDomainQueries(db:SupabaseClient){
  return {
    async getInvoiceWithLines(id:string):Promise<{invoice:Invoice;lines:InvoiceLine[]}|null>{
      const invoiceResult=await db.from('invoices').select(selects.invoices).eq('id',UuidSchema.parse(id)).maybeSingle();
      if(invoiceResult.error)throw new Error(invoiceResult.error.message);
      if(!invoiceResult.data)return null;
      const linesResult=await db.from('invoice_lines').select(selects.invoice_lines).eq('invoice_id',id).order('line_number');
      return {invoice:InvoiceSchema.parse(invoiceResult.data),lines:requireData(linesResult.data,linesResult.error,v=>(v as unknown[]).map(x=>InvoiceLineSchema.parse(x)))};
    },
    async getPurchaseOrderWithLines(number:string):Promise<{purchaseOrder:PurchaseOrder;lines:PurchaseOrderLine[]}|null>{
      const poResult=await db.from('purchase_orders').select(selects.purchase_orders).eq('po_number',number).maybeSingle();
      if(poResult.error)throw new Error(poResult.error.message);
      if(!poResult.data)return null;
      const linesResult=await db.from('purchase_order_lines').select(selects.purchase_order_lines).eq('po_id',poResult.data.id).order('line_number');
      return {purchaseOrder:PurchaseOrderSchema.parse(poResult.data),lines:requireData(linesResult.data,linesResult.error,v=>(v as unknown[]).map(x=>PurchaseOrderLineSchema.parse(x)))};
    },
    async getGoodsReceiptsForPO(poId:string):Promise<GoodsReceipt[]>{
      const {data,error}=await db.from('goods_receipts').select('*').eq('po_id',UuidSchema.parse(poId)).order('receipt_date');
      return requireData(data,error,v=>(v as unknown[]).map(x=>GoodsReceiptSchema.parse(x)));
    },
    async getInvoiceProcessingRuns(invoiceId:string):Promise<ProcessingRun[]>{
      const {data,error}=await db.from('processing_runs').select('*').eq('invoice_id',UuidSchema.parse(invoiceId)).order('created_at',{ascending:false});
      return requireData(data,error,v=>(v as unknown[]).map(x=>ProcessingRunSchema.parse(x)));
    },
    async getLatestProcessingRun(invoiceId:string):Promise<ProcessingRun|null>{
      const {data,error}=await db.from('processing_runs').select('*').eq('invoice_id',UuidSchema.parse(invoiceId)).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(error)throw new Error(error.message);
      return data===null?null:ProcessingRunSchema.parse(data);
    },
    async getPreviousInvoicesForVendor(vendorId:string,before:string):Promise<Invoice[]>{
      const {data,error}=await db.from('invoices').select(selects.invoices).eq('vendor_id',UuidSchema.parse(vendorId)).lt('received_at',before).order('received_at',{ascending:false}).limit(100);
      return requireData(data,error,v=>(v as unknown[]).map(x=>InvoiceSchema.parse(x)));
    },
    async findVendorByGSTIN(gstin:string):Promise<Vendor[]>{
      const {data,error}=await db.from('vendors').select('*').eq('gstin',gstin).limit(20);
      return requireData(data,error,v=>(v as unknown[]).map(x=>VendorSchema.parse(x)));
    },
    async findVendorByName(name:string):Promise<Vendor[]>{
      const escaped=name.replace(/[%_\\]/g,'\\$&');
      const {data,error}=await db.from('vendors').select('*').ilike('legal_name',`%${escaped}%`).limit(20);
      return requireData(data,error,v=>(v as unknown[]).map(x=>VendorSchema.parse(x)));
    },
  };
}
