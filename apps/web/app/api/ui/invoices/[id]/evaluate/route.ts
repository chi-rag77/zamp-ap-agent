import {NextRequest,NextResponse} from 'next/server';
import {evaluateSavedInvoice} from '@zamp/policy';
import {localWorkspace} from '../../../../../../lib/data';
import {tenantCanAccess} from '../../../../../../lib/tenant-database';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const origin=request.headers.get('origin');
  if(!localWorkspace()||origin!==request.nextUrl.origin)return NextResponse.json({error:'Unavailable outside the local workspace'},{status:403});
  const {id:rawId}=await params;
  let id=rawId;
  try{id=decodeURIComponent(rawId).trim().replace(/^\{(.+)\}$/,'$1')}catch{return NextResponse.json({error:'Invoice ID is not valid.'},{status:400})}
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return NextResponse.json({error:'Invoice ID is not valid.'},{status:400});
  try{if(!await tenantCanAccess('invoices',id))return NextResponse.json({error:'Invoice not found'},{status:404});return NextResponse.json(await evaluateSavedInvoice(id))}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Policy evaluation failed'},{status:422})}
}
