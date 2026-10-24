import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied,failed} from '../../../../lib/agent-api';
const filters={all:{types:null,decision:null},processing:{types:['RUN_QUEUED','RUN_STARTED','RUN_RETRYING','EXTRACTION_STARTED','VENDOR_RESOLUTION_STARTED','PO_RESOLUTION_STARTED','LINE_MATCHING_STARTED','VALIDATION_STARTED','POLICY_EVALUATION_STARTED','ACTION_STARTED'],decision:null},approved:{types:['DECISION_GENERATED','RUN_COMPLETED'],decision:'AUTO_APPROVED'},review:{types:['REVIEW_REQUIRED'],decision:null},rejected:{types:['DECISION_GENERATED','RUN_COMPLETED'],decision:'AUTO_REJECTED'},errors:{types:['RUN_FAILED','ACTION_FAILED','ACTION_VERIFICATION_FAILED','EXTRACTION_FAILED','VALIDATION_FAILED','POLICY_EVALUATION_FAILED'],decision:null}} as const;
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 if(!allowed(request))return denied();const key=(request.nextUrl.searchParams.get('filter')??'all').toLowerCase() as keyof typeof filters;if(!(key in filters))return NextResponse.json({error:'Invalid activity filter'},{status:400});
 try{let query=createServerClient().from('processing_events').select('id,sequence,event_type,invoice_id,run_id,step_name,status,message,metadata,created_at').order('created_at',{ascending:false}).limit(100);const selected=filters[key];if(selected.types)query=query.in('event_type',[...selected.types]);if(selected.decision)query=query.contains('metadata',{decision:selected.decision});const {data,error}=await query;if(error)throw error;return NextResponse.json({events:data??[]},{headers:{'Cache-Control':'no-store'}})}catch(error){return failed(error)}
}
