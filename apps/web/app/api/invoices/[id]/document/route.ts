import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'node:crypto';
import { createServerClient } from '@zamp/database';
import { validateDocument, DocumentError } from '@zamp/document';

export const runtime='nodejs';
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
    const file=(await request.formData()).get('file');
    if(!(file instanceof File))throw new DocumentError('DOCUMENT_NOT_FOUND','Upload a file in the file form field');
    const bytes=Buffer.from(await file.arrayBuffer());
    const mime=validateDocument({bytes,mimeType:file.type,filename:file.name});
    const db=createServerClient();
    const {data:invoice,error:invoiceError}=await db.from('invoices').select('id').eq('id',id).maybeSingle();
    if(invoiceError)throw invoiceError;
    if(!invoice)throw new DocumentError('DOCUMENT_NOT_FOUND','Invoice record not found');
    const hash=createHash('sha256').update(bytes).digest('hex');
    const extension=mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg';
    const path=`${id}/original/${hash}.${extension}`;
    const {error:uploadError}=await db.storage.from('invoice-documents').upload(path,bytes,{contentType:mime,upsert:false});
    if(uploadError&&!/already exists|duplicate/i.test(uploadError.message))throw uploadError;
    const {data:document,error:recordError}=await db.from('invoice_documents').upsert({invoice_id:id,storage_path:path,filename:file.name,mime_type:mime,size_bytes:bytes.length,document_hash:hash},{onConflict:'storage_path'}).select('id,storage_path').single();
    if(recordError)throw recordError;
    const {error:updateError}=await db.from('invoices').update({document_path:path,document_hash:hash}).eq('id',id);
    if(updateError)throw updateError;
    return NextResponse.json({success:true,invoiceId:id,documentId:document.id,storagePath:document.storage_path});
  }catch(error){
    const code=error instanceof DocumentError?error.code:'DOCUMENT_UPLOAD_FAILED';
    return NextResponse.json({success:false,error:{code,message:error instanceof DocumentError?error.message:'Document upload failed'}},{status:code==='DOCUMENT_TOO_LARGE'?413:code==='UNSUPPORTED_DOCUMENT_TYPE'?415:400});
  }
}
