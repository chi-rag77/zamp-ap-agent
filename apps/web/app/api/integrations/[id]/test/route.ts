import {NextRequest,NextResponse} from 'next/server';
import {allowed,denied,validId,invalid} from '../../../../../lib/agent-api';
import {testIntegration} from '../../../../../lib/integrations';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!allowed(request,true))return denied();const {id}=await params;if(!validId(id))return invalid();
 try{return NextResponse.json(await testIntegration(id))}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Test failed'},{status:409})}
}
