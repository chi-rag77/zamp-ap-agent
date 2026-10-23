import {NextRequest,NextResponse} from 'next/server';
import {activateImportedPolicy,generatePolicyTests,getPolicyImport,processPolicyImport,saveImportedDraft,simulateImportedPolicy} from '@zamp/policy-import';
import {importError,localImportRequest,uuid} from '../../../../../lib/policy-import';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string;action:string}>}){
  if(!localImportRequest(request,true))return NextResponse.json({error:'Policy imports are available only in the local workspace.'},{status:403});
  const {id,action}=await params;if(!uuid.test(id))return NextResponse.json({error:'Invalid import ID.'},{status:400});
  try{switch(action){case 'process':return NextResponse.json(await processPolicyImport(id));case 'convert':return NextResponse.json(await saveImportedDraft(id));case 'simulate':return NextResponse.json(await simulateImportedPolicy(id));case 'generate-tests':return NextResponse.json({tests:generatePolicyTests(await getPolicyImport(id))});case 'activate':return NextResponse.json(await activateImportedPolicy(id));default:return NextResponse.json({error:'Unknown policy action.'},{status:404})}}catch(error){return importError(error)}
}
