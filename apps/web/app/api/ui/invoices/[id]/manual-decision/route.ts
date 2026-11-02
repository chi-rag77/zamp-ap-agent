import {NextRequest, NextResponse} from 'next/server';
import {z} from 'zod';
import {objectContext, objectRecord, WorkspaceError} from '../../../../../../lib/objects';
import {requirePermission} from '../../../../../../lib/access-control';
import {hasTrustedOrigin} from '../../../../../../lib/request-origin';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const bodySchema=z.object({
  decision:z.enum(['APPROVE','REJECT']),
  reason:z.string().trim().max(500).optional().default(''),
  expectedUpdatedAt:z.string().datetime({offset:true}),
}).strict();

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    if(!hasTrustedOrigin(request))throw new WorkspaceError('Request origin is not allowed.',403);
    const {id:invoiceId}=await params;
    if(!z.string().uuid().safeParse(invoiceId).success)throw new WorkspaceError('Invalid invoice ID.',400);
    const input=bodySchema.parse(await request.json());
    if(input.decision==='REJECT'&&input.reason.length<3)throw new WorkspaceError('Add a short reason before rejecting this invoice.',400);
    const c=await objectContext();
    await requirePermission(c,input.decision==='APPROVE'?'invoices.approve':'invoices.reject');
    const invoice=await objectRecord(c,'invoice',invoiceId);
    const result=await c.db.rpc('decide_validation_invoice_manually',{
      p_org:c.organizationId,p_invoice:invoiceId,p_actor:c.userId,
      p_decision:input.decision,p_reason:input.reason||null,p_expected_updated_at:input.expectedUpdatedAt,
    });
    if(result.error){
      const message=result.error.message;
      if(message.includes('STALE_INVOICE'))throw new WorkspaceError('This invoice changed in another session. Reload and try again.',409);
      if(message.includes('INVOICE_NOT_IN_HUMAN_REVIEW'))throw new WorkspaceError('Only invoices awaiting human review can be decided here.',409);
      if(message.includes('ROUTED_APPROVAL_PENDING'))throw new WorkspaceError('This invoice is already in an approval workflow. Use its assigned approval action.',409);
      if(message.includes('INVOICE_NOT_FOUND'))throw new WorkspaceError('Invoice not found in this organization.',404);
      throw new WorkspaceError('The invoice decision could not be saved. Please retry.',503);
    }
    return NextResponse.json({decision:result.data,invoice:{id:invoice.id,number:invoice.invoice_number}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:error.issues.map(issue=>issue.message).join('; ')},{status:400});
    const status=typeof error==='object'&&error&&'status'in error?Number(error.status):500;
    return NextResponse.json({error:status<500&&error instanceof Error?error.message:'The invoice decision could not be completed.'},{status:status>=400&&status<600?status:500});
  }
}
