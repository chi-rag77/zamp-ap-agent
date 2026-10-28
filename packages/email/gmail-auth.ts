import {EmailError} from './errors';
import {createServerClient} from '@zamp/database';
let cached:{mailbox:string;token:string;expires:number}|undefined;
let cachedRefreshToken:{mailbox:string;token:string}|undefined;
export async function gmailRefreshToken():Promise<string|undefined>{
 const mailbox=gmailMailbox();
 if(!mailbox)return undefined;
 if(cachedRefreshToken?.mailbox===mailbox)return cachedRefreshToken.token;
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY){
  const {data,error}=await createServerClient().from('email_oauth_credentials').select('refresh_token').eq('mailbox',mailbox).maybeSingle();
  if(error)throw new EmailError('EMAIL_AUTH_FAILED','Gmail credentials could not be loaded from the database');
  const token=data?.refresh_token as string|undefined;
  if(token){cachedRefreshToken={mailbox,token};return token}
 }
 // A legacy environment token is safe only when its owner mailbox is explicitly
 // configured. Never let a token for another Gmail account override the connected mailbox.
 const legacyToken=process.env.GMAIL_REFRESH_TOKEN;
 const legacyMailbox=process.env.GMAIL_REFRESH_TOKEN_MAILBOX?.trim().toLowerCase();
 if(legacyToken&&legacyMailbox===mailbox.trim().toLowerCase()){
  cachedRefreshToken={mailbox,token:legacyToken};
  return legacyToken;
 }
 return undefined;
}
export async function storeGmailRefreshToken(mailbox:string,token:string,scopes:string[]){
 const {error}=await createServerClient().from('email_oauth_credentials').upsert({mailbox,provider:'GMAIL',refresh_token:token,scopes,connected_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'mailbox'});
 if(error)throw new EmailError('EMAIL_AUTH_FAILED','Gmail credentials could not be saved to the database');
 cachedRefreshToken={mailbox,token};
 cached=undefined;
}
export async function gmailConfigured(){if(!process.env.GMAIL_CLIENT_ID||!process.env.GMAIL_CLIENT_SECRET||!gmailMailbox())return false;try{return Boolean(await gmailRefreshToken())}catch{return false}}
export function gmailMailbox(){return process.env.GMAIL_INVOICE_MAILBOX??process.env.INVOICE_EMAIL_ADDRESS??''}
export async function gmailAccessToken():Promise<string>{const mailbox=gmailMailbox();if(cached?.mailbox===mailbox&&cached.expires>Date.now()+60_000)return cached.token;
 const {GMAIL_CLIENT_ID:client_id,GMAIL_CLIENT_SECRET:client_secret}=process.env;const refresh_token=await gmailRefreshToken();
 if(!client_id||!client_secret||!refresh_token)throw new EmailError('EMAIL_AUTH_FAILED','Gmail OAuth credentials are not configured');
 let response:Response;try{response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)})}catch{throw new EmailError('EMAIL_PROVIDER_UNAVAILABLE','Gmail OAuth token endpoint unavailable',true)}
 if(!response.ok)throw new EmailError('EMAIL_AUTH_FAILED',`Gmail OAuth refresh failed (${response.status})`);
 const data=await response.json() as {access_token?:string;expires_in?:number};if(!data.access_token)throw new EmailError('EMAIL_AUTH_FAILED','Gmail OAuth returned no access token');
 cached={mailbox,token:data.access_token,expires:Date.now()+(data.expires_in??3600)*1000};return cached.token}
