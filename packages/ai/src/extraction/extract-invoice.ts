import type { SupabaseClient } from '@supabase/supabase-js';
import { DocumentError, prepareDocument, type InvoiceDocumentInput } from '@zamp/document';
import type { VisionModelProvider } from '../providers/vision-model';
import { ExtractionError } from '../providers/nvidia/errors';
import { normalizeExtraction } from './normalize-extraction';
import { extractionQuality, overallConfidence, validateExtraction } from './validate-extraction';
import { PROMPT_VERSION, SCHEMA_VERSION } from '../prompts/invoice-extraction';

export async function extractInvoiceDocument(args:{db:SupabaseClient;provider:VisionModelProvider;invoiceId:string;document:InvoiceDocumentInput;hint?:string}){
  const {db,provider,invoiceId,document,hint}=args;
  const {data:invoice,error:invoiceError}=await db.from('invoices').select('id').eq('id',invoiceId).maybeSingle();
  if(invoiceError)throw invoiceError;
  if(!invoice)throw new ExtractionError('DOCUMENT_NOT_FOUND','Invoice record not found');
  const {data:runId,error:startError}=await db.rpc('start_processing_run',{p_invoice_id:invoiceId,p_agent_version:'phase02-v1',p_policy_version:null});
  if(startError)throw startError;
  let pageCount=1;
  try{
    const prepared=await prepareDocument(document);
    pageCount=prepared.pages.length;
    const result=await provider.extractInvoice({pages:prepared.pages,filename:document.filename,invoiceId,hint});
    if(result.extraction.documentType==='NOT_INVOICE')throw new ExtractionError('NOT_AN_INVOICE','Document is not an invoice',result.rawResponse);
    if(result.extraction.documentType==='UNKNOWN'&& !result.extraction.invoiceNumber && !result.extraction.vendor.name && result.extraction.total==null)
      throw new ExtractionError('NO_INVOICE_CONTENT','No reliable invoice content found',result.rawResponse);
    const normalized=normalizeExtraction(result.extraction);
    const validation=validateExtraction(normalized);
    const status=extractionQuality(normalized);
    const confidence=overallConfidence(normalized);
    const steps=[
      {number:1,type:'SYSTEM',name:'Document validated',output:{mimeType:prepared.mimeType,sizeBytes:prepared.sizeBytes},durationMs:0},
      {number:2,type:'SYSTEM',name:prepared.mimeType==='application/pdf'?'PDF rendered':'Image prepared',output:{pagesProcessed:pageCount},durationMs:0},
      {number:3,type:'AI',name:'NVIDIA extraction completed',output:{provider:result.provider,model:result.model,pagesProcessed:pageCount,lineItemsExtracted:normalized.lineItems.length,latencyMs:result.latencyMs},confidence,durationMs:result.latencyMs},
      {number:4,type:'VALIDATION',name:'Schema and normalization completed',output:{warnings:normalized.warnings},confidence,durationMs:0},
      {number:5,type:'VALIDATION',name:'Extraction quality checked',output:{status,mathChecks:validation},confidence,durationMs:0}
    ];
    const payload={provider:result.provider,model:result.model,promptVersion:PROMPT_VERSION,schemaVersion:SCHEMA_VERSION,status,rawResponse:result.rawResponse,structured:result.extraction,normalized,validation,overallConfidence:confidence,pageCount,finishReason:result.finishReason,usage:result.usage??null,latencyMs:result.latencyMs,steps};
    const {data:extractionId,error:persistError}=await db.rpc('complete_invoice_extraction',{p_invoice_id:invoiceId,p_run_id:runId,p_payload:payload});
    if(persistError)throw persistError;
    return {invoiceId,runId,extractionId,status,extraction:normalized,validation,metadata:{provider:result.provider,model:result.model,pagesProcessed:pageCount,durationMs:result.latencyMs,overallConfidence:confidence}};
  }catch(error){
    const code=error instanceof ExtractionError||error instanceof DocumentError?error.code:'EXTRACTION_FAILED';
    const message=error instanceof Error?error.message:'Invoice extraction failed';
    const {error:failureError}=await db.rpc('fail_invoice_extraction',{p_invoice_id:invoiceId,p_run_id:runId,p_payload:{provider:provider.constructor.name==='MockVisionProvider'?'MOCK':'NVIDIA_NIM',model:process.env.NVIDIA_MODEL??'unknown',promptVersion:PROMPT_VERSION,schemaVersion:SCHEMA_VERSION,pageCount,errorCode:code,message,rawResponse:error instanceof ExtractionError?error.rawResponse:null}});
    if(failureError)throw new AggregateError([error,failureError],'Extraction failed and failure could not be persisted');
    throw error;
  }
}
