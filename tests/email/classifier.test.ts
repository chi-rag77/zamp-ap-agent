import {describe,it,expect} from 'vitest';
import {classifyDocumentContent,classifyEmail,attachmentRole} from '../../packages/email/email-classifier';
import type {EmailMessage,EmailAttachment} from '../../packages/email/types';

const attachment=(filename:string,inline=false):EmailAttachment=>({attachmentId:filename,messageId:'m',filename,mimeType:filename.endsWith('.pdf')?'application/pdf':'image/png',sizeBytes:100,inline});
const email=(subject:string,attachments:EmailAttachment[]):EmailMessage=>({provider:'GMAIL',messageId:'m',from:'billing@vendor.com',to:['ap@example.com'],cc:[],subject,receivedAt:new Date().toISOString(),labels:[],attachments});

describe('deterministic classification',()=>{
 it('finds invoice, supporting, and ignored attachments',()=>{expect(attachmentRole(attachment('invoice.pdf'))).toBe('INVOICE');expect(attachmentRole(attachment('purchase-order.pdf'))).toBe('SUPPORTING_DOCUMENT');expect(attachmentRole(attachment('PO-884.pdf'))).toBe('SUPPORTING_DOCUMENT');expect(attachmentRole(attachment('logo.png'))).toBe('IGNORE')});
 it('does not mistake a PO reference in an invoice filename for a purchase order',()=>{const file=attachment('01-happy-path-full-po.pdf');expect(attachmentRole(file)).toBe('INVOICE');expect(classifyEmail(email('INV',[file])).classification).toBe('POSSIBLE_INVOICE')});
 it('accepts a supported document with no invoice keyword in its filename',()=>{const file=attachment('01-happy-path-full-po.pdf');expect(attachmentRole(file)).toBe('INVOICE');expect(classifyEmail(email('Invoice INV-1048',[file])).classification).toBe('INVOICE')});
 it('keeps inline invoice documents and ignores decorative inline images',()=>{expect(attachmentRole(attachment('Phase3_Demo_Test_Invoice.pdf',true))).toBe('INVOICE');expect(attachmentRole(attachment('image001.png',true))).toBe('IGNORE')});
 it('classifies invoice subject and PDF',()=>expect(classifyEmail(email('Invoice INV-1048 | PO-10234',[attachment('invoice.pdf')])).classification).toBe('INVOICE'));
 it('routes neutral supported documents to human review instead of guessing',()=>{const result=classifyEmail(email('Monthly documents',[attachment('scan-2026-11.pdf')]));expect(result.classification).toBe('REVIEW_REQUIRED');expect(result.score).toBe(15);expect(result.signals).toContainEqual({source:'MIME',signal:'Supported PDF file with matching MIME type',weight:15})});
 it('routes invoice email with no attachment to human review',()=>expect(classifyEmail(email('Invoice INV-1048',[])).classification).toBe('REVIEW_REQUIRED'));
 it('routes an abbreviated inv subject and supported attachment to review instead of ignoring it',()=>{const result=classifyEmail(email('inv',[attachment('inv.pdf')]));expect(result.classification).toBe('POSSIBLE_INVOICE');expect(result.reasons.some(reason=>reason.includes('Ambiguous invoice shorthand in subject'))).toBe(true)});
 it('routes an abbreviated inv subject without an attachment to review',()=>expect(classifyEmail(email('inv',[])).classification).toBe('REVIEW_REQUIRED'));
 it('routes abbreviated invoice subject with unsupported attachment to review',()=>expect(classifyEmail(email('inv',[attachment('inv.docx')])).classification).toBe('UNSUPPORTED'));
 it('recognizes unsupported invoice attachment',()=>expect(classifyEmail(email('Invoice INV-1048',[attachment('invoice.exe')])).classification).toBe('UNSUPPORTED'));
 it('routes conflicting invoice subject and quotation attachment for review',()=>{const result=classifyEmail(email('Invoice INV-1048',[attachment('quotation-123.pdf')]));expect(result.classification).toBe('REVIEW_REQUIRED');expect(result.documentType).toBe('QUOTATION')});
 it('identifies and rejects a clear non-invoice attachment',()=>expect(classifyEmail(email('Monthly files',[attachment('agenda.pdf')])).classification).toBe('NON_INVOICE'));
 it('confirms an invoice from extracted content only when key fields and confidence are present',()=>{expect(classifyDocumentContent({documentType:'INVOICE',invoiceNumber:'INV-22',totalAmount:118,confidence:0.92}).classification).toBe('INVOICE');expect(classifyDocumentContent({documentType:'INVOICE',invoiceNumber:null,totalAmount:118,confidence:0.92}).classification).toBe('REVIEW_REQUIRED');expect(classifyDocumentContent({documentType:'UNKNOWN',confidence:0.4}).classification).toBe('REVIEW_REQUIRED')});
});
