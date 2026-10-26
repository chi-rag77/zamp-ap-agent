export interface GmailPart {partId?:string;mimeType?:string;filename?:string;headers?:{name:string;value:string}[];body?:{attachmentId?:string;size?:number;data?:string};parts?:GmailPart[]}
export interface GmailMessage {id:string;threadId?:string;historyId?:string;internalDate?:string;labelIds?:string[];payload?:GmailPart}
export interface EmailAttachment {attachmentId:string;messageId:string;filename:string;mimeType:string;sizeBytes:number;contentId?:string;inline:boolean;data?:string;storagePath?:string;sha256?:string}
export interface EmailMessage {provider:'GMAIL'|'DEMO';messageId:string;threadId?:string;historyId?:string;from:string;to:string[];cc:string[];subject?:string;bodyText?:string;bodyHtml?:string;receivedAt:string;internalDate?:string;labels:string[];attachments:EmailAttachment[]}
export type Classification='INVOICE'|'POSSIBLE_INVOICE'|'NON_INVOICE'|'UNSUPPORTED';
export interface ClassificationResult {classification:Classification;confidence:number;reasons:string[];attachmentCount:number}
export interface EmailIntakeResult {emailIntakeId:string;status:'PROCESSED'|'IGNORED'|'NEEDS_REVIEW'|'FAILED';messageId:string;attachmentsProcessed:number;invoicesCreated:number;duplicateAttachments:number;unsupportedAttachments:number;agentRunsTriggered:number;errors:string[]}
export interface GmailHistory {historyId?:string;nextPageToken?:string;history?:{id:string;messagesAdded?:{message:{id:string}}[];labelsAdded?:{message:{id:string};labelIds:string[]}[]}[]}
