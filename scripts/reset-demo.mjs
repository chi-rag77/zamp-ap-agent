import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
execFileSync('supabase',['db','reset','--local'],{stdio:'inherit',env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'}});
const status=execFileSync('supabase',['status','--output','json'],{encoding:'utf8',env:{...process.env,SUPABASE_TELEMETRY_DISABLED:'1'}});
const local=JSON.parse(status);
const db=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
for(const [table,expected] of [['vendors',5],['purchase_orders',5],['goods_receipts',1],['invoices',7],['policies',1]]){
  const {count,error}=await db.from(table).select('id',{count:'exact',head:true});
  if(error||count!==expected)throw new Error(`${table}: expected ${expected}; got ${count}; ${error?.message??''}`);
  process.stdout.write(`✓ ${table}: ${count}\n`);
}
process.stdout.write('✓ Demo environment ready\n');
