import {NextRequest,NextResponse} from 'next/server';
import {createPolicyImport} from '@zamp/policy-import';
import {importError,localImportRequest} from '../../../lib/policy-import';
export const runtime='nodejs';
export async function POST(request:NextRequest){
  if(!localImportRequest(request,true))return NextResponse.json({error:'Policy imports are available only in the local workspace.'},{status:403});
  try{const files=(await request.formData()).getAll('files');if(files.some(file=>!(file instanceof File)))return NextResponse.json({error:'Choose policy documents.'},{status:400});const prepared=await Promise.all((files as File[]).map(async file=>({filename:file.name,mimeType:file.type,bytes:Buffer.from(await file.arrayBuffer())})));return NextResponse.json(await createPolicyImport(prepared),{status:201})}catch(error){return importError(error)}
}
