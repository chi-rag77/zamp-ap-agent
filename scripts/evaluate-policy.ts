import {existsSync} from 'node:fs';
import {evaluateSavedInvoice} from '@zamp/policy';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const invoiceId=process.argv[2];if(!invoiceId){console.error('Usage: npm run policy:invoice -- INVOICE_UUID');process.exit(2)}
const result=await evaluateSavedInvoice(invoiceId);console.log(JSON.stringify(result,null,2));
