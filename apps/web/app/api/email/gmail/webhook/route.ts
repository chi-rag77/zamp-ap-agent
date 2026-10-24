import {after,NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {gmailMailbox,syncGmailMailbox,verifyPubSubJwt,EmailError} from '@zamp/email';
import {dispatchAgentWorker} from '../../../../../lib/agent-worker';
import {dispatchEmailSyncContinuation} from '../../../../../lib/email-sync-dispatch';

export const runtime='nodejs';
export const maxDuration=300;

export async function POST(request:NextRequest){
 try{
  const token=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!token)return NextResponse.json({error:'Missing Pub/Sub authentication'},{status:401});
  await verifyPubSubJwt(token);
  const body=await request.json() as {message?:{data?:string}};
  if(!body.message?.data)return NextResponse.json({error:'Missing notification data'},{status:400});
  const notification=JSON.parse(Buffer.from(body.message.data,'base64').toString()) as {emailAddress?:string;historyId?:string};
  const mailbox=gmailMailbox();
  if(!mailbox||notification.emailAddress?.toLowerCase()!==mailbox.toLowerCase()||!/^\d+$/.test(notification.historyId??''))return NextResponse.json({error:'Invalid mailbox notification'},{status:400});
  const db=createServerClient();
  const {data,error}=await db.from('email_sync_jobs').upsert({mailbox,history_id:notification.historyId,status:'QUEUED'},{onConflict:'mailbox,history_id',ignoreDuplicates:true}).select('id').maybeSingle();
  if(error)throw error;
  after(async()=>{
   try{
    const result=await syncGmailMailbox();
    if(result.hasMore){
     if(data)await db.from('email_sync_jobs').update({status:'RUNNING'}).eq('id',data.id);
     await dispatchEmailSyncContinuation(request.nextUrl.origin,data?.id);
    }else{
     if(data)await db.from('email_sync_jobs').update({status:'COMPLETED',completed_at:new Date().toISOString()}).eq('id',data.id);
     await dispatchAgentWorker(request.nextUrl.origin);
    }
   }catch(failure){
    if(data)await db.from('email_sync_jobs').update({status:'FAILED',last_error:failure instanceof Error?failure.message:'Sync failed'}).eq('id',data.id);
   }
  });
  return NextResponse.json({accepted:true},{status:202});
 }catch(error){
  return NextResponse.json({error:error instanceof Error?error.message:'Webhook failed'},{status:error instanceof EmailError&&error.code==='EMAIL_AUTH_FAILED'?401:503});
 }
}
