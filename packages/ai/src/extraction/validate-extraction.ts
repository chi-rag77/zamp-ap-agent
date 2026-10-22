import type { ExtractedInvoice, MathStatus, ValidationReport } from '../schema';

// Scale to 4 decimal places so financial checks avoid binary floating point arithmetic.
function scaled(value:number):bigint{if(!Number.isFinite(value)||Math.abs(value)>1e12)throw new Error('Amount out of range');return BigInt(Math.round(value*10000))}
const tolerance=200n; // 0.02 at four decimal places
const near=(a:bigint,b:bigint)=>a>b?a-b<=tolerance:b-a<=tolerance;
const combined=(checks:MathStatus[]):MathStatus=>checks.includes('FAIL')?'FAIL':checks.includes('PASS')?'PASS':'NOT_CHECKABLE';
export function validateExtraction(invoice:ExtractedInvoice):ValidationReport{
  const warnings:string[]=[];
  const lineChecks:MathStatus[]=invoice.lineItems.map(line=>{
    if(line.quantity==null||line.unitPrice==null||line.amount==null)return 'NOT_CHECKABLE';
    const difference=scaled(line.quantity)*scaled(line.unitPrice)-scaled(line.amount)*10000n;
    const ok=difference<0n?-difference<=tolerance*10000n:difference<=tolerance*10000n;
    if(!ok)warnings.push(`Line ${line.lineNumber} amount differs from quantity × unit price`);
    return ok?'PASS':'FAIL';
  });
  const lineItemMath=combined(lineChecks);
  let subtotalMath:MathStatus='NOT_CHECKABLE';
  if(invoice.subtotal!=null&&invoice.lineItems.length&&invoice.lineItems.every(line=>line.amount!=null)){
    subtotalMath=near(invoice.lineItems.reduce((sum,line)=>sum+scaled(line.amount!),0n),scaled(invoice.subtotal))?'PASS':'FAIL';
    if(subtotalMath==='FAIL')warnings.push('Subtotal differs from sum of line amounts');
  }
  let totalMath:MathStatus='NOT_CHECKABLE';
  if(invoice.subtotal!=null&&invoice.tax!=null&&invoice.total!=null){
    totalMath=near(scaled(invoice.subtotal)+scaled(invoice.tax),scaled(invoice.total))?'PASS':'FAIL';
    if(totalMath==='FAIL')warnings.push('Total differs from subtotal plus tax');
  }
  return {lineItemMath,subtotalMath,totalMath,warnings};
}
export function extractionQuality(invoice:ExtractedInvoice):'COMPLETE'|'PARTIAL'{
  return invoice.invoiceNumber&&invoice.vendor.name&&invoice.total!=null&&invoice.currency?'COMPLETE':'PARTIAL';
}
export function overallConfidence(invoice:ExtractedInvoice):number|null{
  const fields=['invoiceNumber','vendor','total','currency'] as const;
  const values=fields.map(field=>invoice.confidence[field]).filter((v):v is number=>typeof v==='number');
  return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length*10000)/10000:null;
}
