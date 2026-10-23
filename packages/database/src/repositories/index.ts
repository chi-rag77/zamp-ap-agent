import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type {
 Vendor,PurchaseOrder,PurchaseOrderLine,GoodsReceipt,GoodsReceiptLine,Invoice,InvoiceLine,
 ProcessingRun,AgentStep,AgentDecision,Policy,ReviewCase,AuditEvent,EmailMessage,EmailAttachment,InvoiceDocument,
 InvoiceStatus,UUID
} from '@zamp/domain';
import {
 VendorSchema,PurchaseOrderSchema,PurchaseOrderLineSchema,GoodsReceiptSchema,GoodsReceiptLineSchema,
 InvoiceSchema,InvoiceLineSchema,ProcessingRunSchema,AgentStepSchema,AgentDecisionSchema,PolicySchema,
 ReviewCaseSchema,AuditEventSchema,EmailMessageSchema,EmailAttachmentSchema,InvoiceDocumentSchema,
 CreateVendorSchema,CreateInvoiceSchema,UuidSchema
} from '@zamp/validation';

export interface Repository<T> {
  create(input: unknown): Promise<T>;
  getById(id: UUID): Promise<T | null>;
  list(limit?: number): Promise<T[]>;
}
export interface VendorRepository extends Repository<Vendor> { getByCode(code:string):Promise<Vendor|null> }
export interface PurchaseOrderRepository extends Repository<PurchaseOrder> { getByNumber(number:string):Promise<PurchaseOrder|null> }
export interface GoodsReceiptRepository extends Repository<GoodsReceipt> { getByNumber(number:string):Promise<GoodsReceipt|null> }
export interface InvoiceRepository extends Repository<Invoice> {
  getByInvoiceNumber(vendorId:UUID,number:string):Promise<Invoice[]>;
  potentialDuplicates(vendorId:UUID,number:string,hash?:string):Promise<Invoice[]>;
  updateStatus(id:UUID,status:InvoiceStatus):Promise<Invoice>;
  listFiltered(filters:{status?:InvoiceStatus;vendorId?:UUID;limit?:number}):Promise<Invoice[]>;
}
export interface ProcessingRunRepository extends Repository<ProcessingRun> { start(invoiceId:UUID,agentVersion:string,policyVersion?:string):Promise<UUID> }
export interface AgentStepRepository extends Repository<AgentStep> { listByRun(runId:UUID):Promise<AgentStep[]> }
export interface AgentDecisionRepository extends Repository<AgentDecision> { listByInvoice(invoiceId:UUID):Promise<AgentDecision[]> }
export interface PolicyRepository extends Repository<Policy> { active():Promise<Policy|null> }
export interface ReviewCaseRepository extends Repository<ReviewCase> { open():Promise<ReviewCase[]> }
export interface AuditRepository extends Repository<AuditEvent> { listByInvoice(invoiceId:UUID):Promise<AuditEvent[]> }
export interface EmailRepository extends Repository<EmailMessage> { getByProviderMessage(provider:string,messageId:string):Promise<EmailMessage|null> }
export type EmailAttachmentRepository = Repository<EmailAttachment>;
export type InvoiceDocumentRepository = Repository<InvoiceDocument>;
export type PurchaseOrderLineRepository = Repository<PurchaseOrderLine>;
export type GoodsReceiptLineRepository = Repository<GoodsReceiptLine>;
export type InvoiceLineRepository = Repository<InvoiceLine>;

