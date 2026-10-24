import {describe,expect,it,vi} from 'vitest';
import {initializeContext} from '../../packages/agent/src/context';
const state=vi.hoisted(()=>({invoiceStatus:'PROCESSING',actionExists:true}));
vi.mock('@zamp/database',()=>({createServerClient:()=>({from:(table:string)=>table==='invoices'?{select:()=>({eq:()=>({single:async()=>({data:{status:state.invoiceStatus},error:null})})})}:{update:()=>({eq:()=>({eq:()=>({select:()=>({maybeSingle:async()=>({data:state.actionExists?{id:'action'}:null,error:null})})})})})}})}));
import {verifyInvoiceState} from '../../packages/agent/src/verifier';
describe('post-action verification',()=>{
 it('fails closed when the invoice did not reach the expected status',async()=>{state.invoiceStatus='PROCESSING';await expect(verifyInvoiceState(initializeContext('run','invoice','LIVE'),'APPROVED')).rejects.toMatchObject({code:'ACTION_VERIFICATION_FAILED'})});
 it('requires a saved action record after invoice approval',async()=>{state.invoiceStatus='APPROVED';state.actionExists=false;await expect(verifyInvoiceState(initializeContext('run','invoice','LIVE'),'APPROVED')).rejects.toMatchObject({code:'ACTION_VERIFICATION_FAILED'})});
 it('accepts only the matching persisted status and action',async()=>{state.invoiceStatus='APPROVED';state.actionExists=true;await expect(verifyInvoiceState(initializeContext('run','invoice','LIVE'),'APPROVED')).resolves.toMatchObject({status:'VERIFIED',actual:'APPROVED'})})
});
