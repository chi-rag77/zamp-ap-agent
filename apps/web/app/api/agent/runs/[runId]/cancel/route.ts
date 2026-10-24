import {NextRequest,NextResponse} from 'next/server';
import {cancelRun} from '@zamp/agent';
import {allowed,denied,failed,invalid,validId} from '../../../../../../lib/agent-api';
export const runtime='nodejs';
export async function POST(request:NextRequest,{params}:{params:Promise<{runId:string}>}){if(!allowed(request,true))return denied();const {runId}=await params;if(!validId(runId))return invalid();try{return NextResponse.json({runId,cancelled:await cancelRun(runId)})}catch(error){return failed(error)}}
