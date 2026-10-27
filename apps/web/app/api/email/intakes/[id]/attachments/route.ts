import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../../../../lib/tenant-database';
import {emailAdmin,uuid} from '../../../../../../lib/email-api';
import {intakeBelongsToMailbox} from '../../../../../../lib/email-intake-scope';
import {gmailMailbox} from '@zamp/email';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});const {id}=await params;if(!uuid(id))return NextResponse.json({error:'Invalid ID'},{status:400});const db=await createWebServerClient();const scope=await db.from('email_intakes').select('id,to_addresses').eq('id',id).maybeSingle();if(scope.error)return NextResponse.json({error:scope.error.message},{status:500});if(!scope.data||!intakeBelongsToMailbox(scope.data.to_addresses,gmailMailbox()))return NextResponse.json({error:'Not found'},{status:404});const {data,error}=await db.from('email_attachments').select('id,filename,mime_type,size_bytes,document_status,document_role,rejection_reason,invoice_id,agent_run_id').eq('email_intake_id',id);return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({attachments:data})}
