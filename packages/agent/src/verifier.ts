import {createServerClient} from '@zamp/database';
import type {AgentContext} from './types';
import {AgentError} from './errors';
export async function verifyInvoiceState(context:AgentContext,expected:'APPROVED'|'REJECTED'|'NEEDS_REVIEW'){
 const db=createServerClient();const {data,error}=await db.from('invoices').select('status,decision').eq('id',context.invoiceId).single();
 if(error||!data||data.status!==expected)throw new AgentError('ACTION_VERIFICATION_FAILED',error?.message??`Expected ${expected}; actual ${data?.status??'missing'}`);
 if(expected!=='NEEDS_REVIEW'){const key=`${expected==='APPROVED'?'approve':'reject'}:${context.invoiceId}:${context.runId}`;const {data:action,error:actionError}=await db.from('agent_actions').update({status:'VERIFIED',verified_at:new Date().toISOString()}).eq('idempotency_key',key).eq('status','EXECUTED').select('id').maybeSingle();if(actionError||!action)throw new AgentError('ACTION_VERIFICATION_FAILED',actionError?.message??'Action record missing')}
 return {status:'VERIFIED' as const,actual:data.status};
}
