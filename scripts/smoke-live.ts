/** Run only against a dedicated demo project: RUN_LIVE_SMOKE=yes npm run smoke:live */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { extractInvoiceDocument, MockVisionProvider } from '@zamp/ai';

if(process.env.RUN_LIVE_SMOKE!=='yes')throw new Error('Set RUN_LIVE_SMOKE=yes for the dedicated demo project');
for(const line of readFileSync('.env.local','utf8').split('\n')){
  const index=line.indexOf('=');if(index>0)process.env[line.slice(0,index)]=line.slice(index+1);
}
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw new Error('Supabase server configuration is missing');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:invoice,error:createError}=await db.from('invoices').insert({source:'DEMO',currency:'INR',status:'RECEIVED'}).select('id').single();
if(createError)throw createError;
const png=await sharp(Buffer.from('<svg width="800" height="600"><rect width="100%" height="100%" fill="white"/><text x="50" y="100" font-size="30">Invoice INV-1048</text></svg>')).png().toBuffer();
const result=await extractInvoiceDocument({db,provider:new MockVisionProvider(),invoiceId:invoice.id,document:{bytes:png,mimeType:'image/png',filename:'synthetic-invoice.png'},hint:'INV-1048'});
const {data:state,error:stateError}=await db.from('invoices').select('invoice_number,total,current_extraction_id').eq('id',invoice.id).single();
if(stateError||state?.current_extraction_id!==result.extractionId||state?.invoice_number!=='INV-1048')throw new Error('Canonical extraction did not persist');
const {count,error:countError}=await db.from('agent_steps').select('*',{count:'exact',head:true}).eq('run_id',result.runId);
if(countError||count!==5)throw new Error('Expected five persisted agent steps');
console.log(JSON.stringify({invoiceId:invoice.id,runId:result.runId,extractionId:result.extractionId,status:result.status,steps:count,total:state.total}));
