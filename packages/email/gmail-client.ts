import {gmailAccessToken} from './gmail-auth';
import {EmailError} from './errors';
import {withRetry} from './retry';
import type {GmailHistory,GmailMessage} from './types';
export class GmailClient {
 constructor(private base='https://gmail.googleapis.com/gmail/v1/users/me'){}
 private async request<T>(path:string,init?:RequestInit,retry=true):Promise<T>{const attempt=async()=>{const token=await gmailAccessToken();let response:Response;try{response=await fetch(`${this.base}${path}`,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...init?.headers},signal:AbortSignal.timeout(20000)})}catch{throw new EmailError('EMAIL_PROVIDER_UNAVAILABLE','Gmail request timed out',true)}
 if(response.status===404)throw new EmailError('EMAIL_MESSAGE_NOT_FOUND','Gmail resource or history cursor not found');
 if(response.status===401||response.status===403)throw new EmailError('EMAIL_AUTH_FAILED',`Gmail authorization failed (${response.status})`);
 if(!response.ok)throw new EmailError('EMAIL_PROVIDER_UNAVAILABLE',`Gmail API failed (${response.status})`,[429,500,502,503,504].includes(response.status));
 return response.json() as Promise<T>};return retry?withRetry(attempt):attempt()}
 getProfile(){return this.request<{emailAddress:string;historyId:string}>('/profile')}
 getMessage(id:string){return this.request<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`)}
 getMessageMetadata(id:string){return this.request<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=metadata`)}
 listMessages(query='has:attachment',pageToken?:string,maxResults=100){const qs=new URLSearchParams({q:query,maxResults:String(maxResults)});if(pageToken)qs.set('pageToken',pageToken);return this.request<{messages?:{id:string}[];nextPageToken?:string}>(`/messages?${qs}`)}
 getAttachment(messageId:string,attachmentId:string){return this.request<{size:number;data:string}>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)}
 listHistory(startHistoryId:string,pageToken?:string,maxResults=100){const qs=new URLSearchParams({startHistoryId,maxResults:String(Math.max(1,Math.min(500,maxResults)))});qs.append('historyTypes','messageAdded');qs.append('historyTypes','labelAdded');if(pageToken)qs.set('pageToken',pageToken);return this.request<GmailHistory>(`/history?${qs}`)}
 watchMailbox(topicName:string){return this.request<{historyId:string;expiration:string}>('/watch',{method:'POST',body:JSON.stringify({topicName,labelIds:['INBOX'],labelFilterBehavior:'INCLUDE'})})}
 sendMessage(input:{to:string;subject:string;text:string;html?:string;from?:string}){
  const clean=(value:string)=>value.replace(/[\r\n]+/g,' ').trim();
  const base64Lines=(value:string)=>Buffer.from(value,'utf8').toString('base64').replace(/.{1,76}/g,'$&\r\n');
  const headers=[`To: ${clean(input.to)}`,`From: ${clean(input.from??'')}`,`Subject: ${clean(input.subject)}`,'MIME-Version: 1.0'];
  let mime:string;
  if(input.html){
   const boundary=`zamp_${crypto.randomUUID().replaceAll('-','')}`;
   headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
   mime=[...headers,'',`--${boundary}`,'Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64','',base64Lines(input.text),`--${boundary}`,'Content-Type: text/html; charset="UTF-8"','Content-Transfer-Encoding: base64','',base64Lines(input.html),`--${boundary}--`,''].join('\r\n');
  }else{
   headers.push('Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: base64');
   mime=[...headers,'',base64Lines(input.text),''].join('\r\n');
  }
  const raw=Buffer.from(mime,'utf8').toString('base64url');
  // Do not automatically retry a send: a timed-out Gmail send can already have
  // been accepted, and retrying would risk delivering a duplicate notification.
  return this.request<{id:string;threadId:string}>('/messages/send',{method:'POST',body:JSON.stringify({raw})},false);
 }
}
