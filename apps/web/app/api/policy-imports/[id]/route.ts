import {NextRequest,NextResponse} from 'next/server';
import {getPolicyImport} from '@zamp/policy-import';
import {importError,localImportRequest,uuid} from '../../../../lib/policy-import';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!localImportRequest(request))return NextResponse.json({error:'Policy imports are available only in the local workspace.'},{status:403});
  const {id}=await params;if(!uuid.test(id))return NextResponse.json({error:'Invalid import ID.'},{status:400});
  try{return NextResponse.json(await getPolicyImport(id))}catch(error){return importError(error)}
}
