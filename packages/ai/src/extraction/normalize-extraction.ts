import type { ExtractedInvoice } from '../schema';

export type NormalizedInvoice=ExtractedInvoice & {warnings:string[]};
function normalizeDate(value:string|null,warnings:string[],field:string):string|null{
  if(!value)return null;
  const raw=value.trim();
  const valid=(candidate:string)=>{const date=new Date(`${candidate}T00:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===candidate};
  const iso=/^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if(iso){if(valid(raw))return raw;warnings.push(`${field}: invalid date ${raw}`);return null}
  const numeric=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if(numeric){
    const a=Number(numeric[1]),b=Number(numeric[2]),year=Number(numeric[3]);
    if(a<=12&&b<=12){warnings.push(`${field}: ambiguous date ${raw}`);return null}
    const day=a>12?a:b,month=a>12?b:a;
    const result=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if(valid(result))return result;
  }
  const named=/^(?:(\d{1,2})\s+([A-Za-z]{3,9})|([A-Za-z]{3,9})\s+(\d{1,2}),?)\s+(\d{4})$/.exec(raw);
  if(named){const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];const month=months.indexOf((named[2]??named[3]).slice(0,3).toLowerCase())+1;const day=Number(named[1]??named[4]);const year=Number(named[5]);if(month){const result=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;if(valid(result))return result}}
  warnings.push(`${field}: unrecognized date ${raw}`);return null;
}
function normalizeCurrency(value:string|null,warnings:string[]):string|null{
  if(!value)return null;
  const s=value.trim().toUpperCase();
  if(['₹','RS','RS.','INR','INDIAN RUPEES'].includes(s))return 'INR';
  if(['$','USD','US DOLLAR','US DOLLARS'].includes(s))return 'USD';
  if(['€','EUR','EURO'].includes(s))return 'EUR';
  if(/^[A-Z]{3}$/.test(s))return s;
  warnings.push(`currency: unrecognized ${value}`);return null;
}
export function normalizeExtraction(value:ExtractedInvoice):NormalizedInvoice{
  const warnings:string[]=[];
  return {...value,invoiceDate:normalizeDate(value.invoiceDate,warnings,'invoiceDate'),dueDate:normalizeDate(value.dueDate,warnings,'dueDate'),currency:normalizeCurrency(value.currency,warnings),warnings};
}
