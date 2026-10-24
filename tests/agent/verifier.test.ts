import {describe,expect,it,vi} from 'vitest';
import {initializeContext} from '../../packages/agent/src/context';
const state=vi.hoisted(()=>({invoiceStatus:'PROCESSING',actionExists:true,reviewExists:true}));
vi.mock('@zamp/database',()=>({createServerClient:()=>({from:(table:string)=>{const query={select:()=>query,eq:()=>query,single:async()=>({data:{status:state.invoiceStatus},error:null}),maybeSingle:async()=>({data:table==='review_cases'?(state.reviewExists?{id:'review',status:'OPEN'}:null):(state.actionExists?{id:'action',status:'VERIFIED'}:null),error:null})};return query}})}));
import {verifyInvoiceState} from '../../packages/agent/src/verifier';
describe('post-action verification',()=>{
 it('fails closed when the invoice did not reach the expected status',async()=>{state.invoiceStatus='PROCESSING';await expect(verifyInvoiceState(initializeContext('run','invoice','LIVE'),'APPROVED')).rejects.toMatchObject({code:'ACTION_VERIFICATION_FAILED'})});
 it('requires a saved action record after invoice approval',async()=>{state.invoiceStatus='APPROVED';state.actionExists=false;await expect(verifyInvoiceState(initializeContext('run','invoice','LIVE'),'APPROVED')).rejects.toMatchObject({code:'ACTION_VERIFICATION_FAILED'})});
 it('accepts only the matching persisted status and action',async()=>{state.invoiceStatus='APPROVED';state.actionExists=true;await expect(verifyInvoiceState(initializeContext('run','invoice','LIVE'),'APPROVED')).resolves.toMatchObject({status:'VERIFIED',actual:'APPROVED'})});
 it('requires an open review case and a verified review action',async()=>{state.invoiceStatus='NEEDS_REVIEW';state.reviewExists=false;state.actionExists=true;await expect(verifyInvoiceState(initializeContext('run','invoice','LIVE'),'NEEDS_REVIEW')).rejects.toMatchObject({code:'ACTION_VERIFICATION_FAILED'});state.reviewExists=true;state.actionExists=true;await expect(verifyInvoiceState(initializeContext('run','invoice','LIVE'),'NEEDS_REVIEW')).resolves.toMatchObject({status:'VERIFIED',actual:'NEEDS_REVIEW'})})
});
