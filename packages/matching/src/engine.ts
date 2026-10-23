import {D,decimal,fixed,lineAmount,percent,sum,within} from './decimal';
import {normalizeSKU,normalizeDescription} from './normalize';
import {matchLines,resolvePO,resolveVendor} from './resolve';
import type {DuplicateResult,InvoiceValidationResult,LineMatchResult,LineRecord,MatchingContext,ValidationCheck,WayMatchResult} from './types';
export const MATCHING_ENGINE_VERSION='1.0.0';
const tolerance='0.01';
const check=(name:string,status:ValidationCheck['status'],evidence:Record<string,unknown>,extra:Partial<ValidationCheck>={}):ValidationCheck=>({check:name,status,evidence,...extra});
const compare=(name:string,expected:string,actual:string,evidence:Record<string,unknown>,code:string,reason:string):ValidationCheck=>{
  const e=decimal(expected),a=decimal(actual),pass=within(e,a,tolerance);
  return check(name,pass?'PASS':'FAIL',evidence,{expected:fixed(e),actual:fixed(a),varianceAmount:fixed(a.minus(e)),variancePercent:percent(a,e),threshold:tolerance,...(pass?{}:{code,reason})});
};
const summarize=(checks:ValidationCheck[])=>({totalChecks:checks.length,passed:checks.filter(c=>c.status==='PASS').length,failed:checks.filter(c=>c.status==='FAIL').length,warnings:checks.filter(c=>c.status==='WARNING').length,skipped:checks.filter(c=>c.status==='SKIPPED').length});
const way=(checks:ValidationCheck[]):WayMatchResult=>{
  const summary=summarize(checks);
  return {status:summary.failed?'FAIL':summary.warnings||summary.skipped?'INCOMPLETE':'PASS',checks,summary};
};
const lineFingerprint=(lines:LineRecord[])=>lines.map(l=>[normalizeSKU(l.sku),normalizeDescription(l.description),fixed(decimal(l.quantity)),fixed(decimal(l.unitPrice)),fixed(decimal(l.amount))].join('|')).sort().join('::');
export function detectDuplicate(context:MatchingContext,vendorId:string|null,poId:string|null):DuplicateResult{
  if(!vendorId)return {status:'NO_DUPLICATE',matchType:'NONE',evidence:{scope:'vendor unresolved'},reason:'Duplicate search cannot be conclusive without a vendor'};
  const {invoice,invoiceLines}=context;
  const candidates=context.previousInvoices.filter(p=>p.invoice.id!==invoice.id&&p.invoice.vendorId===vendorId&&!p.invoice.archivedAt&&p.invoice.receivedAt<invoice.receivedAt);
  const number=invoice.number?.trim().toUpperCase();
  const exact=candidates.find(p=>number&&poId&&p.invoice.number?.trim().toUpperCase()===number&&p.invoice.poId===poId&&invoice.total!==null&&p.invoice.total!==null&&decimal(invoice.total).eq(decimal(p.invoice.total)));
  if(exact)return {status:'CONFIRMED_DUPLICATE',matchedInvoiceId:exact.invoice.id,matchType:'EXACT',similarity:1,evidence:{invoiceNumber:number,poId,total:invoice.total},reason:'Same vendor, invoice number, PO and amount already exist'};
  const hash=candidates.find(p=>invoice.documentHash&&p.invoice.documentHash===invoice.documentHash);
  if(hash)return {status:'POSSIBLE_DUPLICATE',matchedInvoiceId:hash.invoice.id,matchType:'STRONG',similarity:1,evidence:{documentHash:invoice.documentHash},reason:'Document hash already exists for this vendor'};
  const sameNumber=candidates.find(p=>number&&p.invoice.number?.trim().toUpperCase()===number);
  if(sameNumber)return {status:'POSSIBLE_DUPLICATE',matchedInvoiceId:sameNumber.invoice.id,matchType:'STRONG',similarity:0.8,evidence:{invoiceNumber:number},reason:'Same vendor and invoice number with different amount or PO'};
  const fingerprint=invoiceLines.length?lineFingerprint(invoiceLines):null;
  const possible=candidates.find(p=>invoice.total!==null&&p.invoice.total!==null&&decimal(invoice.total).eq(decimal(p.invoice.total))&&invoice.date&&p.invoice.date===invoice.date&&p.invoice.poId===poId&&fingerprint&&p.lines.length&&lineFingerprint(p.lines)===fingerprint);
  if(possible)return {status:'POSSIBLE_DUPLICATE',matchedInvoiceId:possible.invoice.id,matchType:'FUZZY',similarity:0.9,evidence:{date:invoice.date,poId,total:invoice.total,lineFingerprint:true},reason:'Vendor, date, PO, amount and lines are identical'};
  return {status:'NO_DUPLICATE',matchType:'NONE',evidence:{candidateCount:candidates.length}};
}
const rate=(value:string)=>{const r=decimal(value);return r.gt(1)?r.div(100):r};
export function evaluateInvoice(context:MatchingContext,now=new Date().toISOString()):InvoiceValidationResult{
  const {invoice,invoiceLines}=context;
  const vendor=resolveVendor(context.vendorClaim,invoice.vendorId,context.vendors);
  const purchaseOrder=resolvePO(context.poNumber,invoice.poId,invoice,vendor,context.purchaseOrders);
  const po=context.purchaseOrders.find(p=>p.id===(purchaseOrder.poId??purchaseOrder.evidence.poId));
  const poLines=purchaseOrder.status==='MATCHED'?context.poLines.filter(p=>p.poId===purchaseOrder.poId):[];
  const lineMatches:LineMatchResult[]=po?matchLines(invoiceLines,poLines):invoiceLines.map(line=>({invoiceLineId:line.id,status:'NOT_MATCHED',method:'NONE',evidence:{reason:'PO unresolved'},reason:'PO unresolved'}));
  const checks:ValidationCheck[]=[];
  checks.push(check('VENDOR_MATCH',vendor.status==='MATCHED'?'PASS':vendor.status==='AMBIGUOUS'?'WARNING':'FAIL',{...vendor.evidence},{code:vendor.status==='MATCHED'?undefined:vendor.status==='AMBIGUOUS'?'AMBIGUOUS_VENDOR':'VENDOR_NOT_FOUND',reason:vendor.reason}));
  checks.push(check('PO_MATCH',purchaseOrder.status==='MATCHED'?'PASS':purchaseOrder.status==='AMBIGUOUS'?'WARNING':'FAIL',{...purchaseOrder.evidence},{code:purchaseOrder.status==='MATCHED'?undefined:purchaseOrder.status==='AMBIGUOUS'?'AMBIGUOUS_PO':purchaseOrder.status==='VENDOR_MISMATCH'?'VENDOR_PO_MISMATCH':'PO_NOT_FOUND',reason:purchaseOrder.reason}));
  if(po)checks.push(check('PO_VENDOR_MATCH',po.vendorId===vendor.vendorId?'PASS':'FAIL',{poId:po.id,poVendorId:po.vendorId,invoiceVendorId:vendor.vendorId},{code:po.vendorId===vendor.vendorId?undefined:'VENDOR_PO_MISMATCH',reason:po.vendorId===vendor.vendorId?undefined:'Purchase order belongs to another vendor'}));
  else checks.push(check('PO_VENDOR_MATCH','SKIPPED',{reason:'PO unresolved'},{reason:'Cannot verify PO ownership'}));
  if(po)checks.push(check('CURRENCY_MATCH',invoice.currency===po.currency?'PASS':'FAIL',{invoiceCurrency:invoice.currency,poCurrency:po.currency},{expected:po.currency,actual:invoice.currency,code:invoice.currency===po.currency?undefined:'CURRENCY_MISMATCH',reason:invoice.currency===po.currency?undefined:'Invoice and PO currencies differ; no conversion attempted'}));
  else checks.push(check('CURRENCY_MATCH','SKIPPED',{reason:'PO unresolved'},{reason:'Cannot compare currency'}));
  if(!invoiceLines.length)checks.push(check('LINE_MATCH','SKIPPED',{}, {code:'NO_INVOICE_LINES',reason:'No complete invoice lines available'}));
  const previous=context.previousInvoices.filter(p=>p.invoice.id!==invoice.id&&p.invoice.poId===po?.id&&p.invoice.status==='APPROVED'&&p.invoice.receivedAt<invoice.receivedAt);
  const previousByPoLine=new Map<string,InstanceType<typeof D>>();
  const ambiguousPrevious=new Set<string>();
  if(po){for(const old of previous){for(const match of matchLines(old.lines,poLines)){const oldLine=old.lines.find(l=>l.id===match.invoiceLineId)!;if(match.status==='MATCHED'&&match.poLineId)previousByPoLine.set(match.poLineId,(previousByPoLine.get(match.poLineId)??new D(0)).plus(decimal(oldLine.quantity)));else for(const line of poLines)ambiguousPrevious.add(line.id)}}}
  for(const line of invoiceLines){
    const m=lineMatches.find(x=>x.invoiceLineId===line.id)!;
    const source={invoiceLineId:line.id,invoiceField:`lineItems[${line.lineNumber-1}]`,poLineId:m.poLineId??null};
    checks.push(check('LINE_MATCH',m.status==='MATCHED'?'PASS':m.status==='AMBIGUOUS'?'WARNING':'FAIL',{...source,...m.evidence},{code:m.status==='MATCHED'?undefined:m.status==='AMBIGUOUS'?'AMBIGUOUS_LINE_MATCH':'LINE_NOT_MATCHED',reason:m.reason}));
    const calculated=lineAmount(line.quantity,line.unitPrice);
    checks.push(compare('LINE_AMOUNT_MATCH',calculated,line.amount,{...source,quantity:line.quantity,unitPrice:line.unitPrice},'LINE_AMOUNT_MISMATCH','Invoice line amount differs from quantity × unit price'));
    if(m.status!=='MATCHED'||!m.poLineId)continue;
    const reference=poLines.find(p=>p.id===m.poLineId)!;
    if(ambiguousPrevious.has(reference.id)){checks.push(check('QUANTITY_MATCH','SKIPPED',source,{reason:'Previous invoices cannot be allocated uniquely to PO lines'}));continue}
    const already=previousByPoLine.get(reference.id)??new D(0),remaining=decimal(reference.quantity).minus(already),actual=decimal(line.quantity);
    checks.push(check('QUANTITY_MATCH',actual.lte(remaining)?'PASS':'FAIL',{...source,poQuantity:reference.quantity,previouslyInvoiced:fixed(already),previousInvoiceIds:previous.map(p=>p.invoice.id)},{expected:fixed(remaining),actual:fixed(actual),varianceAmount:fixed(actual.minus(remaining)),code:actual.lte(remaining)?undefined:'PO_BILLING_QUANTITY_EXCEEDED',reason:actual.lte(remaining)?undefined:'Invoice quantity exceeds remaining billable PO quantity'}));
    const expectedPrice=decimal(reference.unitPrice),actualPrice=decimal(line.unitPrice),different=!actualPrice.eq(expectedPrice);
    checks.push(check('PRICE_MATCH',expectedPrice.isZero()?'FAIL':different?'FAIL':'PASS',{...source,invoiceSourceField:`lineItems[${line.lineNumber-1}].unitPrice`,poSourceField:`poLines[${reference.lineNumber-1}].unitPrice`},{expected:fixed(expectedPrice),actual:fixed(actualPrice),varianceAmount:fixed(actualPrice.minus(expectedPrice)),variancePercent:expectedPrice.isZero()?null:percent(actualPrice,expectedPrice),code:expectedPrice.isZero()?'INVALID_REFERENCE_PRICE':different?'PRICE_VARIANCE':undefined,reason:expectedPrice.isZero()?'PO unit price is zero':different?'Invoice unit price differs from PO unit price':undefined}));
    if(line.taxRate!==null&&reference.taxRate!==null){const actualRate=rate(line.taxRate),expectedRate=rate(reference.taxRate);checks.push(check('TAX_RATE_MATCH',actualRate.eq(expectedRate)?'PASS':'FAIL',source,{expected:expectedRate.toString(),actual:actualRate.toString(),code:actualRate.eq(expectedRate)?undefined:'TAX_RATE_MISMATCH',reason:actualRate.eq(expectedRate)?undefined:'Invoice and PO line tax rates differ'}))}
  }
  if(invoice.subtotal!==null&&invoiceLines.length)checks.push(compare('SUBTOTAL_MATCH',fixed(sum(invoiceLines.map(l=>decimal(l.amount)))),invoice.subtotal,{invoiceField:'subtotal',lineCount:invoiceLines.length},'SUBTOTAL_MISMATCH','Invoice subtotal differs from line amounts'));
  else checks.push(check('SUBTOTAL_MATCH','SKIPPED',{invoiceField:'subtotal'},{reason:'Subtotal or invoice lines missing'}));
  if(invoice.tax!==null){
    if(context.taxComponents.length){
      const components=context.taxComponents;
      checks.push(compare('TAX_MATCH',fixed(sum(components.map(c=>decimal(c.amount)))),invoice.tax,{source:'taxComponents',components:components.map(c=>c.name)},'TAX_MISMATCH','Tax total differs from component sum'));
      for(const component of components)if(component.rate!==null&&invoice.subtotal!==null)checks.push(compare('TAX_COMPONENT_MATCH',fixed(decimal(invoice.subtotal).times(rate(component.rate))),component.amount,{component:component.name},'TAX_MISMATCH',`${component.name} amount differs from subtotal × rate`));
    }else if(invoiceLines.length&&invoiceLines.every(l=>l.taxRate!==null))checks.push(compare('TAX_MATCH',fixed(sum(invoiceLines.map(l=>decimal(l.amount).times(rate(l.taxRate!))))),invoice.tax,{source:'invoiceLines.taxRate'},'TAX_MISMATCH','Tax differs from line amounts × rates'));
    else if(invoiceLines.length&&lineMatches.every(m=>m.status==='MATCHED'&&m.poLineId&&poLines.some(p=>p.id===m.poLineId&&p.taxRate!==null))){
      const expected=sum(invoiceLines.map(l=>{const poLine=poLines.find(p=>p.id===lineMatches.find(m=>m.invoiceLineId===l.id)?.poLineId)!;return decimal(l.amount).times(rate(poLine.taxRate!))}));
      checks.push(compare('TAX_MATCH',fixed(expected),invoice.tax,{source:'purchaseOrderLines.taxRate',invoiceLineIds:invoiceLines.map(l=>l.id)},'TAX_MISMATCH','Tax differs from invoice line amounts × PO tax rates'));
    }
    else checks.push(check('TAX_MATCH','SKIPPED',{invoiceField:'tax'},{reason:'Tax rate or component breakdown unavailable'}));
  }else checks.push(check('TAX_MATCH','SKIPPED',{invoiceField:'tax'},{reason:'Invoice tax missing'}));
  if(invoice.subtotal!==null&&invoice.tax!==null&&invoice.total!==null){const discount=context.adjustments?decimal(context.adjustments.discount):new D(0),charges=context.adjustments?decimal(context.adjustments.charges):new D(0);checks.push(compare('TOTAL_MATCH',fixed(decimal(invoice.subtotal).plus(decimal(invoice.tax)).minus(discount).plus(charges)),invoice.total,{subtotal:invoice.subtotal,tax:invoice.tax,discount:fixed(discount),charges:fixed(charges)},'TOTAL_MISMATCH','Invoice total differs from subtotal + tax - discount + charges'))}
  else checks.push(check('TOTAL_MATCH','SKIPPED',{invoiceField:'total'},{reason:'Subtotal, tax or total missing'}));
  const duplicate=detectDuplicate(context,vendor.vendorId??null,po?.id??null);
  checks.push(check('DUPLICATE_CHECK',vendor.status!=='MATCHED'?'SKIPPED':duplicate.status==='CONFIRMED_DUPLICATE'?'FAIL':duplicate.status==='POSSIBLE_DUPLICATE'?'WARNING':'PASS',duplicate.evidence,{code:duplicate.status==='CONFIRMED_DUPLICATE'?'CONFIRMED_DUPLICATE':duplicate.status==='POSSIBLE_DUPLICATE'?'POSSIBLE_DUPLICATE':undefined,reason:duplicate.reason}));
  const twoWayChecks=checks.filter(c=>c.check!=='DUPLICATE_CHECK'&&c.check!=='GRN_QUANTITY_MATCH');
  const twoWayMatch=way(twoWayChecks);
  let threeWayMatch:WayMatchResult={status:'NOT_REQUIRED',checks:[],summary:summarize([])};
  if(po&&(context.receiptLines.length||['PARTIALLY_RECEIVED','FULLY_RECEIVED'].includes(po.status))){
    const grnChecks:ValidationCheck[]=[];
    for(const m of lineMatches){if(m.status!=='MATCHED'||!m.poLineId){grnChecks.push(check('GRN_QUANTITY_MATCH','SKIPPED',{invoiceLineId:m.invoiceLineId},{reason:'Invoice line not matched to PO'}));continue}
      const line=invoiceLines.find(l=>l.id===m.invoiceLineId)!;
      const received=sum(context.receiptLines.filter(r=>r.poLineId===m.poLineId).map(r=>decimal(r.acceptedQuantity)));
      const prior=previousByPoLine.get(m.poLineId)??new D(0);
      const remaining=received.minus(prior),actual=decimal(line.quantity);
      grnChecks.push(check('GRN_QUANTITY_MATCH',ambiguousPrevious.has(m.poLineId)?'SKIPPED':actual.lte(remaining)?'PASS':'FAIL',{invoiceLineId:line.id,poLineId:m.poLineId,receiptIds:context.receiptLines.filter(r=>r.poLineId===m.poLineId).map(r=>r.receiptId),previouslyInvoiced:fixed(prior)},{expected:fixed(remaining),actual:fixed(actual),varianceAmount:fixed(actual.minus(remaining)),code:actual.lte(remaining)?undefined:'GRN_QUANTITY_EXCEEDED',reason:actual.lte(remaining)?undefined:'Invoice quantity exceeds accepted, unbilled receipts'}));
    }
    if(!grnChecks.length)grnChecks.push(check('GRN_QUANTITY_MATCH','SKIPPED',{}, {reason:'No invoice lines available'}));
    checks.push(...grnChecks);threeWayMatch=way([...twoWayChecks,...grnChecks]);
  }
  const summary=summarize(checks);
  const status=summary.failed?'FAIL':summary.warnings||summary.skipped?'INCOMPLETE':'PASS';
  return {invoiceId:invoice.id,extractionId:context.extractionId,engineVersion:MATCHING_ENGINE_VERSION,status,vendor,purchaseOrder,lineMatches,checks,twoWayMatch,threeWayMatch,duplicate,summary:{passed:summary.passed,failed:summary.failed,warnings:summary.warnings,skipped:summary.skipped},blockers:[...new Set(checks.filter(c=>c.status==='FAIL').map(c=>c.code??c.check))],warnings:[...new Set(checks.filter(c=>c.status==='WARNING'||c.status==='SKIPPED').map(c=>c.reason??c.code??c.check))],generatedAt:now};
}
