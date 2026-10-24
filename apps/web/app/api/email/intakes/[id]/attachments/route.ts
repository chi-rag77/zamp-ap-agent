import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {emailAdmin,uuid} from '../../../../../../lib/email-api';
export const runtime='nodejs';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});const {id}=await params;if(!uuid(id))return NextResponse.json({error:'Invalid ID'},{status:400});const {data,error}=await createServerClient().from('email_attachments').select('id,filename,mime_type,size_bytes,document_status,document_role,rejection_reason,invoice_id,agent_run_id').eq('email_intake_id',id);return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({attachments:data})}
