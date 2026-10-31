import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../../lib/tenant-database';
import {gmailConfigured,gmailMailbox} from '@zamp/email';
import {emailAdmin} from '../../../../lib/email-api';
export const runtime='nodejs';
export async function GET(request:NextRequest){
 if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});
 const db=await createWebServerClient(),mailbox=gmailMailbox();
 try{
  const [sync,watch,configured,total,exceptions]=await Promise.all([
   db.from('email_sync_state').select('last_successful_sync_at,status,last_error').eq('mailbox',mailbox).maybeSingle(),
   db.from('gmail_watches').select('status,expiration_at,last_renewed_at').eq('mailbox',mailbox).maybeSingle(),
   gmailConfigured(),
   db.from('email_intakes').select('id',{count:'exact',head:true}).contains('to_addresses',[mailbox]),
   db.from('email_intakes').select('id',{count:'exact',head:true}).contains('to_addresses',[mailbox]).in('status',['FAILED','NEEDS_REVIEW']),
  ]);
  const queryError=sync.error??watch.error??total.error??exceptions.error;
  if(queryError)throw new Error(queryError.message);
  return NextResponse.json({configured,mailbox:mailbox||null,sync:sync.data,watch:watch.data,counts:{emails:total.count??0,exceptions:exceptions.count??0}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not read mailbox status'},{status:500})}
}