// Explicit columns prevent duplicate JSON keys when NUMERIC fields are cast to text.
export const selects = {
 vendors:'*',
 purchase_orders:'id,po_number,vendor_id,currency,status,po_date,valid_until,subtotal::text,tax::text,total::text,metadata,archived_at,created_at,updated_at',
 purchase_order_lines:'id,po_id,line_number,sku,description,quantity::text,unit_price::text,tax_rate::text,amount::text,received_quantity::text,metadata,created_at,updated_at',
 goods_receipts:'*',
 goods_receipt_lines:'id,goods_receipt_id,po_line_id,received_quantity::text,accepted_quantity::text,metadata,created_at,updated_at',
 invoices:'id,invoice_number,vendor_id,po_id,source,source_message_id,source_attachment_id,document_path,document_hash,invoice_date,due_date,currency,subtotal::text,tax::text,total::text,extraction_confidence::text,status,decision,decision_reason,received_at,processed_at,archived_at,created_at,updated_at',
 invoice_lines:'id,invoice_id,line_number,sku,description,quantity::text,unit_price::text,tax_rate::text,amount::text,extraction_confidence::text,metadata,created_at,updated_at',
 processing_runs:'*',
 agent_steps:'id,run_id,step_number,step_type,name,status,input,output,confidence::text,duration_ms,started_at,completed_at,error_message,created_at',
 agent_decisions:'id,invoice_id,run_id,decision,confidence::text,summary,reasoning_summary,policy_id,policy_version,action,action_status,validation_run_id,reason_code,evidence,blockers,warnings,recommended_action,evaluation_duration_ms,created_at',
 policies:'*',review_cases:'*',audit_events:'*',email_messages:'*',email_attachments:'*',invoice_documents:'*'
} as const;
type Table = keyof typeof selects;
function unwrap<T>(data:unknown,error:{message:string;hint?:string;code?:string}|null,schema:z.ZodType<T>):T {
  if(error) throw new Error(`${error.code ?? 'DB'}: ${error.hint ?? error.message}`);
  return schema.parse(data);
}
class TableRepository<T> implements Repository<T> {
  constructor(protected db:SupabaseClient,protected table:Table,protected schema:z.ZodType<T>,protected createSchema:z.ZodType<Record<string,unknown>>) {}
  async create(input:unknown):Promise<T> {
    const payload=this.createSchema.parse(input);
    const {data,error}=await this.db.from(this.table).insert(payload).select(selects[this.table]).single();
    return unwrap(data,error,this.schema);
  }
  async getById(id:UUID):Promise<T|null> {
    UuidSchema.parse(id);
    const {data,error}=await this.db.from(this.table).select(selects[this.table]).eq('id',id).maybeSingle();
    if(error) throw new Error(`${error.code}: ${error.hint ?? error.message}`);
    return data===null?null:this.schema.parse(data);
  }
  async list(limit=100):Promise<T[]> {
    const {data,error}=await this.db.from(this.table).select(selects[this.table]).limit(Math.min(Math.max(limit,1),500));
    if(error) throw new Error(`${error.code}: ${error.hint ?? error.message}`);
    return (data ?? []).map(row=>this.schema.parse(row));
  }
  protected async oneBy(column:string,value:string):Promise<T|null> {
    const {data,error}=await this.db.from(this.table).select(selects[this.table]).eq(column,value).maybeSingle();
    if(error) throw new Error(`${error.code}: ${error.hint ?? error.message}`);
    return data===null?null:this.schema.parse(data);
  }
}
const insert = <T extends z.ZodObject<z.ZodRawShape>>(schema:T) => schema.omit({id:true,created_at:true,updated_at:true} as never).partial();
export function createRepositories(db:SupabaseClient) {
  const vendors=new class extends TableRepository<Vendor> implements VendorRepository {
    getByCode(code:string){return this.oneBy('vendor_code',code)}
  }(db,'vendors',VendorSchema,CreateVendorSchema);
  const purchaseOrders=new class extends TableRepository<PurchaseOrder> implements PurchaseOrderRepository {
    getByNumber(number:string){return this.oneBy('po_number',number)}
  }(db,'purchase_orders',PurchaseOrderSchema,insert(PurchaseOrderSchema));
  const invoices=new class extends TableRepository<Invoice> implements InvoiceRepository {
    async getByInvoiceNumber(vendorId:UUID,number:string){
      UuidSchema.parse(vendorId);
      const {data,error}=await this.db.from('invoices').select(selects.invoices).eq('vendor_id',vendorId).eq('invoice_number',number);
      if(error) throw new Error(error.message);
      return (data??[]).map(row=>InvoiceSchema.parse(row));
    }
    async potentialDuplicates(vendorId:UUID,number:string,hash?:string){
      // Two targeted indexed queries avoid interpolating untrusted text into a raw PostgREST OR filter.
      const byNumber=await this.getByInvoiceNumber(vendorId,number);
      if(!hash)return byNumber;
      const {data,error}=await this.db.from('invoices').select(selects.invoices).eq('document_hash',hash);
      if(error)throw new Error(error.message);
      return [...new Map([...byNumber,...(data??[]).map(row=>InvoiceSchema.parse(row))].map(row=>[row.id,row])).values()];
    }
    async updateStatus(id:UUID,status:InvoiceStatus){
      UuidSchema.parse(id);
      const {data,error}=await this.db.from('invoices').update({status}).eq('id',id).select(selects.invoices).single();
      return unwrap(data,error,InvoiceSchema);
    }
    async listFiltered(filters:{status?:InvoiceStatus;vendorId?:UUID;limit?:number}){
      let query=this.db.from('invoices').select(selects.invoices);
      if(filters.status)query=query.eq('status',filters.status);
      if(filters.vendorId)query=query.eq('vendor_id',UuidSchema.parse(filters.vendorId));
      const {data,error}=await query.order('received_at',{ascending:false}).limit(Math.min(filters.limit??100,500));
      if(error)throw new Error(error.message);
      return (data??[]).map(row=>InvoiceSchema.parse(row));
    }
  }(db,'invoices',InvoiceSchema,CreateInvoiceSchema);
  const processingRuns=new class extends TableRepository<ProcessingRun> implements ProcessingRunRepository {
    async start(invoiceId:UUID,agentVersion:string,policyVersion?:string){
      UuidSchema.parse(invoiceId);
      const {data,error}=await this.db.rpc('start_processing_run',{p_invoice_id:invoiceId,p_agent_version:agentVersion,p_policy_version:policyVersion??null});
      return unwrap(data,error,UuidSchema);
    }
  }(db,'processing_runs',ProcessingRunSchema,insert(ProcessingRunSchema));
  const agentSteps=new class extends TableRepository<AgentStep> implements AgentStepRepository {
    async listByRun(runId:UUID){
      const {data,error}=await this.db.from('agent_steps').select(selects.agent_steps).eq('run_id',UuidSchema.parse(runId)).order('step_number');
      if(error)throw new Error(error.message);
      return (data??[]).map(row=>AgentStepSchema.parse(row));
    }
  }(db,'agent_steps',AgentStepSchema,insert(AgentStepSchema));
  const agentDecisions=new class extends TableRepository<AgentDecision> implements AgentDecisionRepository {
    async listByInvoice(invoiceId:UUID){
      const {data,error}=await this.db.from('agent_decisions').select(selects.agent_decisions).eq('invoice_id',UuidSchema.parse(invoiceId)).order('created_at');
      if(error)throw new Error(error.message);
      return (data??[]).map(row=>AgentDecisionSchema.parse(row));
    }
  }(db,'agent_decisions',AgentDecisionSchema,insert(AgentDecisionSchema));
  const policies=new class extends TableRepository<Policy> implements PolicyRepository {
    active(){return this.oneBy('status','ACTIVE')}
  }(db,'policies',PolicySchema,insert(PolicySchema));
  const reviewCases=new class extends TableRepository<ReviewCase> implements ReviewCaseRepository {
    async open(){
      const {data,error}=await this.db.from('review_cases').select(selects.review_cases).in('status',['OPEN','IN_PROGRESS']);
      if(error)throw new Error(error.message);
      return (data??[]).map(row=>ReviewCaseSchema.parse(row));
    }
  }(db,'review_cases',ReviewCaseSchema,insert(ReviewCaseSchema));
  const audit=new class extends TableRepository<AuditEvent> implements AuditRepository {
    async listByInvoice(invoiceId:UUID){
      const {data,error}=await this.db.from('audit_events').select(selects.audit_events).eq('invoice_id',UuidSchema.parse(invoiceId)).order('created_at');
      if(error)throw new Error(error.message);
      return (data??[]).map(row=>AuditEventSchema.parse(row));
    }
  }(db,'audit_events',AuditEventSchema,insert(AuditEventSchema));
  const email=new class extends TableRepository<EmailMessage> implements EmailRepository {
    async getByProviderMessage(provider:string,messageId:string){
      const {data,error}=await this.db.from('email_messages').select(selects.email_messages).eq('provider',provider).eq('message_id',messageId).maybeSingle();
      if(error)throw new Error(error.message);
      return data===null?null:EmailMessageSchema.parse(data);
    }
  }(db,'email_messages',EmailMessageSchema,insert(EmailMessageSchema));
  return {
    vendors,purchaseOrders,invoices,processingRuns,agentSteps,agentDecisions,policies,reviewCases,audit,email,
    purchaseOrderLines:new TableRepository<PurchaseOrderLine>(db,'purchase_order_lines',PurchaseOrderLineSchema,insert(PurchaseOrderLineSchema)),
    goodsReceipts:new class extends TableRepository<GoodsReceipt> implements GoodsReceiptRepository {getByNumber(number:string){return this.oneBy('grn_number',number)}}(db,'goods_receipts',GoodsReceiptSchema,insert(GoodsReceiptSchema)),
    goodsReceiptLines:new TableRepository<GoodsReceiptLine>(db,'goods_receipt_lines',GoodsReceiptLineSchema,insert(GoodsReceiptLineSchema)),
    invoiceLines:new TableRepository<InvoiceLine>(db,'invoice_lines',InvoiceLineSchema,insert(InvoiceLineSchema)),
    emailAttachments:new TableRepository<EmailAttachment>(db,'email_attachments',EmailAttachmentSchema,insert(EmailAttachmentSchema)),
    invoiceDocuments:new TableRepository<InvoiceDocument>(db,'invoice_documents',InvoiceDocumentSchema,insert(InvoiceDocumentSchema)),
  };
}
