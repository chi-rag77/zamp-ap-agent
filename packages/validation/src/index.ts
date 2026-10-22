import { z } from 'zod';
import type { Json } from '@zamp/domain';
import {
  VendorStatuses, PurchaseOrderStatuses, GoodsReceiptStatuses, InvoiceSources, InvoiceStatuses, InvoiceDecisions,
  ProcessingRunStatuses, AgentStepStatuses, AgentStepTypes, AgentDecisionTypes, AgentActions, ActionStatuses,
  PolicyStatuses, ReviewCaseStatuses, ReviewReasonCodes, Priorities, ActorTypes, EmailProviders,
} from '@zamp/domain';

export const UuidSchema = z.uuid();
/** Decimal text, up to 14 integral and 4 fractional digits: fits NUMERIC(18,4). */
export const MoneySchema = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/);
export const ConfidenceSchema = z.string().regex(/^(?:0(?:\.\d{1,4})?|1(?:\.0{1,4})?)$/);
export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export const HashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const TimestampSchema = z.iso.datetime({ offset: true });
const DateSchema = z.iso.date();
const JsonSchema: z.ZodType<Json> = z.json() as z.ZodType<Json>;
const Base = z.object({id:UuidSchema,created_at:TimestampSchema});
const NamedMoney = z.object({currency:CurrencySchema,subtotal:MoneySchema,tax:MoneySchema,total:MoneySchema});

export const VendorSchema = Base.extend({vendor_code:z.string().min(1),legal_name:z.string().min(1),display_name:z.string().min(1),gstin:z.string().nullable(),tax_id:z.string().nullable(),email_domain:z.string().nullable(),currency:CurrencySchema,status:z.enum(VendorStatuses),address:JsonSchema.nullable(),archived_at:TimestampSchema.nullable(),updated_at:TimestampSchema});
export const PurchaseOrderSchema = Base.extend({po_number:z.string().min(1),vendor_id:UuidSchema,status:z.enum(PurchaseOrderStatuses),po_date:DateSchema,valid_until:DateSchema.nullable(),metadata:JsonSchema.nullable(),archived_at:TimestampSchema.nullable(),updated_at:TimestampSchema}).merge(NamedMoney);
export const PurchaseOrderLineSchema = Base.extend({po_id:UuidSchema,line_number:z.number().int().positive(),sku:z.string().nullable(),description:z.string().min(1),quantity:MoneySchema,unit_price:MoneySchema,tax_rate:ConfidenceSchema.nullable(),amount:MoneySchema,received_quantity:MoneySchema,metadata:JsonSchema.nullable(),updated_at:TimestampSchema});
export const GoodsReceiptSchema = Base.extend({grn_number:z.string().min(1),po_id:UuidSchema,vendor_id:UuidSchema,receipt_date:DateSchema,status:z.enum(GoodsReceiptStatuses),metadata:JsonSchema.nullable(),updated_at:TimestampSchema});
export const GoodsReceiptLineSchema = Base.extend({goods_receipt_id:UuidSchema,po_line_id:UuidSchema,received_quantity:MoneySchema,accepted_quantity:MoneySchema,metadata:JsonSchema.nullable(),updated_at:TimestampSchema});
export const InvoiceSchema = Base.extend({invoice_number:z.string().nullable(),vendor_id:UuidSchema.nullable(),po_id:UuidSchema.nullable(),source:z.enum(InvoiceSources),source_message_id:UuidSchema.nullable(),source_attachment_id:UuidSchema.nullable(),document_path:z.string().nullable(),document_hash:HashSchema.nullable(),invoice_date:DateSchema.nullable(),due_date:DateSchema.nullable(),currency:CurrencySchema,subtotal:MoneySchema.nullable(),tax:MoneySchema.nullable(),total:MoneySchema.nullable(),extraction_confidence:ConfidenceSchema.nullable(),status:z.enum(InvoiceStatuses),decision:z.enum(InvoiceDecisions).nullable(),decision_reason:z.string().nullable(),received_at:TimestampSchema,processed_at:TimestampSchema.nullable(),archived_at:TimestampSchema.nullable(),updated_at:TimestampSchema});
export const InvoiceLineSchema = Base.extend({invoice_id:UuidSchema,line_number:z.number().int().positive(),sku:z.string().nullable(),description:z.string().min(1),quantity:MoneySchema,unit_price:MoneySchema,tax_rate:ConfidenceSchema.nullable(),amount:MoneySchema,extraction_confidence:ConfidenceSchema.nullable(),metadata:JsonSchema.nullable(),updated_at:TimestampSchema});
export const ProcessingRunSchema = Base.extend({invoice_id:UuidSchema,status:z.enum(ProcessingRunStatuses),started_at:TimestampSchema.nullable(),completed_at:TimestampSchema.nullable(),duration_ms:z.number().int().nonnegative().nullable(),agent_version:z.string().min(1),policy_version:z.string().nullable(),error_code:z.string().nullable(),error_message:z.string().nullable(),metadata:JsonSchema.nullable()});
export const AgentStepSchema = Base.extend({run_id:UuidSchema,step_number:z.number().int().positive(),step_type:z.enum(AgentStepTypes),name:z.string().min(1),status:z.enum(AgentStepStatuses),input:JsonSchema.nullable(),output:JsonSchema.nullable(),confidence:ConfidenceSchema.nullable(),duration_ms:z.number().int().nonnegative().nullable(),started_at:TimestampSchema.nullable(),completed_at:TimestampSchema.nullable(),error_message:z.string().nullable()});
export const AgentDecisionSchema = Base.extend({invoice_id:UuidSchema,run_id:UuidSchema,decision:z.enum(AgentDecisionTypes),confidence:ConfidenceSchema.nullable(),summary:z.string().min(1),reasoning_summary:z.string().min(1),policy_id:UuidSchema.nullable(),policy_version:z.string().nullable(),action:z.enum(AgentActions),action_status:z.enum(ActionStatuses)});
export const PolicySchema = Base.extend({name:z.string().min(1),version:z.string().min(1),status:z.enum(PolicyStatuses),configuration:JsonSchema,effective_from:TimestampSchema.nullable(),updated_at:TimestampSchema});
export const ReviewCaseSchema = Base.extend({invoice_id:UuidSchema,run_id:UuidSchema.nullable(),status:z.enum(ReviewCaseStatuses),reason_code:z.enum(ReviewReasonCodes),reason:z.string().min(1),priority:z.enum(Priorities),assigned_to:UuidSchema.nullable(),resolution:z.string().nullable(),resolved_by:UuidSchema.nullable(),resolved_at:TimestampSchema.nullable(),updated_at:TimestampSchema});
export const AuditEventSchema = Base.extend({invoice_id:UuidSchema.nullable(),run_id:UuidSchema.nullable(),actor_type:z.enum(ActorTypes),actor_id:z.string().nullable(),event_type:z.string().min(1),description:z.string().min(1),metadata:JsonSchema.nullable()});
export const EmailMessageSchema = Base.extend({provider:z.enum(EmailProviders),message_id:z.string().min(1),thread_id:z.string().nullable(),sender:z.email(),recipient:z.email(),subject:z.string().nullable(),received_at:TimestampSchema,body_preview:z.string().nullable(),metadata:JsonSchema.nullable()});
export const EmailAttachmentSchema = Base.extend({email_message_id:UuidSchema,filename:z.string().min(1),mime_type:z.string().min(1),size_bytes:z.number().int().nonnegative(),storage_path:z.string().min(1),document_hash:HashSchema.nullable(),processed:z.boolean()});
export const InvoiceDocumentSchema = Base.extend({invoice_id:UuidSchema,storage_path:z.string().min(1),filename:z.string().min(1),mime_type:z.string().min(1),size_bytes:z.number().int().nonnegative(),document_hash:HashSchema.nullable(),page_count:z.number().int().positive().nullable()});

