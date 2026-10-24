import {NextRequest,NextResponse} from 'next/server';
import {renewGmailWatch} from '@zamp/email';
import {emailAdmin} from '../../../../../lib/email-api';
export const runtime='nodejs';
export async function POST(request:NextRequest){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json(await renewGmailWatch())}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Watch renewal failed'},{status:502})}}
