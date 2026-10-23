import {NextRequest,NextResponse} from 'next/server';
import {readPolicySource} from '@zamp/policy-import';
import {importError,localImportRequest,uuid} from '../../../../../../lib/policy-import';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string;documentId:string}>}){
  if(!localImportRequest(request))return NextResponse.json({error:'Policy documents are available only in the local workspace.'},{status:403});const {id,documentId}=await params;if(!uuid.test(id)||!uuid.test(documentId))return NextResponse.json({error:'Invalid document ID.'},{status:400});
  try{const file=await readPolicySource(id,documentId);return new NextResponse(new Uint8Array(file.bytes),{headers:{'Content-Type':file.mimeType,'Content-Disposition':`attachment; filename="${file.filename.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})}catch(error){return importError(error)}
}
