import {gmailAccessToken} from './gmail-auth';
import {EmailError} from './errors';
import {withRetry} from './retry';
import type {GmailHistory,GmailMessage} from './types';
export class GmailClient {
 constructor(private base='https://gmail.googleapis.com/gmail/v1/users/me'){}
 private async request<T>(path:string,init?:RequestInit):Promise<T>{return withRetry(async()=>{const token=await gmailAccessToken();let response:Response;try{response=await fetch(`${this.base}${path}`,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...init?.headers},signal:AbortSignal.timeout(20000)})}catch{throw new EmailError('EMAIL_PROVIDER_UNAVAILABLE','Gmail request timed out',true)}
 if(response.status===404)throw new EmailError('EMAIL_MESSAGE_NOT_FOUND','Gmail resource or history cursor not found');
 if(response.status===401||response.status===403)throw new EmailError('EMAIL_AUTH_FAILED',`Gmail authorization failed (${response.status})`);
 if(!response.ok)throw new EmailError('EMAIL_PROVIDER_UNAVAILABLE',`Gmail API failed (${response.status})`,[429,500,502,503,504].includes(response.status));
 return response.json() as Promise<T>})}
 getProfile(){return this.request<{emailAddress:string;historyId:string}>('/profile')}
 getMessage(id:string){return this.request<GmailMessage>(`/messages/${encodeURIComponent(id)}?format=full`)}
 listMessages(query='has:attachment',pageToken?:string,maxResults=100){const qs=new URLSearchParams({q:query,maxResults:String(maxResults)});if(pageToken)qs.set('pageToken',pageToken);return this.request<{messages?:{id:string}[];nextPageToken?:string}>(`/messages?${qs}`)}
 getAttachment(messageId:string,attachmentId:string){return this.request<{size:number;data:string}>(`/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`)}
 listHistory(startHistoryId:string,pageToken?:string){const qs=new URLSearchParams({startHistoryId});qs.append('historyTypes','messageAdded');qs.append('historyTypes','labelAdded');if(pageToken)qs.set('pageToken',pageToken);return this.request<GmailHistory>(`/history?${qs}`)}
 watchMailbox(topicName:string){return this.request<{historyId:string;expiration:string}>('/watch',{method:'POST',body:JSON.stringify({topicName,labelIds:['INBOX'],labelFilterBehavior:'INCLUDE'})})}
}
