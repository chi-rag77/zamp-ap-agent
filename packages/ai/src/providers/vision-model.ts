import type { ExtractedInvoice } from '../schema';
export type VisionPage = {pageNumber:number;mimeType:'image/png'|'image/jpeg';bytes:Buffer};
export type InvoiceVisionInput = {pages:VisionPage[];filename:string;invoiceId?:string;hint?:string};
export type VisionResult = {extraction:ExtractedInvoice;rawResponse:string;model:string;provider:string;finishReason:string|null;usage?:unknown;latencyMs:number};
export interface VisionModelProvider {extractInvoice(input:InvoiceVisionInput):Promise<VisionResult>}
