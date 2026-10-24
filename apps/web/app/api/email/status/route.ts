import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../../lib/tenant-database';
import {gmailConfigured,gmailMailbox} from '@zamp/email';
import {emailAdmin} from '../../../../lib/email-api';
export const runtime='nodejs';
export async function GET(request:NextRequest){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});const db=await createWebServerClient(),mailbox=gmailMailbox();const [sync,watch,intakes,failures,configured]=await Promise.all([db.from('email_sync_state').select('*').eq('mailbox',mailbox).maybeSingle(),db.from('gmail_watches').select('status,expiration_at,last_renewed_at').eq('mailbox',mailbox).maybeSingle(),db.from('email_intakes').select('*',{count:'exact',head:true}),db.from('email_intakes').select('*',{count:'exact',head:true}).in('status',['FAILED','NEEDS_REVIEW']),gmailConfigured()]);return NextResponse.json({configured,mailbox:mailbox||null,sync:sync.data,watch:watch.data,counts:{emails:intakes.count??0,exceptions:failures.count??0}})}
