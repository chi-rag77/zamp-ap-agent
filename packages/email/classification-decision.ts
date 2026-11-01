import {CLASSIFICATION_CONFIG} from './classification-signals';
import type {Classification,ClassificationSignal,DocumentType} from './types';

export function decideClassification(args:{signals:ClassificationSignal[];documentType:DocumentType;hasAttachments:boolean;supportedAttachmentCount:number;unsupportedAttachmentCount:number;hasInvoiceIntent:boolean}){
 const score=args.signals.reduce((sum,signal)=>sum+signal.weight,0);
 const contentType=args.documentType;
 const negativeContent=contentType!=='UNKNOWN'&&contentType!=='INVOICE';
 const conflictingEvidence=negativeContent&&args.hasInvoiceIntent;
 let classification:Classification;
 if(!args.hasAttachments){classification=args.hasInvoiceIntent?'REVIEW_REQUIRED':'NON_INVOICE'}
 else if(conflictingEvidence){classification='REVIEW_REQUIRED'}
 else if(args.supportedAttachmentCount===0){classification=args.hasInvoiceIntent?'UNSUPPORTED':'NON_INVOICE'}
 else if(score>=CLASSIFICATION_CONFIG.thresholds.invoice){classification='INVOICE'}
 else if(score>=CLASSIFICATION_CONFIG.thresholds.possibleInvoice){classification='POSSIBLE_INVOICE'}
 else if(score<=CLASSIFICATION_CONFIG.thresholds.nonInvoice){classification='NON_INVOICE'}
 else if(args.unsupportedAttachmentCount>0&&args.supportedAttachmentCount===0){classification='UNSUPPORTED'}
 else classification='REVIEW_REQUIRED';

 // Confidence is a bounded measure of evidence strength, never a claim that
 // the document itself has passed invoice extraction or financial validation.
 const confidence=conflictingEvidence?0.45:Math.max(0.5,Math.min(0.99,Math.abs(score)/100));
 return {classification,confidence,score,documentType:contentType};
}
