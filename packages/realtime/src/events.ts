import type {ProcessingEventType} from './types';
import type {ProcessingEvent} from './types';

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

const eventCopy:Partial<Record<ProcessingEventType,{title:string;description:string}>>={
  EMAIL_RECEIVED:{title:'Invoice email received',description:'A new message entered the finance inbox.'},
  ATTACHMENT_DISCOVERED:{title:'Invoice attachment found',description:'The attached document is ready to process.'},
  ATTACHMENT_DOWNLOADED:{title:'Document downloaded',description:'The invoice file was retrieved from the email.'},
  DOCUMENT_STORED:{title:'Document stored securely',description:'The original file is available in the invoice record.'},
  INVOICE_CREATED:{title:'Invoice record created',description:'The document was added to the invoice workspace.'},
  RUN_QUEUED:{title:'Processing queued',description:'The invoice is waiting for the agent to start.'},
  RUN_STARTED:{title:'Invoice processing started',description:'The agent began reviewing the invoice.'},
  RUN_RETRYING:{title:'Processing will retry',description:'A temporary issue occurred; the agent will try again.'},
  RUN_FAILED:{title:'Invoice processing stopped',description:'The agent could not complete this invoice safely.'},
  RUN_UPDATED:{title:'Invoice processing updated',description:'The agent recorded a new processing status.'},
  EXTRACTION_STARTED:{title:'Reading invoice details',description:'The agent is extracting supplier, dates, totals, and line items.'},
  EXTRACTION_COMPLETED:{title:'Invoice details extracted',description:'Key fields and line items were read from the document.'},
  EXTRACTION_FAILED:{title:'Could not read invoice details',description:'The document needs a clearer file or human review.'},
  VENDOR_RESOLUTION_STARTED:{title:'Checking supplier',description:'The supplier is being matched to the vendor records.'},
  VENDOR_RESOLVED:{title:'Supplier matched',description:'A supplier record was found for this invoice.'},
  VENDOR_RESOLUTION_FAILED:{title:'Supplier needs review',description:'The supplier could not be matched with confidence.'},
  PO_RESOLUTION_STARTED:{title:'Finding purchase order',description:'The invoice reference is being checked against available purchase orders.'},
  PO_RESOLVED:{title:'Purchase order matched',description:'A matching purchase order was found.'},
  PO_RESOLUTION_FAILED:{title:'Purchase order needs review',description:'No eligible purchase order could be matched.'},
  LINE_MATCHING_STARTED:{title:'Comparing line items',description:'Invoice quantities and prices are being compared with the purchase order.'},
  LINE_MATCHING_COMPLETED:{title:'Line-item comparison complete',description:'The invoice lines were checked against the purchase order.'},
  LINE_MATCHING_FAILED:{title:'Line items need review',description:'One or more invoice lines did not match the purchase order.'},
  VALIDATION_STARTED:{title:'Validating invoice totals',description:'Subtotal, tax, and total are being checked for consistency.'},
  VALIDATION_COMPLETED:{title:'Invoice checks complete',description:'Required invoice fields and totals were validated.'},
  VALIDATION_FAILED:{title:'Invoice checks need review',description:'One or more required fields or totals need attention.'},
  POLICY_EVALUATION_STARTED:{title:'Checking approval policy',description:'The invoice is being evaluated against workspace rules.'},
  POLICY_EVALUATED:{title:'Approval policy evaluated',description:'The configured approval rules were checked.'},
  POLICY_EVALUATION_FAILED:{title:'Policy check needs review',description:'The approval policy could not be evaluated safely.'},
  REVIEW_REQUIRED:{title:'Human review required',description:'The invoice needs a person to resolve an exception.'},
  ACTION_STARTED:{title:'Applying invoice decision',description:'The approved decision is being applied.'},
  ACTION_COMPLETED:{title:'Decision applied',description:'The invoice action completed successfully.'},
  ACTION_FAILED:{title:'Could not apply decision',description:'The invoice action failed and needs attention.'},
  ACTION_VERIFICATION_STARTED:{title:'Verifying invoice status',description:'The agent is confirming the final invoice state.'},
  ACTION_VERIFIED:{title:'Invoice status verified',description:'The saved invoice status matches the decision.'},
  ACTION_VERIFICATION_FAILED:{title:'Invoice status could not be verified',description:'The final state needs a person to confirm it.'},
  HUMAN_REVIEW_STARTED:{title:'Human review started',description:'A reviewer opened this invoice for a decision.'},
  HUMAN_APPROVED:{title:'Invoice approved by reviewer',description:'A person approved this invoice.'},
  HUMAN_REJECTED:{title:'Invoice rejected by reviewer',description:'A person rejected this invoice.'},
  HUMAN_OVERRIDE:{title:'Decision updated by reviewer',description:'A reviewer changed the automated recommendation.'},
  STEP_STARTED:{title:'Processing step started',description:'The agent began a processing step.'},
  STEP_COMPLETED:{title:'Processing step completed',description:'The agent completed a processing step.'},
  STEP_FAILED:{title:'Processing step needs attention',description:'The agent could not complete a processing step.'},
  INVOICE_UPDATED:{title:'Invoice details updated',description:'The invoice record was changed.'},
  REVIEW_UPDATED:{title:'Review status updated',description:'The review case has a new status.'},
};

