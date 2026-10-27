import {describe,expect,it} from 'vitest';
import {evaluateApprovalRules,type ApprovalRule} from '../../packages/approval/index';

const rule=(partial:Partial<ApprovalRule>={}):ApprovalRule=>({id:'large-invoice',name:'Large invoice review',enabled:true,priority:10,match:'ALL',conditions:[{field:'invoice_amount',operator:'GT',value:100000}],steps:[{approverType:'ROLE',approverRef:'FINANCE_MANAGER',authorityLimit:100000,currency:'INR',mode:'SEQUENTIAL'}],...partial});
const input={invoice_amount:125000,currency:'INR',variance_percent:0,department:'Finance',invoice_type:'STANDARD',vendor_match:true,po_match:true,duplicate:false,risk_flag:false};

describe('approval rule routing decision',()=>{
 it('routes an invoice above the configured threshold to the selected approval step',()=>{
  const result=evaluateApprovalRules([rule()],input);
  expect(result.status).toBe('REQUIRES_APPROVAL');
  expect(result.matchedRule?.ruleId).toBe('large-invoice');
  expect(result.route[0]).toMatchObject({approverType:'ROLE',approverRef:'FINANCE_MANAGER',authorityLimit:100000,currency:'INR'});
 });
 it('does not create an approval route when no rule applies',()=>{
  const result=evaluateApprovalRules([rule()],{...input,invoice_amount:100000});
  expect(result.status).toBe('NO_APPROVAL_RULE');
  expect(result.route).toEqual([]);
 });
 it('fails closed when matching rules share a priority',()=>{
  const result=evaluateApprovalRules([rule(),rule({id:'duplicate-priority',name:'Second rule'})],input);
  expect(result.conflict).toBe(true);
  expect(result.status).toBe('CONFLICT');
  expect(result.route).toEqual([]);
 });
});
