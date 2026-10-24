import {NextRequest,NextResponse} from 'next/server';
import {syncGmailMailbox} from '@zamp/email';
import {emailAdmin} from '../../../../lib/email-api';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(request:NextRequest){if(!emailAdmin(request))return NextResponse.json({error:'Unauthorized'},{status:401});try{return NextResponse.json(await syncGmailMailbox())}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Sync failed'},{status:502})}}