const decisionText:Record<string,string>={AUTO_APPROVED:'The invoice passed the configured checks and was approved automatically.',AUTO_REJECTED:'The invoice failed a blocking rule and was rejected automatically.',NEEDS_REVIEW:'The invoice needs a person to resolve an exception.',CANNOT_DECIDE:'The agent could not reach a safe decision; human review is required.'};
const errorText:Record<string,string>={PO_NOT_FOUND:'No matching purchase order was found.',VENDOR_NOT_FOUND:'No matching supplier was found.',VENDOR_MISMATCH:'The invoice supplier does not match the purchase order supplier.',PRICE_VARIANCE_EXCEEDED:'The invoice price is outside the allowed tolerance.',CONFIRMED_DUPLICATE:'This invoice matches a previously processed invoice.',PO_BILLING_QUANTITY_EXCEEDED:'The invoice quantity exceeds the remaining purchase-order quantity.',LOW_EXTRACTION_CONFIDENCE:'Some invoice details could not be read with enough confidence.'};

/** Render persisted processing events as readable status updates instead of raw step names or payloads. */
export function processingEventCopy(event:Pick<ProcessingEvent,'type'|'message'|'stepName'|'metadata'>):{title:string;description:string}{
  if(event.type==='DECISION_GENERATED'||event.type==='RUN_COMPLETED'){
    const decision=typeof event.metadata.decision==='string'?event.metadata.decision:'';
    return {title:decision==='AUTO_APPROVED'?'Invoice approved automatically':decision==='AUTO_REJECTED'?'Invoice rejected automatically':decision==='NEEDS_REVIEW'?'Human review required':'Processing complete',description:decisionText[decision]??event.message};
  }
  const raw=event.message.trim();
  const technical=/^(?:COMPLETED|FAILED|STARTED)\s+step\s+\d+$/i.test(raw)||raw==='{}';
  if(technical&&event.stepName&&['STEP_STARTED','STEP_COMPLETED','STEP_FAILED'].includes(event.type)){
    const step=event.stepName.replaceAll(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').trim();
    const title=step.replace(/\b\w/g,char=>char.toUpperCase());
    return {title,description:event.type==='STEP_FAILED'?'This step needs attention.':event.type==='STEP_STARTED'?'The agent started this step.':'The agent completed this step.'};
  }
  const known=eventCopy[event.type];
  if(known){
    const code=typeof event.metadata.errorCode==='string'?event.metadata.errorCode:'';
    const technical=/^(?:COMPLETED|FAILED|STARTED)\s+step\s+\d+$/i.test(event.message.trim())||event.message.trim()==='{}';
    return {title:known.title,description:errorText[code]??(event.type==='RUN_FAILED'&&event.message&&!technical?event.message:known.description)};
  }
  if(technical){
    const step=(event.stepName??'').replaceAll(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').trim();
    return {title:step?`${step.charAt(0).toUpperCase()}${step.slice(1)}`:'Invoice processing update',description:event.type==='STEP_FAILED'?'This step needs attention.':'The invoice processing step was recorded.'};
  }
  return {title:event.type.replaceAll('_',' ').toLowerCase().replace(/\b\w/g,char=>char.toUpperCase()),description:raw||'Invoice processing status was updated.'};
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
