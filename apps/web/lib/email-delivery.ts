import 'server-only';
import {gmailMailbox,GmailClient} from '@zamp/email';

type EmailInput={to:string;subject:string;text:string;html?:string};

/** Send app notifications from the explicitly configured invoice Gmail account. */
export async function sendWorkspaceEmail(input:EmailInput):Promise<boolean>{
 const from=gmailMailbox();
 if(!from||!process.env.GMAIL_CLIENT_ID||!process.env.GMAIL_CLIENT_SECRET)throw new Error('Gmail sender is not configured');
 try{
  await new GmailClient().sendMessage({...input,from:`Zamp AP <${from}>`});
  return true;
 }catch(error){
  console.warn('Gmail notification delivery failed',{status:'delivery',message:error instanceof Error?error.message:'unknown'});
  throw error;
 }
}
