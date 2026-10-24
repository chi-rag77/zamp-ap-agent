import {NextRequest} from 'next/server';
import {createServerClient} from '@zamp/database';
import {localWorkspace} from '../../../../../../lib/data';

export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!localWorkspace())return new Response('Workspace unavailable',{status:403});
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return new Response('Invalid invoice ID',{status:400});
  const db=createServerClient();
  const {data:document,error}=await db.from('invoice_documents').select('storage_path,mime_type,filename').eq('invoice_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error||!document)return new Response('Document not found',{status:404});
  const {data:file,error:storageError}=await db.storage.from('invoice-documents').download(document.storage_path);
  if(storageError||!file)return new Response('Document unavailable',{status:404});
  return new Response(new Uint8Array(await file.arrayBuffer()),{headers:{'Content-Type':document.mime_type,'Content-Disposition':`inline; filename="${document.filename.replace(/["\r\n]/g,'_')}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
