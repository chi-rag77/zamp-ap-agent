export type CheckStatus='PASS'|'FAIL'|'WARNING'|'SKIPPED';
export type MatchStatus='PASS'|'FAIL'|'INCOMPLETE';
export interface ValidationCheck {
  check:string;
  status:CheckStatus;
  code?:string;
  expected?:string|number|null;
  actual?:string|number|null;
  varianceAmount?:string;
  variancePercent?:number|null;
  threshold?:string;
  evidence:Record<string,unknown>;
  reason?:string;
}
export interface VendorRecord {id:string;name:string;vendorCode?:string|null;gstin:string|null;taxId:string|null;emailDomain:string|null;status:string}
export interface PORecord {id:string;number:string;vendorId:string;currency:string;status:string;poDate:string;total:string}
export interface LineRecord {id:string;lineNumber:number;sku:string|null;description:string;quantity:string;unitPrice:string;taxRate:string|null;amount:string}
export interface POLineRecord extends LineRecord {poId:string}
export interface InvoiceRecord {id:string;number:string|null;vendorId:string|null;poId:string|null;currency:string;date:string|null;receivedAt:string;subtotal:string|null;tax:string|null;total:string|null;documentHash:string|null;archivedAt:string|null;status:string}
export interface PreviousInvoice {invoice:InvoiceRecord;lines:LineRecord[]}
export interface ReceiptLine {receiptId:string;poLineId:string;acceptedQuantity:string}
export interface VendorClaim {name:string|null;gstin:string|null;taxId:string|null;senderEmail?:string|null}
export interface TaxComponent {name:string;rate:string|null;amount:string}
export interface Adjustments {discount:string;charges:string}
export interface MatchingBase {invoice:InvoiceRecord;invoiceLines:LineRecord[];vendorClaim:VendorClaim;poNumber:string|null;vendors:VendorRecord[];purchaseOrders:PORecord[];extractionId:string|null;taxComponents:TaxComponent[];adjustments:Adjustments|null}
export interface RelatedData {poLines:POLineRecord[];receiptLines:ReceiptLine[];previousInvoices:PreviousInvoice[]}
export interface MatchingContext extends MatchingBase, RelatedData {}
export interface VendorMatchResult {status:'MATCHED'|'NOT_FOUND'|'AMBIGUOUS'|'MISMATCH';vendorId?:string;method:'GSTIN'|'TAX_ID'|'VENDOR_CODE'|'EXACT_NAME'|'LINKED_ID'|'FUZZY'|'NONE';candidates?:Array<{vendorId:string;vendorName:string;score:number}>;evidence:Record<string,unknown>;reason?:string}
export interface POMatchResult {status:'MATCHED'|'NOT_FOUND'|'AMBIGUOUS'|'VENDOR_MISMATCH';poId?:string;poNumber?:string;method:'EXACT_PO_NUMBER'|'LINKED_ID'|'VENDOR_AND_AMOUNT'|'CANDIDATE_MATCH'|'NONE';candidates?:Array<{poId:string;poNumber:string;score:number}>;evidence:Record<string,unknown>;reason?:string}
export interface LineMatchResult {invoiceLineId:string;status:'MATCHED'|'NOT_MATCHED'|'AMBIGUOUS';poLineId?:string;method:'SKU'|'DESCRIPTION'|'FUZZY_DESCRIPTION'|'NONE';score?:number;evidence:Record<string,unknown>;reason?:string}
export interface DuplicateResult {status:'NO_DUPLICATE'|'CONFIRMED_DUPLICATE'|'POSSIBLE_DUPLICATE';matchedInvoiceId?:string;matchType:'EXACT'|'STRONG'|'FUZZY'|'NONE';similarity?:number;evidence:Record<string,unknown>;reason?:string}
export interface WayMatchResult {status:MatchStatus|'NOT_REQUIRED';checks:ValidationCheck[];summary:{totalChecks:number;passed:number;failed:number;warnings:number;skipped:number}}
export interface InvoiceValidationResult {invoiceId:string;runId?:string;extractionId:string|null;engineVersion:string;status:MatchStatus;vendor:VendorMatchResult;purchaseOrder:POMatchResult;lineMatches:LineMatchResult[];checks:ValidationCheck[];twoWayMatch:WayMatchResult;threeWayMatch:WayMatchResult;duplicate:DuplicateResult;summary:{passed:number;failed:number;warnings:number;skipped:number};blockers:string[];warnings:string[];generatedAt:string}
export interface MatchingRepository {
  loadBase(invoiceId:string):Promise<MatchingBase|null>;
  loadRelated(invoiceId:string,vendorId:string|null,poId:string|null):Promise<RelatedData>;
  startRun(invoiceId:string,version:string):Promise<string>;
  finishRun(runId:string,result:InvoiceValidationResult):Promise<void>;
  failRun(runId:string,invoiceId:string,code:string,message:string):Promise<void>;
}
