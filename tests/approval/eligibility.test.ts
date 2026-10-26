import {describe,expect,it} from 'vitest';
import {countInvoiceApprovers,eligibleApprovalRoles,eligibleApprovalUsers,type ApprovalCandidate,type ApprovalRole} from '../../packages/approval/index';

const roles:ApprovalRole[]=[
 {role_key:'AP_MANAGER',permissions:['invoices.view','invoices.approve']},
 {role_key:'AP_SPECIALIST',permissions:['invoices.view','invoices.edit']},
];
const user=(overrides:Partial<ApprovalCandidate>={}):ApprovalCandidate=>({
 workos_user_id:'user-1',status:'ACTIVE',role:'AP_MANAGER',approval_limit:100000,approval_currency:'INR',approval_categories:['INVOICES'],...overrides,
});

describe('eligibleApprovalUsers',()=>{
 it('returns active invoice approvers whose authority covers the configured limit',()=>{
  expect(eligibleApprovalUsers([user()],roles,'INR',100000)).toHaveLength(1);
  expect(eligibleApprovalUsers([user()],roles,'INR',100001)).toHaveLength(0);
 });
 it('excludes inactive members, non-approver roles, and members without invoice scope',()=>{
  expect(eligibleApprovalUsers([user({status:'INACTIVE'}),user({workos_user_id:'specialist',role:'AP_SPECIALIST'}),user({workos_user_id:'po-only',approval_categories:['PURCHASE_ORDERS']})],roles,'INR',0)).toHaveLength(0);
 });
 it('requires matching currency and a configured nonnegative authority limit',()=>{
  expect(eligibleApprovalUsers([user({approval_currency:'USD'})],roles,'INR',0)).toHaveLength(0);
  expect(eligibleApprovalUsers([user({approval_limit:null})],roles,'INR',0)).toHaveLength(0);
  expect(eligibleApprovalUsers([user({approval_limit:-1})],roles,'INR',0)).toHaveLength(0);
 });
 it('offers only roles with at least one member who can cover the configured authority',()=>{
  expect(eligibleApprovalRoles([user()],roles,'INR',100000).map(role=>role.role_key)).toEqual(['AP_MANAGER']);
  expect(eligibleApprovalRoles([user()],roles,'USD',100000)).toEqual([]);
 });
 it('returns no options for invalid requested limits and does not trust a role without permission',()=>{
  expect(eligibleApprovalUsers([user()],[{role_key:'AP_MANAGER',permissions:['invoices.view']}],'INR',0)).toHaveLength(0);
  expect(eligibleApprovalUsers([user()],roles,'INR',Number.NaN)).toHaveLength(0);
 });
});
describe('countInvoiceApprovers',()=>{
 it('counts only active invoice approvers with an explicit nonnegative authority limit',()=>{
  const people=[user({workos_user_id:'eligible'}),user({workos_user_id:'missing-limit',approval_limit:null}),user({workos_user_id:'inactive',status:'INACTIVE'}),user({workos_user_id:'other-scope',approval_categories:['VENDORS']})];
  expect(countInvoiceApprovers(people,roles)).toBe(1);
 });
 it('does not count a role without invoice approval permission',()=>{
  expect(countInvoiceApprovers([user({role:'AP_SPECIALIST'})],[...roles,{role_key:'AP_SPECIALIST',permissions:['invoices.view']}])).toBe(0);
 });
});
