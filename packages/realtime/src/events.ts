import type {ProcessingEventType} from './types';

export const ProcessingEventTypes=[
  'EMAIL_RECEIVED','ATTACHMENT_DISCOVERED','ATTACHMENT_DOWNLOADED','DOCUMENT_STORED','INVOICE_CREATED',
  'RUN_QUEUED','RUN_STARTED','RUN_UPDATED','RUN_COMPLETED','RUN_FAILED','RUN_RETRYING',
  'EXTRACTION_STARTED','EXTRACTION_COMPLETED','EXTRACTION_FAILED','VENDOR_RESOLUTION_STARTED','VENDOR_RESOLVED','VENDOR_RESOLUTION_FAILED',
  'PO_RESOLUTION_STARTED','PO_RESOLVED','PO_RESOLUTION_FAILED','LINE_MATCHING_STARTED','LINE_MATCHING_COMPLETED','LINE_MATCHING_FAILED',
  'VALIDATION_STARTED','VALIDATION_COMPLETED','VALIDATION_FAILED','POLICY_EVALUATION_STARTED','POLICY_EVALUATED','POLICY_EVALUATION_FAILED',
  'DECISION_GENERATED','REVIEW_REQUIRED','ACTION_STARTED','ACTION_COMPLETED','ACTION_FAILED','ACTION_VERIFICATION_STARTED','ACTION_VERIFIED',
  'ACTION_VERIFICATION_FAILED','HUMAN_REVIEW_STARTED','HUMAN_APPROVED','HUMAN_REJECTED','HUMAN_OVERRIDE','STEP_STARTED','STEP_COMPLETED',
  'STEP_FAILED','INVOICE_UPDATED','REVIEW_UPDATED'
] as const satisfies readonly ProcessingEventType[];

export type ProcessingErrorClass='EXTRACTION_ERROR'|'VENDOR_RESOLUTION_ERROR'|'PO_RESOLUTION_ERROR'|'LINE_MATCHING_ERROR'|'VALIDATION_ERROR'|'POLICY_ERROR'|'ACTION_ERROR'|'VERIFICATION_ERROR'|'SYSTEM_ERROR';
export function classifyProcessingError(code:string|null|undefined):ProcessingErrorClass|null{
  if(!code)return null;
  const value=code.toUpperCase();
  if(value.includes('VERIFICATION'))return 'VERIFICATION_ERROR';
  if(value.includes('EXTRACTION')||value.includes('MODEL')||value.includes('VISION'))return 'EXTRACTION_ERROR';
  if(value.includes('VENDOR'))return 'VENDOR_RESOLUTION_ERROR';
  if(value.includes('PURCHASE_ORDER')||value.startsWith('PO_'))return 'PO_RESOLUTION_ERROR';
  if(value.includes('MATCH'))return 'LINE_MATCHING_ERROR';
  if(value.includes('VALIDATION'))return 'VALIDATION_ERROR';
  if(value.includes('POLICY')||value.includes('DECISION'))return 'POLICY_ERROR';
  if(value.includes('ACTION')||value.includes('APPROVAL'))return 'ACTION_ERROR';
  return 'SYSTEM_ERROR';
}
export function notificationType(event:Pick<import('./types').ProcessingEvent,'type'|'metadata'>):'NEW_INVOICE'|'REVIEW_REQUIRED'|'AUTO_APPROVED'|'AUTO_REJECTED'|'RUN_FAILED'|'ACTION_FAILED'|'VERIFICATION_FAILED'|null{
  if(event.type==='INVOICE_CREATED')return 'NEW_INVOICE';
  if(event.type==='REVIEW_REQUIRED')return 'REVIEW_REQUIRED';
  if(event.type==='RUN_FAILED')return 'RUN_FAILED';
  if(event.type==='ACTION_FAILED')return 'ACTION_FAILED';
  if(event.type==='ACTION_VERIFICATION_FAILED')return 'VERIFICATION_FAILED';
  if(event.type==='DECISION_GENERATED'||event.type==='RUN_COMPLETED'){
    if(event.metadata.decision==='AUTO_APPROVED')return 'AUTO_APPROVED';
    if(event.metadata.decision==='AUTO_REJECTED')return 'AUTO_REJECTED';
  }
  return null;
}

const safeMetadataKeys=new Set(['stepNumber','durationMs','errorCode','errorClass','decision','actionType','reasonCode','reviewStatus']);
/** Strip document, prompt, credential, and unbounded payload data before publication. */
export function safeProcessingMetadata(value:Record<string,unknown>):Record<string,string|number|boolean>{
  const safe:Record<string,string|number|boolean>={};
  for(const [key,item] of Object.entries(value)){
    if(!safeMetadataKeys.has(key))continue;
    if(typeof item==='number'&&Number.isFinite(item))safe[key]=item;
    else if(typeof item==='boolean')safe[key]=item;
    else if(typeof item==='string')safe[key]=item.slice(0,120);
  }
  return safe;
}
