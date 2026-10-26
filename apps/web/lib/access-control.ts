import 'server-only';
import type {ObjectContext} from './objects';

export const PERMISSIONS=[
  'users.view','users.manage','roles.manage','invoices.view','invoices.edit',
  'invoices.approve','invoices.reject','invoices.override','exceptions.view',
  'exceptions.resolve','exceptions.assign','purchase_orders.view','vendors.view',
  'policies.view','policies.manage','approvals.view','approvals.configure',
  'audit.view','organization.manage',
] as const;
export type Permission=typeof PERMISSIONS[number];
export const DEFAULT_ROLES=[
  {role_key:'OWNER',name:'Owner',description:'Full organization control.',permissions:[...PERMISSIONS]},
  {role_key:'ADMIN',name:'Admin',description:'Manage workspace access and configuration.',permissions:[...PERMISSIONS]},
  {role_key:'FINANCE_ADMIN',name:'Finance admin',description:'Own financial policy and approval configuration.',permissions:['invoices.view','invoices.edit','invoices.approve','invoices.reject','invoices.override','exceptions.view','exceptions.resolve','exceptions.assign','purchase_orders.view','vendors.view','policies.view','policies.manage','approvals.view','approvals.configure','audit.view','users.view']},
  {role_key:'AP_MANAGER',name:'AP manager',description:'Manage invoice operations and review work.',permissions:['invoices.view','invoices.edit','invoices.approve','invoices.reject','invoices.override','exceptions.view','exceptions.resolve','exceptions.assign','purchase_orders.view','vendors.view','policies.view','approvals.view','approvals.configure','users.view']},
  {role_key:'AP_SPECIALIST',name:'AP specialist',description:'Resolve invoice extraction and matching exceptions.',permissions:['invoices.view','invoices.edit','exceptions.view','exceptions.resolve','exceptions.assign','purchase_orders.view','vendors.view','approvals.view']},
  {role_key:'APPROVER',name:'Approver',description:'Decide assigned approval requests within authority.',permissions:['invoices.view','approvals.view','invoices.approve','invoices.reject']},
  {role_key:'REVIEWER',name:'Reviewer',description:'Review and resolve assigned exceptions.',permissions:['invoices.view','exceptions.view','exceptions.resolve','purchase_orders.view','vendors.view']},
  {role_key:'AUDITOR',name:'Auditor',description:'Read-only access to financial records and audit evidence.',permissions:['invoices.view','exceptions.view','purchase_orders.view','vendors.view','policies.view','approvals.view','audit.view']},
  {role_key:'MEMBER',name:'Member',description:'Standard read access.',permissions:['invoices.view','exceptions.view']},
] satisfies {role_key:string;name:string;description:string;permissions:readonly string[]}[];

export async function rolePermissions(c:ObjectContext,role=c.role):Promise<string[]>{
  if(['OWNER','ADMIN'].includes(role))return [...PERMISSIONS];
  const {data,error}=await c.db.from('organization_roles').select('permissions').eq('organization_id',c.organizationId).eq('role_key',role).maybeSingle();
  if(error)throw new Error('Role permissions are unavailable.');
  if(data?.permissions&&Array.isArray(data.permissions))return data.permissions.filter((p):p is string=>typeof p==='string');
  return DEFAULT_ROLES.find(item=>item.role_key===role)?.permissions as string[]??[];
}
export async function requirePermission(c:ObjectContext,permission:Permission){
  if(!(await rolePermissions(c)).includes(permission))throw Object.assign(new Error('Your role does not have permission for this action.'),{status:403});
}
