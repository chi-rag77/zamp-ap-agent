import {createServerClient} from '@zamp/database';
import type {AgentContext} from './types';
import {AgentError} from './errors';
import {actionKey,assertActionGuard} from './action-guard';
import {reviewPriority,reviewRoute} from './decisions';
import {audit} from './run-manager';
export async function executeFinancialAction(context:AgentContext,action:'APPROVE'|'REJECT'){
 assertActionGuard(context,action);await audit(context,'ACTION_REQUESTED',`${action} requested`,{decisionId:context.decisionId});
 const {data,error}=await createServerClient().rpc('execute_agent_action',{p_run_id:context.runId,p_decision_id:context.decisionId,p_action:action,p_key:actionKey(context,action)});
 if(error)throw new AgentError(/ACTION_NOT_ALLOWED|STALE_DECISION|DUPLICATE_ACTION/.exec(error.message)?.[0]??'ACTION_EXECUTION_FAILED',error.message);
 context.actionsExecuted.push(action);
 let purchaseOrderStatus:string|undefined;
 if(action==='APPROVE'){
  const client=createServerClient();
  const invoice=await client.from('invoices').select('id,organization_id,po_id,total,currency').eq('id',context.invoiceId).maybeSingle();
  if(!invoice.error&&invoice.data?.po_id&&invoice.data.total!==null){
   const [purchaseOrder,approvedInvoices]=await Promise.all([
    client.from('purchase_orders').select('total,currency,status').eq('organization_id',invoice.data.organization_id).eq('id',invoice.data.po_id).maybeSingle(),
    client.from('invoices').select('total').eq('organization_id',invoice.data.organization_id).eq('po_id',invoice.data.po_id).eq('status','APPROVED').eq('currency',invoice.data.currency).is('archived_at',null),
   ]);
   if(!purchaseOrder.error&&!approvedInvoices.error&&purchaseOrder.data&&purchaseOrder.data.currency===invoice.data.currency){
    const billed=(approvedInvoices.data??[]).reduce((sum,row)=>sum+Number(row.total??0),0);
    if(billed>=Number(purchaseOrder.data.total)-0.01&&purchaseOrder.data.status!=='CLOSED'){
     const closed=await client.from('purchase_orders').update({status:'CLOSED',updated_at:new Date().toISOString()}).eq('organization_id',invoice.data.organization_id).eq('id',invoice.data.po_id).neq('status','CLOSED').select('status').maybeSingle();
     purchaseOrderStatus=closed.data?.status;
    }else purchaseOrderStatus=purchaseOrder.data.status;
   }
  }
 }
 return {...(data as Record<string,unknown>),...(purchaseOrderStatus?{purchaseOrderStatus}:{})};
}
export async function executeReviewAction(context:AgentContext,reasonCode:string,summary:string){
 assertActionGuard(context,'CREATE_REVIEW');await audit(context,'ACTION_REQUESTED','Review requested',{reasonCode});
 const systemFailure=context.state==='CANNOT_DECIDE'&&context.policyDecision?.decision!=='CANNOT_DECIDE';
 const {data,error}=await createServerClient().rpc('execute_agent_review',{p_run_id:context.runId,p_decision_id:systemFailure?null:context.decisionId??null,p_key:actionKey(context,'CREATE_REVIEW'),p_reason:reasonCode,p_title:reasonCode.replaceAll('_',' '),p_summary:summary,p_priority:systemFailure?'HIGH':reviewPriority(context.policyDecision??'CANNOT_DECIDE'),p_team:reviewRoute(reasonCode),p_evidence:systemFailure?[]:context.policyDecision?.evidence??[]});
 if(error)throw new AgentError(/ACTION_NOT_ALLOWED|DUPLICATE_ACTION/.exec(error.message)?.[0]??'ACTION_EXECUTION_FAILED',error.message);
 context.actionsExecuted.push('CREATE_REVIEW');context.reviewCase=data as Record<string,unknown>;return data as Record<string,unknown>;
}
