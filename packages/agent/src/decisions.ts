import type {Decision,PolicyDecision} from '@zamp/policy';
import type {AgentDecision} from './types';
export function agentDecision(decision:Decision):AgentDecision{return decision==='AUTO_APPROVE'?'AUTO_APPROVED':decision==='AUTO_REJECT'?'AUTO_REJECTED':decision}
export const reviewRouting:Readonly<Record<string,string>>={PRICE_VARIANCE_EXCEEDED:'PROCUREMENT',QUANTITY_VARIANCE_EXCEEDED:'PROCUREMENT',MISSING_PURCHASE_ORDER:'PROCUREMENT',AMBIGUOUS_PURCHASE_ORDER:'PROCUREMENT',TAX_MISMATCH:'FINANCE',TOTAL_MISMATCH:'FINANCE',SUBTOTAL_MISMATCH:'FINANCE',TOTAL_VARIANCE_EXCEEDED:'FINANCE',CONFIRMED_DUPLICATE:'AP',POSSIBLE_DUPLICATE:'AP',VENDOR_MISMATCH:'VENDOR_MANAGEMENT',AMBIGUOUS_VENDOR:'VENDOR_MANAGEMENT'};
export function reviewRoute(reasonCode:string){return reviewRouting[reasonCode]??'AP'}
export function reviewPriority(decision:PolicyDecision|'CANNOT_DECIDE'){return decision==='CANNOT_DECIDE'||decision.decision==='CANNOT_DECIDE'?'HIGH':decision.reasonCode==='CONFIRMED_DUPLICATE'?'CRITICAL':'MEDIUM'}
