import {NextRequest,NextResponse} from 'next/server';
import {createWebServerClient} from '../../../../lib/tenant-database';
import {emailAdmin} from '../../../../lib/email-api';
import {mailboxIntakeIds} from '../../../../lib/email-intake-scope';
import {gmailMailbox} from '@zamp/email';
export const runtime='nodejs';
export async function GET(request:NextRequest){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});const limit=Math.min(100,Math.max(1,Number(request.nextUrl.searchParams.get('limit')??50)||50));const db=await createWebServerClient();try{const ids=await mailboxIntakeIds(db,gmailMailbox(),limit);if(!ids.length)return NextResponse.json({intakes:[]});const {data,error}=await db.from('email_intakes').select('id,provider,message_id,from_address,subject,received_at,classification,status,error_code,invoice_id,created_at').in('id',ids).order('received_at',{ascending:false});return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({intakes:data})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not list intake messages'},{status:500})}}
