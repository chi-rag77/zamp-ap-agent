import {hasTrustedOrigin} from '../../../../lib/request-origin';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {approvalRules,evaluateApprovalRules,type ApprovalInput} from '../../../../../../packages/approval/index';
import {objectContext,WorkspaceError} from '../../../../lib/objects';
import {requirePermission,rolePermissions} from '../../../../lib/access-control';
import {sendApprovalEmailLinks} from '../../../../lib/approval-email';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const idSchema=z.string().uuid();
function responseError(error:unknown){const status=typeof error==='object'&&error&&'status'in error?Number(error.status):500;return NextResponse.json({error:status<500&&error instanceof Error?error.message:'Approval requests could not be loaded.'},{status:status>=400&&status<600?status:500,headers:{'Cache-Control':'no-store'}})}

export async function GET(){
 try{
  const c=await objectContext();await requirePermission(c,'approvals.view');
  const permissions=await rolePermissions(c);
  const [requests,membership]=await Promise.all([
   c.db.from('approval_requests').select('id,invoice_id,configuration_version,rule_id,rule_name,status,current_step,requested_at,due_at,requested_by,evidence,invoice_updated_at').eq('organization_id',c.organizationId).in('status',['PENDING','APPROVED','REJECTED','SENT_BACK']).order('requested_at',{ascending:false}).limit(250),
   c.db.from('organization_memberships').select('role').eq('organization_id',c.organizationId).eq('workos_user_id',c.userId).eq('status','ACTIVE').single()
  ]);
  if(requests.error||membership.error)throw new WorkspaceError('Approval work could not be loaded.',503);
  const rows=requests.data??[];const requestIds=rows.map(row=>row.id);const invoiceIds=[...new Set(rows.map(row=>row.invoice_id))];
  const [steps,invoices]=await Promise.all([
   requestIds.length?c.db.from('approval_steps').select('request_id,step_number,approver_user_id,approver_role,approval_mode,authority_limit,status,decision,comment,completed_at,started_at').eq('organization_id',c.organizationId).in('request_id',requestIds):Promise.resolve({data:[],error:null}),
   invoiceIds.length?c.db.from('invoices').select('id,invoice_number,vendor_id,total,currency,status,updated_at').eq('organization_id',c.organizationId).in('id',invoiceIds):Promise.resolve({data:[],error:null})
  ]);
  if(steps.error||invoices.error)throw new WorkspaceError('Approval detail could not be loaded.',503);
  const visible=(steps.data??[]).filter(step=>step.approver_user_id===c.userId||step.approver_role===membership.data.role);
  const visibleRequestIds=new Set(visible.map(step=>step.request_id));
  const items=rows.filter(row=>visibleRequestIds.has(row.id)).map(row=>({
   ...row,invoice:(invoices.data??[]).find(invoice=>invoice.id===row.invoice_id)??null,
   steps:(steps.data??[]).filter(step=>step.request_id===row.id),
   canDecide:permissions.includes('invoices.approve')||permissions.includes('invoices.reject'),
   currentAssignment:visible.filter(step=>step.request_id===row.id&&step.step_number===row.current_step)
  }));
  return NextResponse.json({items,userId:c.userId,role:membership.data.role},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return responseError(error)}
}

const startSchema=z.object({invoiceId:idSchema}).strict();
export async function POST(request:NextRequest){
 try{
  if(!hasTrustedOrigin(request))throw new WorkspaceError('Request origin is not allowed.',403);
  const c=await objectContext();await requirePermission(c,'invoices.edit');
  const {invoiceId}=startSchema.parse(await request.json());
  const invoice=await c.db.from('invoices').select('id,invoice_number,total,currency,vendor_id,po_id,status,updated_at,extraction_confidence').eq('organization_id',c.organizationId).eq('id',invoiceId).single();
  if(invoice.error||!invoice.data)throw new WorkspaceError('Invoice is not available in this organization.',404);
  const [active,validation,membership]=await Promise.all([
   c.db.from('approval_configurations').select('id,version,rules,name').eq('organization_id',c.organizationId).eq('status','ACTIVE').maybeSingle(),
   c.db.from('invoice_validation_runs').select('result').eq('organization_id',c.organizationId).eq('invoice_id',invoiceId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   c.db.from('organization_memberships').select('department').eq('organization_id',c.organizationId).eq('workos_user_id',c.userId).eq('status','ACTIVE').single()
  ]);
  if(active.error||validation.error||membership.error)throw new WorkspaceError('Approval evidence could not be loaded.',503);
  if(!active.data)throw new WorkspaceError('No active approval rules are configured.',409);
  const parsed=approvalRules.safeParse(active.data.rules);if(!parsed.success)throw new WorkspaceError('The active approval configuration is invalid.',409);
  const result=validation.data?.result as {checks?:{check:string;status:string;variancePercent?:number}[]}|undefined;
  const checks=result?.checks??[];
  const input:ApprovalInput={invoice_amount:Number(invoice.data.total??0),currency:invoice.data.currency,variance_percent:Math.max(0,...checks.filter(check=>check.check==='PRICE_MATCH').map(check=>Math.abs(Number(check.variancePercent)||0))),department:membership.data.department??'',invoice_type:'STANDARD',vendor_match:!!invoice.data.vendor_id,po_match:!!invoice.data.po_id,duplicate:checks.some(check=>check.check==='DUPLICATE'&&check.status==='FAIL'),risk_flag:invoice.data.status==='NEEDS_REVIEW'};
  const evaluation=evaluateApprovalRules(parsed.data,input);
  if(evaluation.conflict)throw new WorkspaceError('Approval rule priorities conflict. Ask an admin to fix the active configuration.',409);
  if(!evaluation.matchedRule)return NextResponse.json({status:'NO_APPROVAL_RULE',message:'No approval rule applies to this invoice.'},{headers:{'Cache-Control':'no-store'}});
  const roleRows=await c.db.from('organization_roles').select('role_key,permissions').eq('organization_id',c.organizationId);
  const candidates=await c.db.from('organization_memberships').select('workos_user_id,role,status,approval_limit,approval_currency,approval_categories').eq('organization_id',c.organizationId).eq('status','ACTIVE').neq('workos_user_id',c.userId);
  if(roleRows.error||candidates.error)throw new WorkspaceError('Eligible approvers could not be checked.',503);
  const route:Array<{stepNumber:number;approverUserId:string;approverRole:null;authorityLimit:number;currency:string;mode:string}> = [];
  let routedStep=0;
  for(const configured of evaluation.route){
   const requiredLimit=Math.max(input.invoice_amount,configured.authorityLimit);
   const eligible=(candidates.data??[]).filter(user=>{
    const role=roleRows.data?.find(item=>item.role_key===user.role);
    return role?.permissions?.includes('invoices.approve')&&user.approval_limit!==null&&Number(user.approval_limit)>=requiredLimit&&user.approval_currency===configured.currency&&user.approval_categories?.includes('INVOICES')&&(configured.approverType==='ROLE'?user.role===configured.approverRef:user.workos_user_id===configured.approverRef);
   });
   if(!eligible.length)continue;
   routedStep++;
   const usersForStep=configured.mode==='SEQUENTIAL'?eligible.slice(0,1):eligible;
   for(const person of usersForStep)route.push({stepNumber:routedStep,approverUserId:person.workos_user_id,approverRole:null,authorityLimit:requiredLimit,currency:configured.currency,mode:configured.mode});
  }
  if(!route.length)throw new WorkspaceError('No active approver has enough authority for this invoice. The invoice was not routed.',409);
  const {data,error}=await c.db.rpc('create_invoice_approval_request',{p_org:c.organizationId,p_invoice:invoiceId,p_actor:c.userId,p_configuration:active.data.id,p_rule_id:evaluation.matchedRule.ruleId,p_rule_name:evaluation.matchedRule.name,p_expected_updated_at:invoice.data.updated_at,p_evidence:{configurationName:active.data.name,configurationVersion:active.data.version,input,evaluation:evaluation.evaluations.filter(item=>item.matched)},p_route:route,p_due_at:null});
  if(error){const message=error.message;const map:Record<string,string>={STALE_INVOICE:'The invoice changed while the approval was being prepared. Reload and retry.',INVOICE_NOT_PENDING:'This invoice is not in a state that can be routed for approval.',APPROVAL_ALREADY_PENDING:'An approval is already pending for this invoice.',APPROVER_NOT_ELIGIBLE:'The configured approver no longer has active approval authority.',APPROVAL_RULE_CHANGED:'The active approval rules changed. Reload and retry.'};throw new WorkspaceError(map[Object.keys(map).find(key=>message.includes(key))??'']??'The invoice could not be routed for approval.',409)}
  const email=await sendApprovalEmailLinks(c.db,c.organizationId,String(data));
  return NextResponse.json({requestId:data,status:'PENDING_APPROVAL',rule:evaluation.matchedRule.name,approverCount:route.length,emailNotificationsSent:email.sent,emailNotificationError:email.sent?undefined:email.reason},{status:201,headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(issue=>issue.message).join('; ')},{status:400});return responseError(error)}
}
