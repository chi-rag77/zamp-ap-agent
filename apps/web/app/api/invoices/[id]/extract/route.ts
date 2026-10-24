import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServerClient } from '@zamp/database';
import { extractInvoiceDocument, ExtractionError, MockVisionProvider, NvidiaVisionProvider } from '@zamp/ai';
import { DocumentError } from '@zamp/document';
import {tenantCanAccess} from '../../../../../lib/tenant-database';

export const runtime='nodejs';
export const maxDuration=300;
function authorized(request:NextRequest){
  const expected=process.env.EXTRACTION_API_TOKEN;
  const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
  if(!expected||!supplied)return false;
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export async function POST(request:NextRequest,context:{params:Promise<{id:string}>}){
  if(!authorized(request))return NextResponse.json({success:false,error:{code:'UNAUTHORIZED',message:'Authentication required'}},{status:401});
  const {id}=await context.params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({success:false,error:{code:'INVALID_INVOICE_ID',message:'Invalid invoice ID'}},{status:400});
  try{
    if(!await tenantCanAccess('invoices',id))return NextResponse.json({success:false,error:{code:'NOT_FOUND',message:'Invoice not found'}},{status:404});
    const db=createServerClient();
    const {data:record,error:recordError}=await db.from('invoice_documents').select('storage_path,filename,mime_type').eq('invoice_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(recordError)throw recordError;
    if(!record)throw new ExtractionError('DOCUMENT_NOT_FOUND','No document is stored for this invoice');
    const {data:file,error:downloadError}=await db.storage.from('invoice-documents').download(record.storage_path);
    if(downloadError||!file)throw new ExtractionError('DOCUMENT_NOT_FOUND','Stored invoice document could not be downloaded');
    const provider=process.env.AI_PROVIDER==='mock'?new MockVisionProvider():new NvidiaVisionProvider();
    const result=await extractInvoiceDocument({db,provider,invoiceId:id,document:{bytes:Buffer.from(await file.arrayBuffer()),mimeType:record.mime_type,filename:record.filename}});
    return NextResponse.json({success:true,...result});
  }catch(error){
    const code=error instanceof ExtractionError||error instanceof DocumentError?error.code:'EXTRACTION_FAILED';
    const status=code==='DOCUMENT_NOT_FOUND'?404:code==='DOCUMENT_TOO_LARGE'?413:code==='UNSUPPORTED_DOCUMENT_TYPE'?415:code==='NVIDIA_AUTH_ERROR'?502:500;
    return NextResponse.json({success:false,invoiceId:id,error:{code,message:error instanceof ExtractionError||error instanceof DocumentError?error.message:'Invoice extraction failed'}},{status});
  }
}
