import { z } from 'zod';

const nullableText = z.string().trim().min(1).nullable().optional().transform(value => value ?? null);
const confidence = z.number().min(0).max(1);
const provenance = z.object({page:z.number().int().positive().nullable(),confidence}).strict();
const money = z.union([z.number().finite(), z.string().trim().min(1)]).nullable().optional().transform((value,ctx) => {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const normalized = value.replace(/[₹$€£,\s]/g, '').replace(/^(?:Rs\.?|INR|USD)\s*/i, '');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {ctx.addIssue({code:'custom',message:`Invalid monetary amount: ${value}`});return z.NEVER}
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {ctx.addIssue({code:'custom',message:'Invalid monetary amount'});return z.NEVER}
  return parsed;
});
const taxRate=z.union([z.number().finite(),z.string().trim().min(1)]).nullable().optional().transform((value,ctx)=>{
  if(value==null)return null;
  if(typeof value==='number')return value;
  const normalized=value.trim().replace(/%$/,'').trim();
  if(!/^\d+(?:\.\d+)?$/.test(normalized)){ctx.addIssue({code:'custom',message:`Invalid tax rate: ${value}`});return z.NEVER}
  return Number(normalized);
});
const party = z.object({name:nullableText, gstin:nullableText, taxId:nullableText, address:nullableText}).partial().default({}).transform(v => ({name:v.name ?? null,gstin:v.gstin ?? null,taxId:v.taxId ?? null,address:v.address ?? null}));
const buyer = z.object({name:nullableText,taxId:nullableText,address:nullableText}).partial().default({}).transform(v => ({name:v.name ?? null,taxId:v.taxId ?? null,address:v.address ?? null}));
const nullableParty = z.union([party,z.null()]).optional().transform(value => value ?? {name:null,gstin:null,taxId:null,address:null});
const nullableBuyer = z.union([buyer,z.null()]).optional().transform(value => value ?? {name:null,taxId:null,address:null});
export const ExtractedInvoiceSchema = z.object({
  documentType:z.enum(['INVOICE','NOT_INVOICE','UNKNOWN']),
  invoiceNumber:nullableText, invoiceDate:nullableText, dueDate:nullableText,
  vendor:nullableParty, buyer:nullableBuyer, shipTo:nullableBuyer,
  poNumber:nullableText, currency:nullableText,
  lineItems:z.array(z.object({lineNumber:z.number().int().positive(),itemName:nullableText,description:z.string().trim().min(1),sku:nullableText,quantity:money,uom:nullableText,unitPrice:money,taxRate,amount:money,provenance:z.object({page:z.number().int().positive().nullable()}).optional()})).default([]),
  subtotal:money,tax:money,total:money,paymentTerms:nullableText,
  confidence:z.object({invoiceNumber:confidence,invoiceDate:confidence,dueDate:confidence,vendor:confidence,buyer:confidence,poNumber:confidence,lineItems:confidence,subtotal:confidence,tax:confidence,total:confidence,currency:confidence}).partial().default({}),
  provenance:z.object({invoiceNumber:provenance,invoiceDate:provenance,dueDate:provenance,vendor:provenance,buyer:provenance,poNumber:provenance,subtotal:provenance,tax:provenance,total:provenance,currency:provenance}).partial().default({})
}).passthrough();
export type ExtractedInvoice = z.infer<typeof ExtractedInvoiceSchema>;
export type ExtractionStatus = 'COMPLETE'|'PARTIAL'|'INVALID'|'FAILED';
export type MathStatus = 'PASS'|'FAIL'|'NOT_CHECKABLE';
export type ValidationReport = {lineItemMath:MathStatus;subtotalMath:MathStatus;totalMath:MathStatus;warnings:string[]};
