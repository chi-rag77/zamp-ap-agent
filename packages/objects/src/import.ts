import {z} from 'zod';
import {type ObjectType,coreFields} from './schema';
const text=z.string().trim().min(1).max(500),date=z.string().date(),money=z.coerce.number().finite().nonnegative(),uuid=z.string().uuid(),currency=z.string().regex(/^[A-Z]{3}$/);
const definitions={
 vendor:z.object({vendor_code:text,legal_name:text,display_name:text,currency,gstin:z.string().optional(),tax_id:z.string().optional(),email_domain:z.string().optional()}),
 purchase_order:z.object({po_number:text,vendor_id:uuid,currency,po_date:date,valid_until:date.optional(),subtotal:money,tax:money,total:money}),
 invoice:z.object({invoice_number:text,vendor_id:uuid,po_id:uuid,invoice_date:date,due_date:date.optional(),currency,subtotal:money,tax:money,total:money}),
 goods_receipt:z.object({grn_number:text,po_id:uuid,vendor_id:uuid,receipt_date:date}),
 payment:z.object({payment_number:text,invoice_id:uuid,vendor_id:uuid,amount:money,currency,payment_date:date.optional()}),
};
export const identityFields:Record<ObjectType,string>={invoice:'invoice_number',purchase_order:'po_number',goods_receipt:'grn_number',vendor:'vendor_code',payment:'payment_number'};
export function importFields(type:ObjectType){return coreFields[type].filter(k=>!['status','decision'].includes(k))}
export function suggestMapping(headers:string[],type:ObjectType){const normal=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');return Object.fromEntries(headers.map(h=>[h,importFields(type).find(f=>normal(f)===normal(h))??'']))}
export function prepareImport(type:ObjectType,rows:Record<string,string>[],mapping:Record<string,string>){
 const targets=Object.values(mapping).filter(Boolean);if(new Set(targets).size!==targets.length)throw new Error('Map each target field only once.');if(targets.some(t=>!importFields(type).includes(t)))throw new Error('Unknown or protected target field.');
 const seen=new Set<string>();return rows.map((row,index)=>{
  const mapped:Record<string,string>={};for(const [source,target] of Object.entries(mapping))if(target&&row[source]?.trim())mapped[target]=row[source].trim();
  const result=definitions[type].safeParse(mapped);const errors=result.success?[]:result.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);const data:Record<string,unknown>=result.success?result.data:mapped;
  const key=String(data[identityFields[type]]??'');if(seen.has(key))errors.push('Duplicate identifier in this file');seen.add(key);
  if(result.success&&'total' in data&&Math.abs(Number(data.subtotal)+Number(data.tax)-Number(data.total))>0.01)errors.push('Subtotal plus tax must equal total');
  if(data.due_date&&String(data.due_date)<String(data.invoice_date))errors.push('Due date is before invoice date');
  if(data.valid_until&&String(data.valid_until)<String(data.po_date))errors.push('Expiry is before purchase order date');
  return {row:index+2,data,errors};
 });
}
