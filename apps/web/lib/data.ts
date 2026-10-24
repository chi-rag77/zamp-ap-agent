import 'server-only';
import {createServerClient} from '@zamp/database';
import type {InvoiceValidationResult} from '@zamp/matching';

export const localWorkspace=()=>process.env.NODE_ENV!=='production';
export type InvoiceRow={id:string;invoice_number:string|null;vendor_id:string|null;po_id:string|null;invoice_date:string|null;due_date:string|null;currency:string;subtotal:string|null;tax:string|null;total:string|null;extraction_confidence:string|null;status:string;decision:string|null;source:string;received_at:string;current_extraction_id:string|null;document_path:string|null};
export type VendorRow={id:string;vendor_code:string;legal_name:string;display_name:string;gstin:string|null;currency:string;status:string};
export type PORow={id:string;po_number:string;vendor_id:string;currency:string;status:string;po_date:string;total:string;subtotal:string;tax:string};
export type ValidationRow={id:string;invoice_id:string;status:string;engine_version:string;result:InvoiceValidationResult;created_at:string;run_id:string};
export type ExtractionRow={id:string;invoice_id:string;status:string;overall_confidence:string|null;normalized_output:Record<string,unknown>|null;provider:string;model:string;created_at:string};
export type DecisionRow={id:string;invoice_id:string;validation_run_id:string|null;decision:string;reason_code:string|null;summary:string;policy_version:string|null;created_at:string};
export type AuditRow={id:string;invoice_id:string|null;event_type:string;description:string;actor_type:string;created_at:string};
export type RunRow={id:string;invoice_id:string;status:string;agent_version:string;started_at:string|null;completed_at:string|null;duration_ms:number|null;error_code:string|null;created_at:string};
export type AgentRunRow={id:string;invoice_id:string;status:string;current_state:string;current_step:string|null;agent_version:string;started_at:string;completed_at:string|null;duration_ms:number|null;step_count:number;final_decision:string|null;error_code:string|null;created_at:string};
export type ReviewRow={id:string;invoice_id:string;status:string;reason:string;reason_code:string;priority:string;created_at:string};
export type Workspace={enabled:boolean;invoices:InvoiceRow[];vendors:VendorRow[];purchaseOrders:PORow[];validations:ValidationRow[];decisions:DecisionRow[];extractions:ExtractionRow[];audits:AuditRow[];runs:RunRow[];agentRuns:AgentRunRow[];reviews:ReviewRow[]};
const empty:Workspace={enabled:false,invoices:[],vendors:[],purchaseOrders:[],validations:[],decisions:[],extractions:[],audits:[],runs:[],agentRuns:[],reviews:[]};
function rows<T>(result:{data:T[]|null;error:{message:string}|null},name:string):T[]{if(result.error)throw new Error(`${name}: ${result.error.message}`);return result.data??[]}
export async function loadWorkspace():Promise<Workspace>{
  if(!localWorkspace())return empty;
  const db=createServerClient();
  const [invoices,vendors,purchaseOrders,validations,decisions,extractions,audits,runs,agentRuns,reviews]=await Promise.all([
    db.from('invoices').select('*').is('archived_at',null).order('received_at',{ascending:false}).limit(200),
    db.from('vendors').select('id,vendor_code,legal_name,display_name,gstin,currency,status').is('archived_at',null).order('legal_name').limit(200),
    db.from('purchase_orders').select('id,po_number,vendor_id,currency,status,po_date,total,subtotal,tax').is('archived_at',null).order('po_date',{ascending:false}).limit(200),
    db.from('invoice_validation_runs').select('id,invoice_id,status,engine_version,result,created_at,run_id').order('created_at',{ascending:false}).limit(200),
    db.from('agent_decisions').select('id,invoice_id,validation_run_id,decision,reason_code,summary,policy_version,created_at').order('created_at',{ascending:false}).limit(200),
    db.from('invoice_extractions').select('id,invoice_id,status,overall_confidence,normalized_output,provider,model,created_at').eq('is_canonical',true).order('created_at',{ascending:false}).limit(200),
    db.from('audit_events').select('id,invoice_id,event_type,description,actor_type,created_at').order('created_at',{ascending:false}).limit(100),
    db.from('processing_runs').select('id,invoice_id,status,agent_version,started_at,completed_at,duration_ms,error_code,created_at').order('created_at',{ascending:false}).limit(100),
    db.from('agent_runs').select('id,invoice_id,status,current_state,current_step,agent_version,started_at,completed_at,duration_ms,step_count,final_decision,error_code,created_at').order('created_at',{ascending:false}).limit(100),
    db.from('review_cases').select('id,invoice_id,status,reason,reason_code,priority,created_at').order('created_at',{ascending:false}).limit(100)
  ]);
  return {enabled:true,invoices:rows(invoices,'invoices') as InvoiceRow[],vendors:rows(vendors,'vendors') as VendorRow[],purchaseOrders:rows(purchaseOrders,'purchase orders') as PORow[],validations:rows(validations,'validations') as ValidationRow[],decisions:rows(decisions,'decisions') as DecisionRow[],extractions:rows(extractions,'extractions') as ExtractionRow[],audits:rows(audits,'audit events') as AuditRow[],runs:rows(runs,'processing runs') as RunRow[],agentRuns:rows(agentRuns,'agent runs') as AgentRunRow[],reviews:rows(reviews,'review cases') as ReviewRow[]};
}
export const latestDecision=(workspace:Workspace,invoiceId:string)=>workspace.decisions.find(row=>row.invoice_id===invoiceId);
export const latestValidation=(workspace:Workspace,invoiceId:string)=>workspace.validations.find(row=>row.invoice_id===invoiceId);
export const extractionFor=(workspace:Workspace,invoiceId:string)=>workspace.extractions.find(row=>row.invoice_id===invoiceId);
export function vendorName(workspace:Workspace,invoice:InvoiceRow){
  const linked=workspace.vendors.find(v=>v.id===invoice.vendor_id);
  if(linked)return linked.display_name;
  const claim=extractionFor(workspace,invoice.id)?.normalized_output?.vendor;
  return claim&&typeof claim==='object'&&'name' in claim&&typeof claim.name==='string'?claim.name:'Unresolved vendor';
}
export function poNumber(workspace:Workspace,invoice:InvoiceRow){
  const matched=latestValidation(workspace,invoice.id)?.result?.purchaseOrder?.poNumber;
  const linked=workspace.purchaseOrders.find(p=>p.id===invoice.po_id)?.po_number;
  const extracted=extractionFor(workspace,invoice.id)?.normalized_output?.poNumber;
  return matched??linked??(typeof extracted==='string'?extracted:null);
}
export const money=(value:string|number|null|undefined,currency='INR')=>value===null||value===undefined?'—':new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value));
export const day=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value)):'—';
export const shortDate=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short'}).format(new Date(value)):'—';
export const percent=(value:string|number|null|undefined)=>value===null||value===undefined?'—':`${(Number(value)*100).toFixed(1)}%`;
export function invoiceDisplayStatus(workspace:Workspace,invoice:InvoiceRow){
  if(invoice.decision==='AUTO_APPROVED'||invoice.decision==='HUMAN_APPROVED'||invoice.status==='APPROVED')return 'APPROVED';
  if(invoice.decision==='AUTO_REJECTED'||invoice.decision==='HUMAN_REJECTED'||invoice.status==='REJECTED')return 'REJECTED';
  if(invoice.status==='NEEDS_REVIEW'||workspace.reviews.some(r=>r.invoice_id===invoice.id&&r.status==='OPEN'))return 'NEEDS REVIEW';
  const validation=latestValidation(workspace,invoice.id);
  if(validation?.status==='FAIL'||validation?.status==='INCOMPLETE')return 'VALIDATION ISSUE';
  if(validation?.status==='PASS')return 'VALIDATED';
  if(invoice.status==='FAILED')return 'FAILED';
  if(invoice.current_extraction_id)return 'EXTRACTED';
  return invoice.status;
}
