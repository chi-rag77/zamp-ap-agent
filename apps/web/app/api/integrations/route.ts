import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {allowed,denied} from '../../../lib/agent-api';
import {getIntegrationHub} from '../../../lib/integrations';
import {integrationInput} from '../../../../../packages/integrations/src/config';
export const runtime='nodejs';
export async function GET(request:NextRequest){if(!allowed(request))return denied();return NextResponse.json(await getIntegrationHub(),{headers:{'Cache-Control':'no-store'}})}
export async function POST(request:NextRequest){
 if(!allowed(request,true))return denied();
 try{
  const body=await request.text();if(body.length>8192)return NextResponse.json({error:'Configuration is too large'},{status:413});
  const input=integrationInput.safeParse(JSON.parse(body));
  if(!input.success)return NextResponse.json({error:input.error.issues.map(issue=>`${issue.path.join('.')}: ${issue.message}`).join('; ')},{status:400});
  const {data,error}=await createServerClient().from('integrations').insert(input.data).select('*').single();
  if(error)throw error;
  return NextResponse.json(data,{status:201});
 }catch{return NextResponse.json({error:'Connection could not be saved. Check the configuration and database availability.'},{status:422})}
}
