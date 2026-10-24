import type {GmailClient} from './gmail-client';
import {decodeBase64Url} from './message-parser';
import {EmailError} from './errors';
import {maxAttachmentBytes} from './security';
import type {EmailAttachment} from './types';
export async function downloadAttachment(client:GmailClient,attachment:EmailAttachment){if(attachment.sizeBytes>maxAttachmentBytes())throw new EmailError('ATTACHMENT_TOO_LARGE','Attachment exceeds size limit');let data=attachment.data;if(!data&&!attachment.attachmentId.startsWith('inline-')){try{data=(await client.getAttachment(attachment.messageId,attachment.attachmentId)).data}catch(error){if(error instanceof EmailError)throw error;throw new EmailError('ATTACHMENT_DOWNLOAD_FAILED','Could not download Gmail attachment',true)}}if(!data)throw new EmailError('ATTACHMENT_DOWNLOAD_FAILED','Attachment has no data');const bytes=decodeBase64Url(data);if(bytes.length>maxAttachmentBytes())throw new EmailError('ATTACHMENT_TOO_LARGE','Attachment exceeds size limit');return bytes}
