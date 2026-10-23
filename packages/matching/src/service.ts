import {createMatchingRepository,createServerClient} from '@zamp/database';
import {evaluateInvoice,MATCHING_ENGINE_VERSION} from './engine';
import {resolvePO,resolveVendor} from './resolve';
import type {MatchingRepository} from './types';
const log=(event:string,invoiceId:string,runId:string,started:number,extra:Record<string,unknown>={})=>console.info(JSON.stringify({event,invoiceId,runId,engineVersion:MATCHING_ENGINE_VERSION,durationMs:Date.now()-started,...extra}));
export async function validateInvoice(invoiceId:string,repository:MatchingRepository=createMatchingRepository(createServerClient())){
  const started=Date.now();
  const runId=await repository.startRun(invoiceId,MATCHING_ENGINE_VERSION);
  log('validation_started',invoiceId,runId,started);
  try{
    const base=await repository.loadBase(invoiceId);
    if(!base)throw new Error('INVOICE_NOT_FOUND: Invoice record was not found');
    const vendor=resolveVendor(base.vendorClaim,base.invoice.vendorId,base.vendors);
    log('vendor_resolved',invoiceId,runId,started,{status:vendor.status});
    const po=resolvePO(base.poNumber,base.invoice.poId,base.invoice,vendor,base.purchaseOrders);
    log('po_resolved',invoiceId,runId,started,{status:po.status});
    const related=await repository.loadRelated(invoiceId,vendor.vendorId??null,po.poId??null);
    log('related_data_loaded',invoiceId,runId,started,{poLines:related.poLines.length,receipts:related.receiptLines.length,priorInvoices:related.previousInvoices.length});
    const result=evaluateInvoice({...base,...related});
    result.runId=runId;
    await repository.finishRun(runId,result);
    log('validation_completed',invoiceId,runId,started,{status:result.status,blockers:result.blockers});
    return result;
  }catch(error){
    const message=error instanceof Error?error.message:'Unknown matching error';
    const code=/^[A-Z_]+:/.exec(message)?.[0].slice(0,-1)??'VALIDATION_ERROR';
    try{await repository.failRun(runId,invoiceId,code,message)}catch(persistError){throw new AggregateError([error,persistError],'Validation failed and the failure could not be persisted')}
    log('validation_failed',invoiceId,runId,started,{code});
    throw error;
  }
}
