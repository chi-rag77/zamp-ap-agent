import type {ClassificationSignal,DocumentAnalysis,DocumentType,EmailMessage} from './types';

export const CLASSIFICATION_CONFIG={
 thresholds:{invoice:65,possibleInvoice:35,nonInvoice:-25,contentAutoInvoiceConfidence:0.75},
 weights:{subjectInvoice:35,subjectInvoiceNumber:25,ambiguousSubject:25,bodyInvoice:15,filenameInvoice:20,supportedFile:15,mismatchedMime:5,invoiceHeader:40,invoiceNumber:20,invoiceDate:10,vendor:10,total:15,nonInvoiceDocument:-50,knownOtherDocument:-50,lowContentConfidence:-20,weakDocumentCue:-15} as const
} as const;

const SUPPORTED_DOCUMENT=/\.(pdf|png|jpe?g)$/i;
const MIME_BY_EXTENSION:Record<string,RegExp>={pdf:/^application\/(pdf|octet-stream)$/i,png:/^image\/png$/i,jpg:/^image\/(jpeg|jpg)$/i,jpeg:/^image\/(jpeg|jpg)$/i};
const DOCUMENT_CUES:[RegExp,DocumentType][]=[
 [/\b(credit\s+note|credit\s+memo)\b/i,'CREDIT_NOTE'],[/\b(debit\s+note|debit\s+memo)\b/i,'DEBIT_NOTE'],
 [/\b(purchase\s+order|\bpo\s*(?:number|no\.?|#))\b/i,'PURCHASE_ORDER'],[/\b(quotation|quote|pro\s*forma)\b/i,'QUOTATION'],
 [/\b(delivery\s+note|goods\s+receipt|\bgrn\b)\b/i,'DELIVERY_NOTE'],[/\b(packing\s+list)\b/i,'PACKING_LIST'],[/\b(statement\s+of\s+account|account\s+statement)\b/i,'STATEMENT'],[/\b(receipt|payment\s+acknowledgement)\b/i,'RECEIPT']
];

export function detectDocumentType(text:string):DocumentType{
 const normalized=text.toLowerCase();
 for(const [pattern,type] of DOCUMENT_CUES)if(pattern.test(normalized))return type;
 if(/\b(tax\s+invoice|invoice\s*(?:number|no\.?|#|date|total|amount)|invoice\b)/i.test(text))return 'INVOICE';
 return 'UNKNOWN';
}

export function extractClassificationSignals(email:EmailMessage,document?:DocumentAnalysis){
 const signals:ClassificationSignal[]=[];
 const add=(source:ClassificationSignal['source'],signal:string,weight:number)=>signals.push({source,signal,weight});
 const subject=email.subject??'';const body=email.bodyText??'';
 if(/\b(tax\s+invoice|invoice|bill(?:ing)?)\b/i.test(subject))add('SUBJECT','Invoice term in subject',CLASSIFICATION_CONFIG.weights.subjectInvoice);
 if(/\b(inv[-\s/#]?\d{2,}|invoice\s*(?:no\.?|number)\s*[:#-]?\s*[a-z0-9-]+)/i.test(subject))add('SUBJECT','Invoice number pattern in subject',CLASSIFICATION_CONFIG.weights.subjectInvoiceNumber);
 if(/^\s*inv\s*$/i.test(subject))add('SUBJECT','Ambiguous invoice shorthand in subject',CLASSIFICATION_CONFIG.weights.ambiguousSubject);
 if(/\b(tax\s+invoice|invoice|bill(?:ing)?)\b/i.test(body))add('BODY','Invoice term in message body',CLASSIFICATION_CONFIG.weights.bodyInvoice);
 if(/\b(quotation|quote|credit\s+note|debit\s+note|purchase\s+order|delivery\s+note|packing\s+list|statement\s+of\s+account)\b/i.test(subject+' '+body))add('BODY','Message describes a non-invoice document',CLASSIFICATION_CONFIG.weights.nonInvoiceDocument);
 for(const attachment of email.attachments){
  const filename=attachment.filename||'';
  const type=detectDocumentType(filename.replace(/[_.-]+/g,' '));
  if(/\b(invoice|tax\s+invoice|inv[-_\s]?\d+|bill)\b/i.test(filename))add('FILENAME',`Invoice signal in ${filename}`,CLASSIFICATION_CONFIG.weights.filenameInvoice);
  if(type!=='UNKNOWN'&&type!=='INVOICE')add('FILENAME',`${type.replaceAll('_',' ')} signal in ${filename}`,CLASSIFICATION_CONFIG.weights.nonInvoiceDocument);
  else if(type==='UNKNOWN'&&/\b(agenda|brochure|catalog|catalogue|resume|presentation)\b/i.test(filename))add('FILENAME',`Non-financial document signal in ${filename}`,CLASSIFICATION_CONFIG.weights.knownOtherDocument);
  const extension=filename.match(/\.([^.]+)$/)?.[1]?.toLowerCase()??'';
  const mime=attachment.mimeType||'';
  if(SUPPORTED_DOCUMENT.test(filename)&&MIME_BY_EXTENSION[extension]?.test(mime))add('MIME',`Supported ${extension.toUpperCase()} file with matching MIME type`,CLASSIFICATION_CONFIG.weights.supportedFile);
  else if(SUPPORTED_DOCUMENT.test(filename))add('MIME',`Supported extension but MIME type is inconsistent for ${filename}`,CLASSIFICATION_CONFIG.weights.mismatchedMime);
 }
 if(document){
  const text=document.text??'';const type=detectDocumentType(text);
  if(type==='INVOICE')add('DOCUMENT_CONTENT','Document text identifies an invoice',CLASSIFICATION_CONFIG.weights.invoiceHeader);
  else if(type!=='UNKNOWN')add('DOCUMENT_CONTENT',`Document text identifies ${type.replaceAll('_',' ').toLowerCase()}`,CLASSIFICATION_CONFIG.weights.nonInvoiceDocument);
  if(document.invoiceNumber)add('DOCUMENT_CONTENT','Invoice number extracted from document',CLASSIFICATION_CONFIG.weights.invoiceNumber);
  if(document.invoiceDate)add('DOCUMENT_CONTENT','Invoice date extracted from document',CLASSIFICATION_CONFIG.weights.invoiceDate);
  if(document.vendorName)add('DOCUMENT_CONTENT','Vendor name extracted from document',CLASSIFICATION_CONFIG.weights.vendor);
  if(document.totalAmount!=null&&Number.isFinite(document.totalAmount))add('DOCUMENT_CONTENT','Total amount extracted from document',CLASSIFICATION_CONFIG.weights.total);
  if(document.confidence!=null&&document.confidence<0.7)add('DOCUMENT_CONTENT','Low document-analysis confidence',CLASSIFICATION_CONFIG.weights.lowContentConfidence);
 }
 return {signals,documentType:document?.text?detectDocumentType(document.text):document?.documentType??inferEmailDocumentType(email,signals)};
}

function inferEmailDocumentType(email:EmailMessage,signals:ClassificationSignal[]):DocumentType{
 for(const attachment of email.attachments){const type=detectDocumentType(attachment.filename.replace(/[_.-]+/g,' '));if(type!=='UNKNOWN')return type}
 if(signals.some(signal=>signal.source==='SUBJECT'&&signal.signal.toLowerCase().includes('invoice')))return 'INVOICE';
 return 'UNKNOWN';
}
