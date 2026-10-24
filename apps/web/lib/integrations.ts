import 'server-only';
import {createServerClient} from '@zamp/database';
import {localWorkspace} from './data';
import type {HubData,Integration} from '../../../packages/integrations/src/catalog';
import {probe,retryable,backoff} from '../../../packages/integrations/src/transport';
export async function getIntegrationHub():Promise<HubData>{
 if(!localWorkspace())return {integrations:[],runs:[],audit:[],error:'This workspace is not enabled for connected data.'};
 try{
  const db=createServerClient();
  const [integrations,runs,audit]=await Promise.all([db.from('integrations').select('*').order('created_at',{ascending:false}).limit(100),db.from('integration_runs').select('*').order('created_at',{ascending:false}).limit(100),db.from('integration_audit').select('*').order('created_at',{ascending:false}).limit(100)]);
  if(integrations.error||runs.error||audit.error)throw new Error('unavailable');
  return {integrations:integrations.data??[],runs:runs.data??[],audit:audit.data??[]};
 }catch{return {integrations:[],runs:[],audit:[],error:'Integration data could not be loaded. Check the database connection and Integration Hub migration.'}}
}
export async function testIntegration(id:string){
 const db=createServerClient();
 const {data,error}=await db.from('integrations').select('*').eq('id',id).single();
 if(error||!data)throw new Error('Connection not found');
 const integration=data as Integration;
 if(integration.status==='DISCONNECTED')throw new Error('Create a new configuration to reconnect this service');
 // Recover interrupted tests, then atomically claim the one-test-per-connection slot.
 const stale=await db.from('integration_runs').update({status:'FAILED',error_code:'INTERRUPTED'}).eq('integration_id',id).eq('status','RUNNING').lt('created_at',new Date(Date.now()-120000).toISOString());
 if(stale.error)throw new Error('Could not recover interrupted tests');
 const recent=await db.from('integration_runs').select('id',{count:'exact',head:true}).eq('integration_id',id).gt('created_at',new Date(Date.now()-60000).toISOString());
 if(recent.error)throw new Error('Could not check test rate limit');
 if((recent.count??0)>=3)throw new Error('Wait one minute before testing this connection again');
 const claim=await db.from('integration_runs').insert({integration_id:id,status:'RUNNING'}).select('id').single();
 if(claim.error||!claim.data)throw new Error('A test is already running or could not be started');
 const start=Date.now();let httpStatus:number|null=null;let code:string|null=null;
 try{
  const token=integration.credential_ref?process.env[integration.credential_ref]:undefined;
  if(integration.auth_type!=='none'&&!token)throw new Error('CREDENTIAL_NOT_CONFIGURED');
  const headers:Record<string,string>={};
  if(integration.auth_type==='bearer')headers.Authorization=`Bearer ${token}`;
  if(integration.auth_type==='api_key')headers[integration.header_name]=token!;
  const url=new URL(integration.endpoint);url.pathname=url.pathname.replace(/\/$/,'')+integration.test_path;
  for(let attempt=0;attempt<3;attempt++){
   httpStatus=await probe(url,headers);
   if(!retryable(httpStatus)||attempt===2)break;
   await new Promise(resolve=>setTimeout(resolve,backoff(attempt)));
  }
  if(httpStatus!>=300||httpStatus!<200)code=httpStatus!>=300&&httpStatus!<400?'REDIRECT_BLOCKED':`HTTP_${httpStatus}`;
 }catch(error){const message=error instanceof Error?error.message:'';code=['CREDENTIAL_NOT_CONFIGURED','UNSAFE_ENDPOINT','TIMEOUT'].includes(message)?message:'CONNECTION_FAILED'}
 const result=await db.from('integration_runs').update({status:code?'FAILED':'SUCCEEDED',duration_ms:Date.now()-start,http_status:httpStatus,error_code:code}).eq('id',claim.data.id);
 if(result.error)throw new Error('Could not persist the test result');
 const status=await db.from('integrations').update({status:code?'ERROR':'HEALTHY',last_tested_at:new Date().toISOString(),last_error:code}).eq('id',id).neq('status','DISCONNECTED');
 if(status.error)throw new Error('Could not persist connection health');
 return {success:!code,error:code,runId:claim.data.id};
}
