import {EmailError} from './errors';
let cached:{token:string;expires:number}|undefined;
export function gmailConfigured(){return Boolean(process.env.GMAIL_CLIENT_ID&&process.env.GMAIL_CLIENT_SECRET&&process.env.GMAIL_REFRESH_TOKEN&&gmailMailbox())}
export function gmailMailbox(){return process.env.GMAIL_INVOICE_MAILBOX??process.env.INVOICE_EMAIL_ADDRESS??''}
export async function gmailAccessToken():Promise<string>{if(cached&&cached.expires>Date.now()+60_000)return cached.token;
 const {GMAIL_CLIENT_ID:client_id,GMAIL_CLIENT_SECRET:client_secret,GMAIL_REFRESH_TOKEN:refresh_token}=process.env;
 if(!client_id||!client_secret||!refresh_token)throw new EmailError('EMAIL_AUTH_FAILED','Gmail OAuth credentials are not configured');
 let response:Response;try{response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)})}catch{throw new EmailError('EMAIL_PROVIDER_UNAVAILABLE','Gmail OAuth token endpoint unavailable',true)}
 if(!response.ok)throw new EmailError('EMAIL_AUTH_FAILED',`Gmail OAuth refresh failed (${response.status})`);
 const data=await response.json() as {access_token?:string;expires_in?:number};if(!data.access_token)throw new EmailError('EMAIL_AUTH_FAILED','Gmail OAuth returned no access token');
 cached={token:data.access_token,expires:Date.now()+(data.expires_in??3600)*1000};return cached.token}
