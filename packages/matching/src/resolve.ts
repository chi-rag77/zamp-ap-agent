import type {InvoiceRecord,LineMatchResult,LineRecord,POMatchResult,POLineRecord,PORecord,VendorClaim,VendorMatchResult,VendorRecord} from './types';
import {normalizeDescription,normalizePurchaseOrderNumber,normalizeSKU,normalizeVendorName,tokenSimilarity} from './normalize';
import {decimal} from './decimal';
function claimedIdentifier(value:string|null):string|null{
  const trimmed=value?.trim();
  if(!trimmed)return null;
  // Extraction models sometimes turn an absent value into explanatory prose.
  // Treat only explicit absence markers as missing; a real but incorrect tax ID
  // must still fail closed instead of silently falling back to the vendor name.
  if(/^(?:not\s+(?:provided|available|found|applicable|specified|entered)(?:\b.*)?|unknown|n\s*\/\s*a|na|none|null|missing|[-—])$/i.test(trimmed))return null;
  return trimmed.replace(/\s/g,'').toUpperCase();
}
export function resolveVendor(claim:VendorClaim,existingVendorId:string|null,vendors:VendorRecord[]):VendorMatchResult{
  const active=vendors;
  const gstin=claimedIdentifier(claim.gstin);
  const taxId=claimedIdentifier(claim.taxId);
  const byId=(id:string)=>active.find(v=>v.id===id);
  const exact=(matches:VendorRecord[],method:VendorMatchResult['method']):VendorMatchResult|null=>{
    if(!matches.length)return null;
    if(matches.length>1)return {status:'AMBIGUOUS',method,candidates:matches.map(v=>({vendorId:v.id,vendorName:v.name,score:1})),evidence:{claim},reason:'Multiple vendors share the same identifier'};
    const v=matches[0];
    if(existingVendorId&&existingVendorId!==v.id)return {status:'MISMATCH',method,evidence:{claimedVendorId:v.id,existingVendorId},reason:'Extracted vendor conflicts with linked vendor'};
    return {status:'MATCHED',vendorId:v.id,method,evidence:{matchedValue:method==='EXACT_NAME'?normalizeVendorName(v.name):method==='GSTIN'?gstin:taxId}};
  };
  if(gstin){const found=exact(active.filter(v=>v.gstin?.replace(/\s/g,'').toUpperCase()===gstin),'GSTIN');if(found)return found;return {status:'MISMATCH',method:'GSTIN',evidence:{gstin},reason:'Invoice GSTIN does not match any vendor master record'}}
  if(taxId){const found=exact(active.filter(v=>v.taxId?.replace(/\s/g,'').toUpperCase()===taxId),'TAX_ID');if(found)return found;return {status:'MISMATCH',method:'TAX_ID',evidence:{taxId},reason:'Invoice tax ID does not match any vendor master record'}}
  const normalized=normalizeVendorName(claim.name);
  if(normalized){const found=exact(active.filter(v=>normalizeVendorName(v.name)===normalized),'EXACT_NAME');if(found)return found}
  if(existingVendorId&&!gstin&&!taxId&&!normalized&&byId(existingVendorId))return {status:'MATCHED',vendorId:existingVendorId,method:'LINKED_ID',evidence:{existingVendorId}};
  const candidates=normalized?active.map(v=>({vendorId:v.id,vendorName:v.name,score:tokenSimilarity(normalized,normalizeVendorName(v.name)??'')})).filter(v=>v.score>=0.5).sort((a,b)=>b.score-a.score).slice(0,5):[];
  if(candidates.length)return {status:'AMBIGUOUS',method:'FUZZY',candidates,evidence:{normalized},reason:'Name similarity only generates candidates; manual resolution required'};
  return {status:'NOT_FOUND',method:'NONE',evidence:{normalized,gstin:gstin??null,taxId:taxId??null},reason:'No verified vendor match'};
}
export function resolvePO(number:string|null,existingPoId:string|null,invoice:InvoiceRecord,vendor:VendorMatchResult,orders:PORecord[]):POMatchResult{
  const open=orders;
  const normalized=normalizePurchaseOrderNumber(number);
  const candidates=normalized?open.filter(p=>normalizePurchaseOrderNumber(p.number)===normalized):[];
  const match=(p:PORecord,method:POMatchResult['method']):POMatchResult=>vendor.status==='MATCHED'&&p.vendorId!==vendor.vendorId
    ?{status:'VENDOR_MISMATCH',poId:p.id,poNumber:p.number,method,evidence:{invoiceVendorId:vendor.vendorId,poVendorId:p.vendorId,poId:p.id},reason:'Purchase order belongs to a different vendor'}
    :vendor.status!=='MATCHED'?{status:'NOT_FOUND',method:'NONE',evidence:{poId:p.id},reason:'Vendor must be resolved before PO can match'}
    :{status:'MATCHED',poId:p.id,poNumber:p.number,method,evidence:{vendorId:p.vendorId,normalizedNumber:normalized}};
  if(candidates.length>1)return {status:'AMBIGUOUS',method:'CANDIDATE_MATCH',candidates:candidates.map(p=>({poId:p.id,poNumber:p.number,score:1})),evidence:{normalized},reason:'Multiple PO numbers normalize identically'};
  if(candidates.length===1){
    if(existingPoId&&existingPoId!==candidates[0].id)return {status:'AMBIGUOUS',method:'CANDIDATE_MATCH',candidates:[{poId:candidates[0].id,poNumber:candidates[0].number,score:1}],evidence:{existingPoId,extractedPoId:candidates[0].id},reason:'Extracted PO conflicts with the linked purchase order'};
    return match(candidates[0],'EXACT_PO_NUMBER');
  }
  if(existingPoId&&!normalized){const linked=open.find(p=>p.id===existingPoId);if(linked)return match(linked,'LINKED_ID')}
  if(normalized)return {status:'NOT_FOUND',method:'NONE',evidence:{normalized},reason:'Referenced purchase order was not found'};
  if(vendor.status!=='MATCHED')return {status:'NOT_FOUND',method:'NONE',evidence:{},reason:'No purchase order reference and vendor unresolved'};
  const possible=open.filter(p=>p.vendorId===vendor.vendorId&&p.currency===invoice.currency&&invoice.total!==null&&decimal(p.total).eq(decimal(invoice.total))&&(!invoice.date||p.poDate<=invoice.date));
  if(possible.length===1)return match(possible[0],'VENDOR_AND_AMOUNT');
  if(possible.length>1)return {status:'AMBIGUOUS',method:'CANDIDATE_MATCH',candidates:possible.map(p=>({poId:p.id,poNumber:p.number,score:0.7})),evidence:{vendorId:vendor.vendorId,total:invoice.total},reason:'Several purchase orders fit the vendor and amount'};
  return {status:'NOT_FOUND',method:'NONE',evidence:{vendorId:vendor.vendorId},reason:'No purchase order reference or unique candidate'};
}
export function matchLines(invoiceLines:LineRecord[],poLines:POLineRecord[]):LineMatchResult[]{
  const used=new Set<string>();
  return invoiceLines.map(line=>{
    const stages:{method:LineMatchResult['method'];score:number;matches:POLineRecord[]}[]=[
      {method:'SKU',score:1,matches:line.sku?poLines.filter(p=>p.sku&&normalizeSKU(p.sku)===normalizeSKU(line.sku)):[]},
      {method:'DESCRIPTION',score:1,matches:poLines.filter(p=>normalizeDescription(p.description)===normalizeDescription(line.description))},
      {method:'FUZZY_DESCRIPTION',score:0,matches:poLines.filter(p=>tokenSimilarity(p.description,line.description)>=0.8)}
    ];
    for(const stage of stages){
      if(!stage.matches.length)continue;
      if(stage.matches.length!==1||used.has(stage.matches[0].id))return {invoiceLineId:line.id,status:'AMBIGUOUS',method:stage.method,score:stage.score,evidence:{candidatePoLineIds:stage.matches.map(p=>p.id)},reason:'Line cannot be allocated uniquely'};
      const selected=stage.matches[0];used.add(selected.id);
      return {invoiceLineId:line.id,status:'MATCHED',poLineId:selected.id,method:stage.method,score:stage.method==='FUZZY_DESCRIPTION'?tokenSimilarity(selected.description,line.description):1,evidence:{invoiceLineNumber:line.lineNumber,poLineNumber:selected.lineNumber}};
    }
    return {invoiceLineId:line.id,status:'NOT_MATCHED',method:'NONE',evidence:{sku:line.sku,description:line.description},reason:'No PO line matches SKU or description'};
  });
}
