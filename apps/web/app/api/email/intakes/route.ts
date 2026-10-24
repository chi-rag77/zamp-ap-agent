import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../../lib/tenant-database';
import {emailAdmin} from '../../../../lib/email-api';
export const runtime='nodejs';
export async function GET(request:NextRequest){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});const limit=Math.min(100,Math.max(1,Number(request.nextUrl.searchParams.get('limit')??50)||50));const {data,error}=await (await createWebServerClient()).from('email_intakes').select('id,provider,message_id,from_address,subject,received_at,classification,status,error_code,invoice_id,created_at').order('received_at',{ascending:false}).limit(limit);return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({intakes:data})}
