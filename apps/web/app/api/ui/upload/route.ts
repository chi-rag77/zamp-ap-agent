import {hasTrustedOrigin} from '../../../../lib/request-origin';
import {NextRequest,NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {createServerClient} from '@zamp/database';
import {validateDocument,DocumentError} from '@zamp/document';
import {extractInvoiceDocument,NvidiaVisionProvider,MockVisionProvider} from '@zamp/ai';
import {validateInvoice} from '@zamp/matching';
import {localWorkspace} from '../../../../lib/data';
import {createTenantDatabase} from '../../../../lib/tenant-database';
import {workosAuthEnabled} from '../../../../lib/workos-auth';

export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:NextRequest){
  if(!localWorkspace()||!hasTrustedOrigin(request))return NextResponse.json({error:'This upload is unavailable outside the connected workspace.'},{status:403});
  let invoiceId:string|undefined;
  try{
    const file=(await request.formData()).get('file');
    if(!(file instanceof File))return NextResponse.json({error:'Choose an invoice file.'},{status:400});
    const bytes=Buffer.from(await file.arrayBuffer());
    const mime=validateDocument({bytes,mimeType:file.type,filename:file.name});
    const db=createServerClient();
    const organizationId=workosAuthEnabled()?(await createTenantDatabase()).organizationId:undefined;
    const {data:invoice,error:createError}=await db.from('invoices').insert({source:'UPLOAD',currency:'INR',status:'RECEIVED',...(organizationId?{organization_id:organizationId}:{})}).select('id').single();
    if(createError||!invoice)throw new Error(`Invoice creation failed: ${createError?.message??'empty response'}`);
    const createdId=invoice.id as string;
    invoiceId=createdId;
    const hash=createHash('sha256').update(bytes).digest('hex');
    const extension=mime==='application/pdf'?'pdf':mime==='image/png'?'png':'jpg';
    const path=`${createdId}/original/${hash}.${extension}`;
    const {error:storageError}=await db.storage.from('invoice-documents').upload(path,bytes,{contentType:mime,upsert:false});
    if(storageError)throw new Error(`Document storage failed: ${storageError.message}`);
    const {error:documentError}=await db.from('invoice_documents').insert({invoice_id:createdId,storage_path:path,filename:file.name,mime_type:mime,size_bytes:bytes.length,document_hash:hash});
    if(documentError)throw new Error(`Document record failed: ${documentError.message}`);
    const {error:updateError}=await db.from('invoices').update({document_path:path,document_hash:hash}).eq('id',createdId);
    if(updateError)throw new Error(`Invoice update failed: ${updateError.message}`);
    const provider=process.env.AI_PROVIDER==='mock'?new MockVisionProvider():new NvidiaVisionProvider();
    await extractInvoiceDocument({db,provider,invoiceId:createdId,document:{bytes,mimeType:mime,filename:file.name}});
    const result=await validateInvoice(createdId);
    return NextResponse.json({invoiceId:createdId,validationStatus:result.status});
  }catch(error){
    const message=error instanceof DocumentError?error.message:error instanceof Error?error.message:'Invoice processing failed';
    const status=error instanceof DocumentError?400:500;
    return NextResponse.json({error:message,invoiceId},{status});
  }
}
