import {hasTrustedOrigin} from '../../../../../../lib/request-origin';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {objectContext,WorkspaceError} from '../../../../../../lib/objects';
import {requirePermission} from '../../../../../../lib/access-control';
import {sendApprovalEmailLinks} from '../../../../../../lib/approval-email';
export const runtime='nodejs';export const dynamic='force-dynamic';
const bodySchema=z.object({decision:z.enum(['APPROVE','REJECT','REQUEST_CORRECTION']),reason:z.string().trim().max(2000).default(''),expectedInvoiceUpdatedAt:z.iso.datetime({offset:true})}).strict();
export async function POST(request:NextRequest,{params}:{params:Promise<{requestId:string}>}){
 try{
  if(!hasTrustedOrigin(request))throw new WorkspaceError('Request origin is not allowed.',403);
  const c=await objectContext();const {requestId}=await params;z.string().uuid().parse(requestId);const input=bodySchema.parse(await request.json());
  await requirePermission(c,input.decision==='APPROVE'?'invoices.approve':'invoices.reject');
  const current=await c.db.from('approval_requests').select('current_step').eq('organization_id',c.organizationId).eq('id',requestId).maybeSingle();if(current.error)throw current.error;
  const {data,error}=await c.db.rpc('decide_invoice_approval',{p_org:c.organizationId,p_request:requestId,p_actor:c.userId,p_decision:input.decision,p_reason:input.reason,p_expected_invoice_updated_at:input.expectedInvoiceUpdatedAt});
  if(error){const raw=error.message;const known:[string,string,number][]=[['STALE_INVOICE','This invoice changed after the approval was opened. Reload it before deciding.',409],['APPROVAL_NOT_PENDING','This approval has already been completed or cancelled.',409],['NOT_ASSIGNED_APPROVER','This approval is not assigned to you.',403],['NOT_AUTHORIZED','Your role cannot make this decision.',403],['APPROVER_NOT_ELIGIBLE','Your approval authority does not cover this invoice.',403],['SELF_APPROVAL_FORBIDDEN','You cannot approve an invoice you submitted.',403],['REASON_REQUIRED','Add a short reason for this decision.',400],['INVOICE_NOT_FOUND','Invoice not found in this organization.',404]];
   const match=known.find(([code])=>raw.includes(code));throw new WorkspaceError(match?.[1]??'The approval decision could not be recorded. Reload and retry.',match?.[2]??409)
  }
  const result=data as {status?:string;step?:number};
  if(result.status==='PENDING'&&typeof result.step==='number'&&result.step!==current.data?.current_step)await sendApprovalEmailLinks(c.db,c.organizationId,requestId);
  return NextResponse.json({result},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(issue=>issue.message).join('; ')},{status:400});const status=typeof error==='object'&&error&&'status'in error?Number(error.status):500;return NextResponse.json({error:status<500&&error instanceof Error?error.message:'Approval decision could not be recorded.'},{status:status>=400&&status<600?status:500,headers:{'Cache-Control':'no-store'}})}
}
