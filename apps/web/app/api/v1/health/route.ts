import {NextRequest,NextResponse} from 'next/server';
import {createServerClient} from '@zamp/database';
import {hashIntegrationApiKey,integrationApiKeyFromRequest} from '../../../../../../packages/integrations/src/api-key';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:NextRequest){
 const started=Date.now();
 const key=integrationApiKeyFromRequest(request);
 if(!key)return NextResponse.json({error:'A valid Zamp API key is required. Send it as a Bearer token or X-API-Key header.'},{status:401,headers:{'WWW-Authenticate':'Bearer realm="Zamp API"','Cache-Control':'no-store'}});
 const service=createServerClient();
 const lookup=await service.from('integration_api_keys').select('id,organization_id').eq('key_hash',hashIntegrationApiKey(key)).is('revoked_at',null).maybeSingle();
 if(lookup.error)return NextResponse.json({error:'API authentication is temporarily unavailable.'},{status:503,headers:{'Cache-Control':'no-store'}});
 if(!lookup.data)return NextResponse.json({error:'The API key is invalid or has been revoked.'},{status:401,headers:{'WWW-Authenticate':'Bearer realm="Zamp API"','Cache-Control':'no-store'}});
 const usedAt=new Date().toISOString();
 const [updated,logged]=await Promise.all([
  service.from('integration_api_keys').update({last_used_at:usedAt}).eq('id',lookup.data.id),
  service.from('integration_api_requests').insert({organization_id:lookup.data.organization_id,api_key_id:lookup.data.id,method:'GET',path:'/api/v1/health',status_code:200,duration_ms:Date.now()-started}),
 ]);
 if(updated.error||logged.error)return NextResponse.json({error:'The authenticated request could not be recorded. Retry shortly.'},{status:503,headers:{'Cache-Control':'no-store'}});
 return NextResponse.json({ok:true,service:'Zamp AP Agent API',apiVersion:'v1',timestamp:usedAt},{headers:{'Cache-Control':'no-store'}});
}
