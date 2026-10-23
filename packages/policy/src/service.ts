import {createServerClient} from '@zamp/database';
import {evaluateInvoicePolicy,type InvoicePolicy,type PolicyDecision} from './index';
import type {InvoiceValidationResult} from '@zamp/matching';

export async function getActivePolicy():Promise<InvoicePolicy|null>{
  const db=createServerClient();const {data,error}=await db.from('policies').select('id,name,version,status,configuration,effective_from').eq('status','ACTIVE').lte('effective_from',new Date().toISOString()).limit(2);
  if(error)throw new Error(error.message);if(!data?.length||data.length!==1)return null;
  const p=data[0];return {id:p.id,name:p.name,version:p.version,status:p.status,configuration:p.configuration,effectiveFrom:p.effective_from} as InvoicePolicy;
}
export async function evaluateSavedInvoice(invoiceId:string):Promise<{id:string;decision:PolicyDecision}>{
  const db=createServerClient();
  const [validationResult,policy,invoiceResult]=await Promise.all([
    db.from('invoice_validation_runs').select('id,run_id,invoice_id,extraction_id,status,result').eq('invoice_id',invoiceId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
    getActivePolicy(),
    db.from('invoices').select('id,vendor_id,current_extraction_id,extraction_confidence,status').eq('id',invoiceId).single()
  ]);
  if(validationResult.error)throw new Error(validationResult.error.message);
  if(invoiceResult.error||!invoiceResult.data)throw new Error(invoiceResult.error?.message??'Invoice not found');
  const saved=validationResult.data;if(!saved)throw new Error('No Phase 3 validation run available');
  if(saved.status==='ERROR')throw new Error('Latest Phase 3 validation failed');
  const invoice=invoiceResult.data;
  const vendorResult=invoice.vendor_id?await db.from('vendors').select('status').eq('id',invoice.vendor_id).single():null;
  if(vendorResult?.error)throw new Error(vendorResult.error.message);
  const validation=saved.result as InvoiceValidationResult;
  if(validation.runId!==saved.run_id||validation.invoiceId!==invoiceId||validation.extractionId!==saved.extraction_id||invoice.current_extraction_id!==saved.extraction_id)throw new Error('Saved validation identity mismatch');
  if(!policy)throw new Error('No active policy available');
  const decision=evaluateInvoicePolicy(validation,policy,{extractionConfidence:invoice.extraction_confidence===null?null:Number(invoice.extraction_confidence),vendorStatus:vendorResult?.data?.status??null,alreadyProcessed:invoice.status==='APPROVED'||invoice.status==='REJECTED'});
  const {data,error}=await db.rpc('persist_policy_decision',{p_validation_run_id:saved.id,p_policy_id:policy.id,p_decision:decision});
  if(error)throw new Error(error.message);return {id:data as string,decision};
}
