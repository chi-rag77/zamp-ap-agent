import {NextRequest,NextResponse} from 'next/server';
import {answerPolicyQuestion,getPolicyImport} from '@zamp/policy-import';
import {importError,localImportRequest,uuid} from '../../../../../lib/policy-import';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!localImportRequest(request,true))return NextResponse.json({error:'Policy imports are available only in the local workspace.'},{status:403});const {id}=await params;if(!uuid.test(id))return NextResponse.json({error:'Invalid import ID.'},{status:400});
  try{const input=await request.json();return NextResponse.json(answerPolicyQuestion(await getPolicyImport(id),String(input.question??'')))}catch(error){return importError(error)}
}
