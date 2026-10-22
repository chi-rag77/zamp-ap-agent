import { z } from 'zod';

const nullableText = z.string().trim().min(1).nullable().optional().transform(value => value ?? null);
const confidence = z.number().min(0).max(1);
const money = z.union([z.number().finite(), z.string().trim().min(1)]).nullable().optional().transform(value => {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const normalized = value.replace(/[₹$€£,\s]/g, '').replace(/^(?:Rs\.?|INR|USD)\s*/i, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) throw new Error(`Invalid monetary amount: ${value}`);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error('Invalid monetary amount');
  return parsed;
});
const party = z.object({name:nullableText, gstin:nullableText, taxId:nullableText, address:nullableText}).partial().transform(v => ({name:v.name ?? null,gstin:v.gstin ?? null,taxId:v.taxId ?? null,address:v.address ?? null}));
const buyer = z.object({name:nullableText,taxId:nullableText,address:nullableText}).partial().transform(v => ({name:v.name ?? null,taxId:v.taxId ?? null,address:v.address ?? null}));
export const ExtractedInvoiceSchema = z.object({
  documentType:z.enum(['INVOICE','NOT_INVOICE','UNKNOWN']),
  invoiceNumber:nullableText, invoiceDate:nullableText, dueDate:nullableText,
  vendor:party, buyer,
  poNumber:nullableText, currency:nullableText,
  lineItems:z.array(z.object({lineNumber:z.number().int().positive(),description:z.string().trim().min(1),sku:nullableText,quantity:money,unitPrice:money,taxRate:money,amount:money})).default([]),
  subtotal:money,tax:money,total:money,paymentTerms:nullableText,
  confidence:z.object({invoiceNumber:confidence,invoiceDate:confidence,dueDate:confidence,vendor:confidence,buyer:confidence,poNumber:confidence,lineItems:confidence,subtotal:confidence,tax:confidence,total:confidence,currency:confidence}).partial().default({})
}).passthrough();
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
export type ExtractionStatus = 'COMPLETE'|'PARTIAL'|'INVALID'|'FAILED';
export type MathStatus = 'PASS'|'FAIL'|'NOT_CHECKABLE';
export type ValidationReport = {lineItemMath:MathStatus;subtotalMath:MathStatus;totalMath:MathStatus;warnings:string[]};
