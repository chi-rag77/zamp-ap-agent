import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {objectContext,WorkspaceError} from '../../../../../../lib/objects';
import {requirePermission} from '../../../../../../lib/access-control';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.object({expectedInvoiceUpdatedAt:z.iso.datetime({offset:true})}).strict();
export async function POST(request:NextRequest,{params}:{params:Promise<{requestId:string}>}){
 try{
  if(request.headers.get('origin')!==request.nextUrl.origin)throw new WorkspaceError('Request origin is not allowed.',403);
  const c=await objectContext();await requirePermission(c,'invoices.edit');
  const {requestId}=await params;z.string().uuid().parse(requestId);const input=schema.parse(await request.json());
  const {data,error}=await c.db.rpc('cancel_invoice_approval_request',{p_org:c.organizationId,p_request:requestId,p_actor:c.userId,p_expected_invoice_updated_at:input.expectedInvoiceUpdatedAt});
  if(error){const raw=error.message;const known:[string,string,number][]=[['STALE_INVOICE','This invoice changed after the approval was opened. Reload it before cancelling.',409],['APPROVAL_NOT_PENDING','This approval is already completed or cancelled.',409],['NOT_AUTHORIZED','Your role cannot cancel this approval request.',403],['INVOICE_NOT_FOUND','Invoice not found in this organization.',404]];const match=known.find(([code])=>raw.includes(code));throw new WorkspaceError(match?.[1]??'The approval request could not be cancelled.',match?.[2]??409)}
  return NextResponse.json({result:data},{headers:{'Cache-Control':'no-store'}});
 }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(issue=>issue.message).join('; ')},{status:400});const status=typeof error==='object'&&error&&'status'in error?Number(error.status):500;return NextResponse.json({error:status<500&&error instanceof Error?error.message:'Approval request could not be cancelled.'},{status:status>=400&&status<600?status:500,headers:{'Cache-Control':'no-store'}})}
}
