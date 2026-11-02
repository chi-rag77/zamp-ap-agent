import {decideClassification} from './classification-decision';
import {CLASSIFICATION_CONFIG,detectDocumentType,extractClassificationSignals} from './classification-signals';
import type {ClassificationResult,DocumentAnalysis,EmailAttachment,EmailMessage} from './types';

const SUPPORTED_DOCUMENT=/\.(pdf|png|jpe?g)$/i;
const NON_INVOICE_FILENAME=/\b(quotation|quote|pro\s*forma|credit\s*note|credit\s*memo|debit\s*note|debit\s*memo|purchase\s*order|delivery\s*note|packing\s*list|goods\s*receipt|grn|statement\s*of\s*account|receipt)\b/i;

export function attachmentRole(attachment:EmailAttachment):'INVOICE'|'SUPPORTING_DOCUMENT'|'IGNORE'{
 const filename=attachment.filename??'';const name=filename.toLowerCase().replace(/[_-]+/g,' ');
 if(/\b(logo|signature|avatar|icon)\b/.test(name))return 'IGNORE';
 const invoiceNamed=/\b(invoice|inv(?:\s*\d+)?|bill)\b/.test(name);
 if(attachment.inline&&attachment.mimeType.toLowerCase().startsWith('image/')&&!invoiceNamed)return 'IGNORE';
 // File names are weak evidence: only obvious document-type labels classify a
 // supporting document. A free-standing "po" token is never enough.
 const startsWithPoReference=/^\s*po\s*[-#:]?\s*[a-z0-9]+/i.test(filename);
 if(startsWithPoReference||NON_INVOICE_FILENAME.test(name))return 'SUPPORTING_DOCUMENT';
 return 'INVOICE';
}

export function classifyEmail(email:EmailMessage,document?:DocumentAnalysis):ClassificationResult{
 const supportedAttachments=email.attachments.filter(attachment=>attachmentRole(attachment)==='INVOICE'&&SUPPORTED_DOCUMENT.test(attachment.filename));
 const unsupportedAttachmentCount=email.attachments.filter(attachment=>attachmentRole(attachment)==='INVOICE'&&!SUPPORTED_DOCUMENT.test(attachment.filename)).length;
 const hasInvoiceIntent=/\b(tax\s+invoice|invoice|bill(?:ing)?|inv[-\s/#]?\d{2,})\b/i.test(`${email.subject??''} ${email.bodyText??''}`)||/^\s*inv\s*$/i.test(email.subject??'');
 const {signals,documentType}=extractClassificationSignals(email,document);
 if(email.attachments.some(attachment=>attachment.inline&&attachmentRole(attachment)==='IGNORE'))signals.push({source:'MIME',signal:'Decorative inline image ignored',weight:0});
 const decision=decideClassification({signals,documentType,hasAttachments:email.attachments.length>0,supportedAttachmentCount:supportedAttachments.length,unsupportedAttachmentCount,hasInvoiceIntent});
 const reasons=signals.map(signal=>`${signal.source}: ${signal.signal} (${signal.weight>=0?'+':''}${signal.weight})`);
 if(email.attachments.length===0)reasons.push('No attachments were provided');
 if(unsupportedAttachmentCount>0)reasons.push(`${unsupportedAttachmentCount} invoice candidate attachment(s) use an unsupported file type`);
 if(decision.classification==='REVIEW_REQUIRED')reasons.push('Conflicting or insufficient evidence; route to human review');
 if(decision.classification==='UNSUPPORTED')reasons.push('Invoice intent was detected but no supported document was attached');
 if(decision.classification==='NON_INVOICE')reasons.push('Evidence does not indicate an invoice');
 return {classification:decision.classification,confidence:decision.confidence,score:decision.score,documentType,signals,reasons,attachmentCount:email.attachments.length};
}

export function classifyDocumentContent(document:DocumentAnalysis){
 const documentType=document.text?detectDocumentType(document.text):document.documentType??'UNKNOWN';
 const hasMinimumInvoiceEvidence=Boolean(document.invoiceNumber&&document.totalAmount!=null);
 const confidence=document.confidence??(documentType==='UNKNOWN'?0.4:hasMinimumInvoiceEvidence?0.9:0.65);
 const classification=documentType==='INVOICE'&&hasMinimumInvoiceEvidence&&confidence>=CLASSIFICATION_CONFIG.thresholds.contentAutoInvoiceConfidence?'INVOICE':documentType==='UNKNOWN'?'REVIEW_REQUIRED':documentType==='INVOICE'?'REVIEW_REQUIRED':'NON_INVOICE';
 return {documentType,classification,confidence,reasons:[documentType==='UNKNOWN'?'Document content does not identify a known financial document type':`Document content indicates ${documentType.toLowerCase().replaceAll('_',' ')}`,...(hasMinimumInvoiceEvidence?['Invoice identifier and total found in extracted document data']:[]),...(confidence<CLASSIFICATION_CONFIG.thresholds.contentAutoInvoiceConfidence?['Content confidence is below the configured safe-routing threshold']:[])]};
}
