import 'server-only';
import type {SupabaseClient} from '@supabase/supabase-js';

type SendInput={db:SupabaseClient;organizationId:string;actorId:string;recipientIds:string[];objectType:string;objectId:string;eventId:string;title:string;message:string};
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]??char));

/** Email collaboration action notifications when a verified Resend sender is configured.
 * Delivery is best-effort: a mail outage must never roll back a saved comment or assignment.
 */
export async function sendWorkspaceActionEmails(input:SendInput){
 try{
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.RESEND_FROM_EMAIL;
  const baseUrl=process.env.NEXT_PUBLIC_APP_URL;
  if(!apiKey||!from||!baseUrl)return;
  const recipientIds=[...new Set(input.recipientIds.filter(id=>id&&id!==input.actorId))].slice(0,20);
  if(!recipientIds.length)return;
  const members=await input.db.from('organization_memberships').select('workos_user_id,email,first_name')
    .eq('organization_id',input.organizationId).eq('status','ACTIVE').in('workos_user_id',recipientIds);
  if(members.error||!members.data?.length)return;
  const safeBase=baseUrl.replace(/\/$/,'');
  const href=`${safeBase}/objects/${encodeURIComponent(input.objectType)}/${encodeURIComponent(input.objectId)}`;
  const title=escapeHtml(input.title),message=escapeHtml(input.message),safeHref=escapeHtml(href);
  await Promise.all(members.data.filter(member=>member.email).map(async member=>{
    const greeting=escapeHtml(member.first_name?.trim()||'there');
    try{
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',signal:AbortSignal.timeout(3000),
        headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`zamp-${input.eventId}-${member.workos_user_id}`},
        body:JSON.stringify({from,to:[member.email],subject:input.title,html:`<div style="margin:0;background:#f3f5f8;padding:32px 16px;font-family:Arial,sans-serif;color:#172338"><div style="max-width:560px;margin:auto"><div style="padding:0 4px 16px;font-size:18px;font-weight:700;color:#1c2c47">Zamp <span style="font-size:10px;font-weight:600;letter-spacing:2px;color:#71829a">AP WORKSPACE</span></div><div style="border:1px solid #dce4ee;border-radius:12px;background:#fff;padding:24px"><p style="margin:0 0 8px;color:#64748b;font-size:13px">Hi ${greeting},</p><h1 style="margin:0 0 12px;font-size:20px;line-height:1.35">${title}</h1><p style="margin:0;color:#52647d;font-size:14px;line-height:1.6">${message}</p><a href="${safeHref}" style="display:inline-block;margin-top:20px;padding:11px 16px;border-radius:8px;background:#3169e8;color:#fff;font-size:13px;font-weight:600;text-decoration:none">Open in Zamp</a></div><p style="margin:14px 4px 0;color:#8794a6;font-size:11px">Automated workspace update. Sign in to review the record and take action.</p></div></div>`,text:`Hi ${member.first_name?.trim()||'there'},\n\n${input.title}\n\n${input.message}\n\nOpen in Zamp: ${href}\n\nAutomated workspace update.`}),
      });
      if(!response.ok)console.warn('Resend workspace notification delivery failed',{status:response.status});
    }catch{console.warn('Resend workspace notification delivery failed',{status:'network'});}
  }));
 }catch{console.warn('Workspace email notifications could not be delivered',{status:'delivery'});}
}
