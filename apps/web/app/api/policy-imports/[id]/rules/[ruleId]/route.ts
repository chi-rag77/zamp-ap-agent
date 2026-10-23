import {NextRequest,NextResponse} from 'next/server';
import {updateImportedRule} from '@zamp/policy-import';
import {importError,localImportRequest,uuid} from '../../../../../../lib/policy-import';
export const runtime='nodejs';
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string;ruleId:string}>}){
  if(!localImportRequest(request,true))return NextResponse.json({error:'Policy imports are available only in the local workspace.'},{status:403});const {id,ruleId}=await params;if(!uuid.test(id)||!uuid.test(ruleId))return NextResponse.json({error:'Invalid rule ID.'},{status:400});
  try{const input=await request.json();if(!['APPROVED','IGNORED','EDITED'].includes(input.status))return NextResponse.json({error:'Invalid review state.'},{status:400});return NextResponse.json(await updateImportedRule(id,ruleId,{status:input.status,changes:input.changes}))}catch(error){return importError(error)}
}
