import {decimal,fixed} from './decimal';
export function normalizeVendorName(value:string|null|undefined):string|null{
  if(!value)return null;
  const words=value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
  const suffixes=[['private','limited'],['pvt','ltd'],['pvt','limited'],['limited'],['ltd'],['inc'],['llc']];
  for(const suffix of suffixes)if(words.length>suffix.length&&suffix.every((word,i)=>words[words.length-suffix.length+i]===word)){words.splice(-suffix.length);break}
  return words.join(' ')||null;
}
export function normalizePurchaseOrderNumber(value:string|null|undefined):string|null{
  if(!value?.trim())return null;
  const compact=value.toUpperCase().replace(/[\s#_-]/g,'');
  const digits=/^(?:PO)?([A-Z0-9]+)$/.exec(compact);
  return digits?`PO-${digits[1]}`:null;
}
export const normalizeSKU=(value:string|null|undefined)=>value?value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,''):null;
export const normalizeDescription=(value:string|null|undefined)=>value?value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' '):null;
export function normalizeCurrency(value:string|null|undefined):string|null{
  if(!value)return null;
  const s=value.trim().toUpperCase();
  return ({'₹':'INR','$':'USD','€':'EUR','£':'GBP','RS':'INR','RS.':'INR'} as Record<string,string>)[s]??(['INR','USD','EUR','GBP'].includes(s)?s:null);
}
export function normalizeAmount(value:string|number):string{
  const s=String(value).trim().replace(/^(?:₹|\$|€|£|INR\s*|USD\s*|EUR\s*|GBP\s*)/i,'').trim();
  if(/^\d+(?:\.\d{1,4})?$/.test(s))return fixed(decimal(s));
  // Accept western and Indian digit grouping only when the decimal mark is unambiguous.
  if(/^(?:\d{1,3})(?:,\d{3})+(?:\.\d{1,4})?$/.test(s)||/^\d{1,3}(?:,\d{2})+,\d{3}(?:\.\d{1,4})?$/.test(s))return fixed(decimal(s.replaceAll(',','')));
  throw new Error('INVALID_AMOUNT_FORMAT');
}
export const normalizeQuantity=(value:string|number)=>normalizeAmount(value);
export function tokenSimilarity(a:string,b:string):number{
  const x=new Set((normalizeDescription(a)??'').split(' ').filter(Boolean)),y=new Set((normalizeDescription(b)??'').split(' ').filter(Boolean));
  if(!x.size||!y.size)return 0;
  let same=0;for(const token of x)if(y.has(token))same++;
  return same/(x.size+y.size-same);
}
