import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {createServerClient} from '@zamp/database';
import {approvalEmailTokenHash,sendApprovalEmailLinks} from '../../../../../lib/approval-email';
export const runtime='nodejs';export const dynamic='force-dynamic';
const tokenSchema=z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const headers={'Cache-Control':'no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
function fail(message:string,status=400){return NextResponse.json({error:message},{status,headers})}

export async function GET(_request:NextRequest,{params}:{params:Promise<{token:string}>}){
 try{
  const {token}=await params;if(!tokenSchema.safeParse(token).success)return fail('This email approval link is invalid or expired.',404);
  const db=createServerClient(),tokenHash=approvalEmailTokenHash(token);
  const {data:link,error}=await db.from('approval_email_tokens').select('id,organization_id,request_id,step_id,approver_user_id,action,expires_at,consumed_at').eq('token_hash',tokenHash).maybeSingle();
  if(error)throw error;if(!link||link.consumed_at||Date.parse(link.expires_at)<=Date.now())return fail('This email approval link has expired or has already been used.',410);
  const [request,step]=await Promise.all([
   db.from('approval_requests').select('id,invoice_id,status,current_step,requested_at,due_at,rule_name,invoice_updated_at').eq('organization_id',link.organization_id).eq('id',link.request_id).maybeSingle(),
   db.from('approval_steps').select('id,step_number,status,approver_user_id').eq('organization_id',link.organization_id).eq('id',link.step_id).maybeSingle(),
  ]);
  if(request.error||step.error)throw request.error??step.error;
  if(!request.data||request.data.status!=='PENDING'||request.data.current_step!==step.data?.step_number||step.data?.status!=='PENDING'||step.data.approver_user_id!==link.approver_user_id)return fail('This approval step is no longer active. Ask your team to send a new link.',410);
  const invoice=await db.from('invoices').select('id,invoice_number,total,currency,vendor_id,status,updated_at').eq('organization_id',link.organization_id).eq('id',request.data.invoice_id).maybeSingle();
  if(invoice.error)throw invoice.error;if(!invoice.data||invoice.data.status!=='PENDING_APPROVAL')return fail('This invoice is no longer awaiting approval.',410);
  if(!request.data.invoice_updated_at||new Date(request.data.invoice_updated_at).getTime()!==new Date(invoice.data.updated_at).getTime())return fail('The invoice changed after this link was sent. Sign in to Zamp to review the latest invoice.',409);
  const vendorResult=invoice.data.vendor_id?await db.from('vendors').select('display_name,legal_name').eq('organization_id',link.organization_id).eq('id',invoice.data.vendor_id).maybeSingle():null;
  if(vendorResult?.error)throw vendorResult.error;
  const amount=new Intl.NumberFormat('en-IN',{style:'currency',currency:invoice.data.currency||'INR'}).format(Number(invoice.data.total)||0);
  return NextResponse.json({action:link.action,expiresAt:link.expires_at,invoice:{number:invoice.data.invoice_number||'Invoice',vendor:vendorResult?.data?.display_name||vendorResult?.data?.legal_name||'Vendor',amount,currency:invoice.data.currency||'INR'},rule:request.data.rule_name},{headers});
 }catch(error){console.error('Email approval link could not be loaded',error);return fail('This approval link could not be verified. Try again or sign in to Zamp.',503)}
}

const bodySchema=z.object({decision:z.enum(['APPROVE','REJECT']),reason:z.string().trim().max(2000).default('')}).strict();
export async function POST(request:NextRequest,{params}:{params:Promise<{token:string}>}){
 try{
  if(request.headers.get('origin')!==request.nextUrl.origin)return fail('Request origin is not allowed.',403);
  const {token}=await params;if(!tokenSchema.safeParse(token).success)return fail('This email approval link is invalid or expired.',404);
  const input=bodySchema.parse(await request.json());
  const db=createServerClient(),tokenHash=approvalEmailTokenHash(token);
  const {data:before,error:beforeError}=await db.from('approval_email_tokens').select('organization_id,request_id,step_id').eq('token_hash',tokenHash).maybeSingle();
  if(beforeError)throw beforeError;if(!before)return fail('This email approval link is invalid or expired.',410);
  const prior=await db.from('approval_requests').select('current_step').eq('organization_id',before.organization_id).eq('id',before.request_id).maybeSingle();
  if(prior.error)throw prior.error;
  const {data,error}=await db.rpc('decide_invoice_approval_from_email',{p_token_hash:tokenHash,p_decision:input.decision,p_reason:input.reason});
  if(error){const raw=error.message;const known:[string,string,number][]=[['EMAIL_LINK_INVALID_OR_EXPIRED','This email approval link has expired or has already been used.',410],['EMAIL_LINK_NO_LONGER_CURRENT','This approval step is no longer active. Ask your team to send a new link.',410],['APPROVAL_NOT_PENDING','This invoice has already been decided.',409],['APPROVER_NOT_ACTIVE','Your organization access has changed. Sign in to Zamp for help.',403],['NOT_ASSIGNED_APPROVER','This email link is not assigned to you.',403],['NOT_AUTHORIZED','Your approval authority is no longer active.',403],['APPROVER_NOT_ELIGIBLE','Your approval authority no longer covers this invoice.',403],['SELF_APPROVAL_FORBIDDEN','You cannot approve an invoice you submitted.',403],['STALE_INVOICE','The invoice changed after this email was sent. Review it in Zamp before deciding.',409],['REASON_REQUIRED','Add a short reason of at least 3 characters to reject this invoice.',400]];
   const match=known.find(([code])=>raw.includes(code));return fail(match?.[1]??'The approval decision could not be recorded. Please sign in to Zamp and review the invoice.',match?.[2]??409)
  }
  const result=data as {requestId?:string;status?:string;step?:number};
  if(result.requestId&&result.status==='PENDING'&&typeof result.step==='number'&&result.step!==prior.data?.current_step){
   await sendApprovalEmailLinks(db,before.organization_id,result.requestId);
  }
  return NextResponse.json({result},{headers});
 }catch(error){if(error instanceof z.ZodError)return fail(error.issues.map(issue=>issue.message).join('; '),400);console.error('Email approval decision failed',error);return fail('The approval decision could not be recorded. Please try again.',503)}
}
