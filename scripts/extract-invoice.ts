import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { prepareDocument } from '@zamp/document';
import { MockVisionProvider, NvidiaVisionProvider, normalizeExtraction, validateExtraction, extractionQuality, overallConfidence } from '@zamp/ai';

const path=process.argv[2];
if(!path){console.error('Usage: npm run extract:invoice -- ./invoice.pdf [invoice-number-hint]');process.exit(2)}
const type=extname(path).toLowerCase();
const mimeType=type==='.pdf'?'application/pdf':type==='.png'?'image/png':['.jpg','.jpeg'].includes(type)?'image/jpeg':'application/octet-stream';
const document=await prepareDocument({bytes:await readFile(path),mimeType,filename:basename(path)});
const provider=process.env.AI_PROVIDER==='mock'?new MockVisionProvider():new NvidiaVisionProvider();
const result=await provider.extractInvoice({pages:document.pages,filename:basename(path),hint:process.argv[3]});
const invoice=normalizeExtraction(result.extraction);
const checks=validateExtraction(invoice);
console.log(JSON.stringify({file:path,pages:document.pages.length,provider:result.provider,model:result.model,status:extractionQuality(invoice),invoiceNumber:invoice.invoiceNumber,vendor:invoice.vendor.name,poNumber:invoice.poNumber,currency:invoice.currency,subtotal:invoice.subtotal,tax:invoice.tax,total:invoice.total,lineItems:invoice.lineItems.length,confidence:overallConfidence(invoice),checks,warnings:invoice.warnings},null,2));
