import {NextRequest,NextResponse} from 'next/server';
import {resolveImportIssue} from '@zamp/policy-import';
import {importError,localImportRequest,uuid} from '../../../../../../lib/policy-import';
export const runtime='nodejs';
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string;issueId:string}>}){
  if(!localImportRequest(request,true))return NextResponse.json({error:'Policy imports are available only in the local workspace.'},{status:403});const {id,issueId}=await params;if(!uuid.test(id)||!uuid.test(issueId))return NextResponse.json({error:'Invalid issue ID.'},{status:400});
  try{const input=await request.json();return NextResponse.json(await resolveImportIssue(id,issueId,String(input.resolution??'')))}catch(error){return importError(error)}
}
