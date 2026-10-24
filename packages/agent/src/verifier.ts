import {createServerClient} from '@zamp/database';
import type {AgentContext} from './types';
import {AgentError} from './errors';
export async function verifyInvoiceState(context:AgentContext,expected:'APPROVED'|'REJECTED'|'NEEDS_REVIEW'){
 const db=createServerClient();const {data,error}=await db.from('invoices').select('status,decision').eq('id',context.invoiceId).single();
 if(error||!data||data.status!==expected)throw new AgentError('ACTION_VERIFICATION_FAILED',error?.message??`Expected ${expected}; actual ${data?.status??'missing'}`);
 const key=`${expected==='APPROVED'?'approve':expected==='REJECTED'?'reject':'create_review'}:${context.invoiceId}:${context.runId}`;
 if(expected==='NEEDS_REVIEW'){
  const {data:review,error:reviewError}=await db.from('review_cases').select('id,status').eq('agent_run_id',context.runId).eq('invoice_id',context.invoiceId).eq('status','OPEN').maybeSingle();
  if(reviewError||!review)throw new AgentError('ACTION_VERIFICATION_FAILED',reviewError?.message??'Open human review case is missing');
  context.reviewCase=review;
 }
 const {data:action,error:actionError}=await db.from('agent_actions').select('id,status').eq('idempotency_key',key).eq('status','VERIFIED').maybeSingle();
 if(actionError||!action)throw new AgentError('ACTION_VERIFICATION_FAILED',actionError?.message??'Verified action record is missing');
 return {status:'VERIFIED' as const,actual:data.status};
}
