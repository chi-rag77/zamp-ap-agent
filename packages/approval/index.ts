import {z} from 'zod';

export const conditionFields=['invoice_amount','currency','variance_percent','department','invoice_type','vendor_match','po_match','duplicate','risk_flag'] as const;
export const conditionOperators=['GT','GTE','LT','LTE','EQ','NEQ','CONTAINS','IS_TRUE','IS_FALSE'] as const;
const condition=z.object({field:z.enum(conditionFields),operator:z.enum(conditionOperators),value:z.union([z.string().trim().max(160),z.number().finite(),z.boolean()])}).strict();
const step=z.object({approverType:z.enum(['ROLE','USER']),approverRef:z.string().trim().min(1).max(100),authorityLimit:z.number().finite().nonnegative(),currency:z.string().regex(/^[A-Z]{3}$/),mode:z.enum(['SEQUENTIAL','PARALLEL','ANY_ONE','ALL_REQUIRED']).default('SEQUENTIAL')}).strict();
export const approvalRule=z.object({id:z.string().min(1).max(80),name:z.string().trim().min(2).max(100),enabled:z.boolean().default(true),priority:z.number().int().min(1).max(999),match:z.enum(['ALL','ANY']).default('ALL'),conditions:z.array(condition).min(1).max(12),steps:z.array(step).min(1).max(10)}).strict();
export const approvalRules=z.array(approvalRule).max(100);
export type ApprovalRule=z.infer<typeof approvalRule>;
export type ApprovalInput={invoice_amount:number;currency:string;variance_percent:number;department:string;invoice_type:string;vendor_match:boolean;po_match:boolean;duplicate:boolean;risk_flag:boolean};
export type ApprovalCandidate={workos_user_id:string;status:string;role:string;approval_limit:number|null;approval_currency:string;approval_categories:string[]};
export type ApprovalRole={role_key:string;permissions:string[]};
/** Returns only active members who can approve invoices within the requested authority. */
export function eligibleApprovalUsers<T extends ApprovalCandidate,R extends ApprovalRole>(users:T[],roles:R[],currency:string,authorityLimit:number):T[]{
 if(!Number.isFinite(authorityLimit)||authorityLimit<0)return [];
 const approverRoles=new Set(roles.filter(role=>role.permissions.includes('invoices.approve')).map(role=>role.role_key));
 return users.filter(user=>user.status==='ACTIVE'&&approverRoles.has(user.role)&&user.approval_limit!==null&&Number.isFinite(Number(user.approval_limit))&&Number(user.approval_limit)>=authorityLimit&&user.approval_currency===currency&&user.approval_categories?.includes('INVOICES'));
}
export function eligibleApprovalRoles<T extends ApprovalCandidate,R extends ApprovalRole>(users:T[],roles:R[],currency:string,authorityLimit:number):R[]{
 const eligibleUsers=new Set(eligibleApprovalUsers(users,roles,currency,authorityLimit).map(user=>user.role));
 return roles.filter(role=>eligibleUsers.has(role.role_key));
}
/** Counts active invoice approvers with an explicit usable authority limit. */
export function countInvoiceApprovers<T extends ApprovalCandidate,R extends ApprovalRole>(users:T[],roles:R[]):number{
 const approverRoles=new Set(roles.filter(role=>role.permissions.includes('invoices.approve')).map(role=>role.role_key));
 return users.filter(user=>user.status==='ACTIVE'&&approverRoles.has(user.role)&&user.approval_limit!==null&&Number.isFinite(Number(user.approval_limit))&&Number(user.approval_limit)>=0&&user.approval_categories?.includes('INVOICES')).length;
}
function compare(actual:unknown,operator:typeof conditionOperators[number],expected:unknown){
 if(operator==='IS_TRUE')return actual===true;if(operator==='IS_FALSE')return actual===false;
 if(operator==='GT'||operator==='GTE'||operator==='LT'||operator==='LTE'){
  if(typeof actual!=='number'||typeof expected!=='number')return false;
  return operator==='GT'?actual>expected:operator==='GTE'?actual>=expected:operator==='LT'?actual<expected:actual<=expected;
 }
 if(typeof actual==='string'&&typeof expected==='string'){
  if(operator==='EQ')return actual.toLowerCase()===expected.toLowerCase();if(operator==='NEQ')return actual.toLowerCase()!==expected.toLowerCase();if(operator==='CONTAINS')return actual.toLowerCase().includes(expected.toLowerCase());
 }
 if(typeof actual==='boolean'&&typeof expected==='boolean')return operator==='EQ'?actual===expected:operator==='NEQ'?actual!==expected:false;
 if(typeof actual==='number'&&typeof expected==='number')return operator==='EQ'?actual===expected:operator==='NEQ'?actual!==expected:false;
 return false;
}
export function evaluateApprovalRules(rules:ApprovalRule[],input:ApprovalInput){
 const ordered=[...rules].filter(rule=>rule.enabled).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
 const evaluations=ordered.map(rule=>{const checks=rule.conditions.map(condition=>({field:condition.field,matched:compare(input[condition.field],condition.operator,condition.value)}));const matched=rule.match==='ALL'?checks.every(check=>check.matched):checks.some(check=>check.matched);return {ruleId:rule.id,name:rule.name,priority:rule.priority,matched,checks,steps:rule.steps}});
 const matching=evaluations.filter(result=>result.matched);const first=matching[0];const conflict=!!first&&matching.some(item=>item.priority===first.priority&&item.ruleId!==first.ruleId);
 return {evaluations,conflict,matchedRule:conflict?null:first??null,route:conflict?[]:first?.steps??[],status:conflict?'CONFLICT':first?'REQUIRES_APPROVAL':'NO_APPROVAL_RULE'} as const;
}