export const CreateVendorSchema = VendorSchema.pick({vendor_code:true,legal_name:true,display_name:true,currency:true}).extend({gstin:z.string().nullable().optional(),tax_id:z.string().nullable().optional(),email_domain:z.string().nullable().optional(),status:z.enum(VendorStatuses).optional(),address:JsonSchema.optional()});
export const CreateInvoiceSchema = InvoiceSchema.pick({source:true,currency:true}).extend({invoice_number:z.string().nullable().optional(),vendor_id:UuidSchema.nullable().optional(),po_id:UuidSchema.nullable().optional(),source_message_id:UuidSchema.nullable().optional(),source_attachment_id:UuidSchema.nullable().optional(),document_path:z.string().nullable().optional(),document_hash:HashSchema.nullable().optional(),invoice_date:DateSchema.nullable().optional(),due_date:DateSchema.nullable().optional(),subtotal:MoneySchema.nullable().optional(),tax:MoneySchema.nullable().optional(),total:MoneySchema.nullable().optional(),extraction_confidence:ConfidenceSchema.nullable().optional()});
export const isValidConfidence=(value:unknown):value is string=>ConfidenceSchema.safeParse(value).success;
export const isValidMoney=(value:unknown):value is string=>MoneySchema.safeParse(value).success;
export const isValidQuantity=isValidMoney;
export const isValidCurrency=(value:unknown):value is string=>CurrencySchema.safeParse(value).success;
