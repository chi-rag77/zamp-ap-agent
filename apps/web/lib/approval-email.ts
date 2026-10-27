import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';

const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]??char));
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');

/** Sends short-lived, one-time, action-bound approval links to the currently assigned approvers. */
export async function sendApprovalEmailLinks(db:SupabaseClient,organizationId:string,requestId:string){
 const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM_EMAIL,baseUrl=process.env.NEXT_PUBLIC_APP_URL;
 if(!apiKey||!from||!baseUrl)return {sent:0,reason:'Email delivery is not configured.'};
 let base:URL;try{base=new URL(baseUrl)}catch{return {sent:0,reason:'The app URL is not valid.'}}
 if(base.protocol!=='https:'&&base.hostname!=='localhost')return {sent:0,reason:'The app URL must use HTTPS.'};
 const {data:request,error:requestError}=await db.from('approval_requests').select('id,invoice_id,current_step,status,due_at,organization_id,invoice_updated_at').eq('organization_id',organizationId).eq('id',requestId).maybeSingle();
 if(requestError||!request||request.status!=='PENDING')return {sent:0,reason:'Approval is no longer pending.'};
 const [invoice,steps]=await Promise.all([
  db.from('invoices').select('invoice_number,total,currency,vendor_id,updated_at').eq('organization_id',organizationId).eq('id',request.invoice_id).maybeSingle(),
  db.from('approval_steps').select('id,approver_user_id,authority_limit').eq('organization_id',organizationId).eq('request_id',requestId).eq('step_number',request.current_step).eq('status','PENDING').not('approver_user_id','is',null),
 ]);
 if(invoice.error||steps.error||!invoice.data)return {sent:0,reason:'Approval details could not be loaded.'};
 if(!request.invoice_updated_at||new Date(request.invoice_updated_at).getTime()!==new Date(invoice.data.updated_at).getTime())return {sent:0,reason:'Invoice changed after approval was requested.'};
 const invoiceRow=invoice.data;
 const userIds=[...new Set((steps.data??[]).map(step=>step.approver_user_id).filter((id):id is string=>!!id))];
 if(!userIds.length)return {sent:0,reason:'No individual approver is assigned to the active step.'};
 const members=await db.from('organization_memberships').select('workos_user_id,email,first_name,status').eq('organization_id',organizationId).eq('status','ACTIVE').in('workos_user_id',userIds);
 if(members.error)return {sent:0,reason:'Assigned approver details could not be loaded.'};
 const expiresAt=new Date(Math.min(Date.now()+48*60*60*1000,request.due_at?Date.parse(request.due_at):Infinity)).toISOString();
 let sent=0;
 await Promise.all((steps.data??[]).map(async step=>{
  const member=members.data?.find(item=>item.workos_user_id===step.approver_user_id);
  if(!member?.email)return;
  const links:{action:'APPROVE'|'REJECT';url:string}[]=[];
  for(const action of ['APPROVE','REJECT'] as const){
   const token=randomBytes(32).toString('base64url');
   const inserted=await db.from('approval_email_tokens').insert({organization_id:organizationId,request_id:requestId,step_id:step.id,approver_user_id:member.workos_user_id,token_hash:hash(token),action,expires_at:expiresAt});
   if(inserted.error)continue;
   const link=new URL(`/approvals/email/${encodeURIComponent(token)}`,base);
   links.push({action,url:link.toString()});
  }
  if(links.length!==2)return;
  const invoiceNo=invoiceRow.invoice_number||'Invoice';
  const amount=new Intl.NumberFormat('en-IN',{style:'currency',currency:invoiceRow.currency||'INR'}).format(Number(invoiceRow.total)||0);
  const vendor=invoiceRow.vendor_id?await db.from('vendors').select('display_name,legal_name').eq('organization_id',organizationId).eq('id',invoiceRow.vendor_id).maybeSingle():{data:null,error:null};
  const vendorName=vendor.data?.display_name||vendor.data?.legal_name||'Vendor details unavailable';
  const safeNo=esc(invoiceNo),safeVendor=esc(vendorName),safeAmount=esc(amount);
  const approve=links.find(link=>link.action==='APPROVE')!,reject=links.find(link=>link.action==='REJECT')!;
  try{
   const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`approval-${requestId}-${step.id}-${Date.now()}`},body:JSON.stringify({from,to:[member.email],subject:`Approval needed: ${invoiceNo}`,html:`<div style="margin:0;background:#f3f5f8;padding:32px 16px;font-family:Arial,sans-serif;color:#172338"><div style="max-width:560px;margin:auto"><div style="padding:0 4px 16px;font-size:18px;font-weight:700">Zamp <span style="font-size:10px;letter-spacing:2px;color:#71829a">AP WORKSPACE</span></div><div style="border:1px solid #dce4ee;border-radius:12px;background:#fff;padding:24px"><p style="margin:0 0 8px;color:#64748b;font-size:13px">Hi ${esc(member.first_name?.trim()||'there')},</p><h1 style="margin:0 0 12px;font-size:20px">An invoice needs your decision</h1><p style="margin:0;color:#52647d;font-size:14px;line-height:1.7"><strong>${safeNo}</strong><br>${safeVendor}<br>${safeAmount}</p><p style="margin:18px 0 12px;color:#52647d;font-size:13px">Choose an action. The link opens a review page and asks you to confirm; opening the email alone never records a decision.</p><a href="${esc(approve.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:11px 16px;border-radius:8px;background:#16834a;color:#fff;font-size:13px;font-weight:600;text-decoration:none">Approve invoice</a><a href="${esc(reject.url)}" style="display:inline-block;margin:0 0 8px;padding:11px 16px;border-radius:8px;background:#fff;border:1px solid #d6deea;color:#34445a;font-size:13px;font-weight:600;text-decoration:none">Reject invoice</a><p style="margin:14px 0 0;color:#718096;font-size:12px">Links expire in 48 hours or when this approval step changes. Each link can be used once.</p></div></div></div>`,text:`Hi ${member.first_name?.trim()||'there'},\n\nAn invoice needs your decision.\n${invoiceNo} · ${vendorName} · ${amount}\n\nApprove: ${approve.url}\nReject: ${reject.url}\n\nBoth links open a confirmation page. They expire in 48 hours and can be used once.`})});
   if(response.ok)sent++;
   else console.warn('Resend approval email delivery failed',{status:response.status});
  }catch{console.warn('Resend approval email delivery failed',{status:'network'});}
 }));
 return {sent,reason:sent?'':'Approval email could not be delivered.'};
}

export function approvalEmailTokenHash(token:string){return hash(token)}
