import 'server-only';
import {gmailMailbox,GmailClient} from '@zamp/email';

type EmailInput={to:string;subject:string;text:string;html?:string};

/** Send app notifications from the explicitly configured invoice Gmail account. */
export async function sendWorkspaceEmail(input:EmailInput):Promise<{id:string;threadId:string}>{
 const from=gmailMailbox();
 if(!from||!process.env.GMAIL_CLIENT_ID||!process.env.GMAIL_CLIENT_SECRET)throw new Error('Gmail sender is not configured');
 try{
  const client=new GmailClient();
  const profile=await client.getProfile();
  if(profile.emailAddress.trim().toLowerCase()!==from.trim().toLowerCase())throw new Error('Connected Gmail account does not match the configured sender mailbox');
  return await client.sendMessage({...input,from:`Zamp AP <${from}>`});
 }catch(error){
  console.warn('Gmail notification delivery failed',{status:'delivery',message:error instanceof Error?error.message:'unknown'});
  throw error;
 }
}
