export const VendorStatuses = ['ACTIVE','BLOCKED','INACTIVE'] as const;
export const PurchaseOrderStatuses = ['DRAFT','OPEN','PARTIALLY_RECEIVED','FULLY_RECEIVED','CLOSED','CANCELLED'] as const;
export const GoodsReceiptStatuses = ['OPEN','PARTIAL','COMPLETE','REJECTED'] as const;
export const InvoiceSources = ['EMAIL','UPLOAD','API','DEMO'] as const;
export const InvoiceStatuses = ['RECEIVED','PROCESSING','NEEDS_REVIEW','APPROVED','REJECTED','FAILED'] as const;
export const InvoiceDecisions = ['AUTO_APPROVED','HUMAN_APPROVED','AUTO_REJECTED','HUMAN_REJECTED','NEEDS_REVIEW'] as const;
export const ProcessingRunStatuses = ['QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'] as const;
export const AgentStepStatuses = ['PENDING','RUNNING','COMPLETED','FAILED','SKIPPED'] as const;
export const AgentStepTypes = ['SYSTEM','AI','VALIDATION','MATCHING','POLICY','ACTION'] as const;
export const AgentDecisionTypes = ['AUTO_APPROVED','AUTO_REJECTED','NEEDS_REVIEW'] as const;
export const AgentActions = ['NONE','APPROVE','REJECT','CREATE_REVIEW'] as const;
export const ActionStatuses = ['PENDING','EXECUTED','FAILED','VERIFIED'] as const;
export const PolicyStatuses = ['DRAFT','ACTIVE','ARCHIVED'] as const;
export const ReviewCaseStatuses = ['OPEN','IN_PROGRESS','RESOLVED','CANCELLED'] as const;
export const ReviewReasonCodes = ['MISSING_PO','VENDOR_MISMATCH','PO_NOT_FOUND','PO_AMBIGUOUS','PRICE_VARIANCE','QUANTITY_VARIANCE','TOTAL_VARIANCE','TAX_MISMATCH','DUPLICATE_SUSPECTED','LOW_CONFIDENCE','THREE_WAY_MATCH_FAILURE','CURRENCY_MISMATCH','INVALID_TOTAL','SYSTEM_ERROR','OTHER'] as const;
export const Priorities = ['LOW','MEDIUM','HIGH','CRITICAL'] as const;
export const ActorTypes = ['AGENT','HUMAN','SYSTEM','VENDOR'] as const;
export const EmailProviders = ['GMAIL','IMAP','DEMO'] as const;
export type VendorStatus = typeof VendorStatuses[number];
export type PurchaseOrderStatus = typeof PurchaseOrderStatuses[number];
export type GoodsReceiptStatus = typeof GoodsReceiptStatuses[number];
export type InvoiceSource = typeof InvoiceSources[number];
export type InvoiceStatus = typeof InvoiceStatuses[number];
export type InvoiceDecision = typeof InvoiceDecisions[number];
export type ProcessingRunStatus = typeof ProcessingRunStatuses[number];
export type AgentStepStatus = typeof AgentStepStatuses[number];
export type AgentStepType = typeof AgentStepTypes[number];
export type AgentDecisionType = typeof AgentDecisionTypes[number];
export type AgentAction = typeof AgentActions[number];
export type ActionStatus = typeof ActionStatuses[number];
export type PolicyStatus = typeof PolicyStatuses[number];
export type ReviewCaseStatus = typeof ReviewCaseStatuses[number];
export type ReviewReasonCode = typeof ReviewReasonCodes[number];
export type Priority = typeof Priorities[number];
export type ActorType = typeof ActorTypes[number];
export type EmailProvider = typeof EmailProviders[number];
export type UUID = string;
/** NUMERIC values cross the API as decimal strings to retain financial precision. */
export type Decimal = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface RecordBase { id: UUID; created_at: string }
export interface Vendor extends RecordBase { vendor_code:string; legal_name:string; display_name:string; gstin:string|null; tax_id:string|null; email_domain:string|null; currency:string; status:VendorStatus; address:Json|null; archived_at:string|null; updated_at:string }
export interface PurchaseOrder extends RecordBase { po_number:string; vendor_id:UUID; currency:string; status:PurchaseOrderStatus; po_date:string; valid_until:string|null; subtotal:Decimal; tax:Decimal; total:Decimal; metadata:Json|null; archived_at:string|null; updated_at:string }
export interface PurchaseOrderLine extends RecordBase { po_id:UUID; line_number:number; sku:string|null; description:string; quantity:Decimal; unit_price:Decimal; tax_rate:Decimal|null; amount:Decimal; received_quantity:Decimal; metadata:Json|null; updated_at:string }
export interface GoodsReceipt extends RecordBase { grn_number:string; po_id:UUID; vendor_id:UUID; receipt_date:string; status:GoodsReceiptStatus; metadata:Json|null; updated_at:string }
export interface GoodsReceiptLine extends RecordBase { goods_receipt_id:UUID; po_line_id:UUID; received_quantity:Decimal; accepted_quantity:Decimal; metadata:Json|null; updated_at:string }
export interface Invoice extends RecordBase { invoice_number:string|null; vendor_id:UUID|null; po_id:UUID|null; source:InvoiceSource; source_message_id:UUID|null; source_attachment_id:UUID|null; document_path:string|null; document_hash:string|null; invoice_date:string|null; due_date:string|null; currency:string; subtotal:Decimal|null; tax:Decimal|null; total:Decimal|null; extraction_confidence:Decimal|null; status:InvoiceStatus; decision:InvoiceDecision|null; decision_reason:string|null; received_at:string; processed_at:string|null; archived_at:string|null; updated_at:string }
export interface InvoiceLine extends RecordBase { invoice_id:UUID; line_number:number; sku:string|null; description:string; quantity:Decimal; unit_price:Decimal; tax_rate:Decimal|null; amount:Decimal; extraction_confidence:Decimal|null; metadata:Json|null; updated_at:string }
export interface ProcessingRun extends RecordBase { invoice_id:UUID; status:ProcessingRunStatus; started_at:string|null; completed_at:string|null; duration_ms:number|null; agent_version:string; policy_version:string|null; error_code:string|null; error_message:string|null; metadata:Json|null }
export interface AgentStep extends RecordBase { run_id:UUID; step_number:number; step_type:AgentStepType; name:string; status:AgentStepStatus; input:Json|null; output:Json|null; confidence:Decimal|null; duration_ms:number|null; started_at:string|null; completed_at:string|null; error_message:string|null }
export interface AgentDecision extends RecordBase { invoice_id:UUID; run_id:UUID; decision:AgentDecisionType; confidence:Decimal|null; summary:string; reasoning_summary:string; policy_id:UUID|null; policy_version:string|null; action:AgentAction; action_status:ActionStatus }
export interface Policy extends RecordBase { name:string; version:string; status:PolicyStatus; configuration:Json; effective_from:string|null; updated_at:string }
export interface ReviewCase extends RecordBase { invoice_id:UUID; run_id:UUID|null; status:ReviewCaseStatus; reason_code:ReviewReasonCode; reason:string; priority:Priority; assigned_to:UUID|null; resolution:string|null; resolved_by:UUID|null; resolved_at:string|null; updated_at:string }
export interface AuditEvent extends RecordBase { invoice_id:UUID|null; run_id:UUID|null; actor_type:ActorType; actor_id:string|null; event_type:string; description:string; metadata:Json|null }
export interface EmailMessage extends RecordBase { provider:EmailProvider; message_id:string; thread_id:string|null; sender:string; recipient:string; subject:string|null; received_at:string; body_preview:string|null; metadata:Json|null }
export interface EmailAttachment extends RecordBase { email_message_id:UUID; filename:string; mime_type:string; size_bytes:number; storage_path:string; document_hash:string|null; processed:boolean }
export interface InvoiceDocument extends RecordBase { invoice_id:UUID; storage_path:string; filename:string; mime_type:string; size_bytes:number; document_hash:string|null; page_count:number|null }
