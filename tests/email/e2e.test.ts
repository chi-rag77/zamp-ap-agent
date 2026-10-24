import {describe,it,expect} from 'vitest';
import {parseMessage} from '../../packages/email/message-parser';
import {classifyEmail} from '../../packages/email/email-classifier';
import {validateAttachment} from '../../packages/email/security';
import {downloadAttachment} from '../../packages/email/attachment-downloader';
import type {GmailMessage} from '../../packages/email/types';
describe('local email processing path',()=>{it('parses, classifies, downloads, and validates a nested invoice attachment',async()=>{const bytes=Buffer.from('%PDF-1.4\n1 0 obj\n');const raw:GmailMessage={id:'fixture',payload:{mimeType:'multipart/mixed',headers:[{name:'From',value:'billing@acme.com'},{name:'Subject',value:'Invoice INV-1048'}],parts:[{partId:'1',filename:'invoice.pdf',mimeType:'application/pdf',body:{attachmentId:'a1',size:bytes.length,data:bytes.toString('base64url')}}]}};const message=parseMessage(raw);expect(classifyEmail(message).classification).toBe('INVOICE');const file=await downloadAttachment({} as never,message.attachments[0]);expect(validateAttachment(file,'application/pdf','invoice.pdf').sha256).toMatch(/^[a-f0-9]{64}$/)})});
