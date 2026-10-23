import {validateInvoice} from '@zamp/matching';
import {existsSync} from 'node:fs';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const invoiceId=process.argv[2];
if(!invoiceId){console.error('Usage: npm run validate:invoice -- INVOICE_UUID');process.exit(2)}
const result=await validateInvoice(invoiceId);
console.log(JSON.stringify({invoiceId:result.invoiceId,runId:result.runId,status:result.status,vendor:result.vendor,purchaseOrder:result.purchaseOrder,summary:result.summary,twoWayMatch:result.twoWayMatch.status,threeWayMatch:result.threeWayMatch.status,duplicate:result.duplicate.status,blockers:result.blockers,warnings:result.warnings},null,2));
