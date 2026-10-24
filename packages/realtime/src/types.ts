export type ProcessingStatus='PENDING'|'RUNNING'|'COMPLETED'|'FAILED';
export type ProcessingEventType=
  |'EMAIL_RECEIVED'|'ATTACHMENT_DISCOVERED'|'ATTACHMENT_DOWNLOADED'|'DOCUMENT_STORED'|'INVOICE_CREATED'
  |'RUN_QUEUED'|'RUN_STARTED'|'RUN_UPDATED'|'RUN_COMPLETED'|'RUN_FAILED'|'RUN_RETRYING'
  |'EXTRACTION_STARTED'|'EXTRACTION_COMPLETED'|'EXTRACTION_FAILED'
  |'VENDOR_RESOLUTION_STARTED'|'VENDOR_RESOLVED'|'VENDOR_RESOLUTION_FAILED'
  |'PO_RESOLUTION_STARTED'|'PO_RESOLVED'|'PO_RESOLUTION_FAILED'
  |'LINE_MATCHING_STARTED'|'LINE_MATCHING_COMPLETED'|'LINE_MATCHING_FAILED'
  |'VALIDATION_STARTED'|'VALIDATION_COMPLETED'|'VALIDATION_FAILED'
  |'POLICY_EVALUATION_STARTED'|'POLICY_EVALUATED'|'POLICY_EVALUATION_FAILED'
  |'DECISION_GENERATED'|'REVIEW_REQUIRED'|'ACTION_STARTED'|'ACTION_COMPLETED'|'ACTION_FAILED'
  |'ACTION_VERIFICATION_STARTED'|'ACTION_VERIFIED'|'ACTION_VERIFICATION_FAILED'
  |'HUMAN_REVIEW_STARTED'|'HUMAN_APPROVED'|'HUMAN_REJECTED'|'HUMAN_OVERRIDE'
  |'STEP_STARTED'|'STEP_COMPLETED'|'STEP_FAILED'|'INVOICE_UPDATED'|'REVIEW_UPDATED';
export type EventChannel=`invoice:${string}`|`run:${string}`|'agent:activity'|'dashboard:metrics';
export interface ProcessingEvent{
  id:string;
  sequence:string;
  type:ProcessingEventType;
  invoiceId:string;
  runId:string|null;
  stepName:string|null;
  status:ProcessingStatus;
  message:string;
  timestamp:string;
  metadata:Record<string,unknown>;
}
export interface ProcessingEventInput extends Omit<ProcessingEvent,'id'|'sequence'|'timestamp'>{timestamp?:string}
export type ConnectionState='CONNECTING'|'CONNECTED'|'DISCONNECTED'|'RECONNECTING'|'ERROR';
export interface RealtimeProvider{
  publish(event:ProcessingEventInput):Promise<void>;
  subscribe(channel:EventChannel,handler:(event:ProcessingEvent)=>void,onState?:(state:ConnectionState)=>void):()=>void;
}
