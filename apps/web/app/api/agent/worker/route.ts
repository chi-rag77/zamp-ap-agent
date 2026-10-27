import {after,NextRequest,NextResponse} from 'next/server';
import {processNextAgentJob} from '@zamp/agent';
import {dispatchAgentWorker} from '../../../../lib/agent-worker';
import {isAgentWorkerAuthorized} from '../../../../lib/agent-worker-auth';
import {createServerClient} from '@zamp/database';
import {sendApprovalEmailLinks} from '../../../../lib/approval-email';
import {sendWorkspaceEmail} from '../../../../lib/email-delivery';
export const runtime='nodejs';export const maxDuration=120;
const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]??char));
async function sendAutoApprovalNotice(runId:string){
 const to=process.env.GMAIL_INVOICE_MAILBOX,baseUrl=process.env.NEXT_PUBLIC_APP_URL;
 if(!to){console.warn('Auto-approval email skipped: Gmail mailbox is not configured');return}
 const db=createServerClient();
 const {data:run,error}=await db.from('agent_runs').select('organization_id,invoice_id,final_decision').eq('id',runId).maybeSingle();
 if(error||!run?.invoice_id||run.final_decision!=='AUTO_APPROVED')return;
 const {data:invoice,error:invoiceError}=await db.from('invoices').select('invoice_number,total,currency,status,source_email_intake_id').eq('id',run.invoice_id).maybeSingle();
 if(invoiceError||!invoice||invoice.status!=='APPROVED')return;
 let supplier='your supplier';
 if(invoice.source_email_intake_id){const intake=await db.from('email_intakes').select('from_address').eq('id',invoice.source_email_intake_id).maybeSingle();if(intake.data?.from_address)supplier=intake.data.from_address}
 const safeNumber=escapeHtml(invoice.invoice_number||'Invoice'),safeSupplier=escapeHtml(supplier),amount=new Intl.NumberFormat('en-IN',{style:'currency',currency:invoice.currency||'INR'}).format(Number(invoice.total)||0);
 const href=baseUrl?`${baseUrl.replace(/\/$/,'')}/invoices/${encodeURIComponent(run.invoice_id)}`:'';
 const html=`<div style="margin:0;background:#f3f5f8;padding:32px 16px;font-family:Arial,sans-serif;color:#172338"><div style="max-width:600px;margin:auto"><div style="padding:0 4px 16px;font-size:18px;font-weight:700;color:#1c2c47">Zamp <span style="font-size:10px;font-weight:600;letter-spacing:2px;color:#71829a">AP WORKSPACE</span></div><div style="border:1px solid #dce4ee;border-radius:12px;background:#fff;padding:24px"><p style="margin:0 0 8px;color:#14804a;font-size:12px;font-weight:700;letter-spacing:1px">INVOICE AUTO-APPROVED</p><h1 style="margin:0 0 12px;font-size:20px;line-height:1.35">Your invoice has been processed</h1><p style="margin:0;color:#52647d;font-size:14px;line-height:1.65">${safeSupplier} submitted invoice <b>${safeNumber}</b> (${escapeHtml(amount)}). Zamp processed it on your behalf and approved it because the configured policies and purchase order checks passed.</p>${href?`<a href="${escapeHtml(href)}" style="display:inline-block;margin-top:20px;padding:11px 16px;border-radius:8px;background:#3169e8;color:#fff;font-size:13px;font-weight:600;text-decoration:none">View invoice</a>`:''}</div><p style="margin:14px 4px 0;color:#8794a6;font-size:11px">Automated update from your Zamp AP workspace.</p></div></div>`;
 await sendWorkspaceEmail({to,subject:`Invoice ${invoice.invoice_number||''} was auto-approved`,html,text:`${supplier} submitted invoice ${invoice.invoice_number||'Invoice'} (${amount}). Zamp processed it on your behalf and approved it because configured policies and purchase order checks passed.${href?`\n\nView invoice: ${href}`:''}`});
}
async function work(request:NextRequest){if(!isAgentWorkerAuthorized(request.headers.get('authorization')))return NextResponse.json({error:'Unauthorized'},{status:401});try{const result=await processNextAgentJob();if(result.claimed&&result.status==='WAITING'&&result.step==='EVALUATE_POLICY'&&result.runId){try{const db=createServerClient();const run=await db.from('agent_runs').select('organization_id,invoice_id').eq('id',result.runId).maybeSingle();if(run.data?.organization_id&&run.data.invoice_id){const pending=await db.from('approval_requests').select('id').eq('organization_id',run.data.organization_id).eq('invoice_id',run.data.invoice_id).eq('status','PENDING').order('requested_at',{ascending:false}).limit(1).maybeSingle();if(pending.data)await sendApprovalEmailLinks(db,run.data.organization_id,pending.data.id)}}catch(error){console.warn('Approval email notification could not be sent',{status:'delivery',message:error instanceof Error?error.message:'unknown'})}}if(result.claimed&&result.status==='COMPLETED'&&result.step==='VERIFY_ACTION'&&result.runId){try{await sendAutoApprovalNotice(result.runId)}catch(error){console.warn('Auto-approval email notification could not be sent',{status:'delivery',message:error instanceof Error?error.message:'unknown'})}}if(result.claimed)after(async()=>{await dispatchAgentWorker(request.nextUrl.origin);if('retryable' in result&&result.retryable&&result.retryAfterSeconds){await new Promise(resolve=>setTimeout(resolve,result.retryAfterSeconds!*1000));await dispatchAgentWorker(request.nextUrl.origin)}});return NextResponse.json(result,{status:200})}catch(error){console.error('Agent worker failed',error);return NextResponse.json({error:error instanceof Error?error.message:'Worker failed'},{status:500})}}
export const POST=work;
export const GET=work;
