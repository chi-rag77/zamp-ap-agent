import {PolicyConfigurationSchema,type PolicyConfiguration} from '@zamp/policy';
import {RuleSchema,type ImportedRule} from './schema';
export type CompileResult={configuration:PolicyConfiguration;changes:string[]};
export function compileImportedRules(rules:ImportedRule[],base:PolicyConfiguration):CompileResult{
  const configuration=structuredClone(PolicyConfigurationSchema.parse(base));const changes:string[]=[];
  for(const candidate of rules){const r=RuleSchema.parse(candidate);const value=typeof r.value==='number'?r.value:NaN;
    if(r.scope&&!/^(all|global|all invoices|all vendors)$/i.test(r.scope.trim()))throw new Error(`Rule “${r.name}” has a limited scope that this policy engine cannot apply safely`);
    switch(r.key){
      case 'requiresPo':case 'requireVendorMatch':case 'requireCurrencyMatch':{
        if(r.operator!=='EQ'||typeof r.value!=='boolean'||r.action!=='NEEDS_REVIEW')throw new Error(`Rule “${r.name}” cannot be compiled safely`);
        configuration.autoApproval[r.key]=r.value;changes.push(`${r.key} = ${r.value}`);break;
      }
      case 'maxPriceVariancePercent':case 'maxQuantityVariancePercent':case 'maxTotalVariancePercent':{
        if(r.operator!=='GT'||r.action!=='NEEDS_REVIEW'||!Number.isFinite(value)||value<0||value>100)throw new Error(`Rule “${r.name}” needs a percent limit with > and review action`);
        configuration.autoApproval[r.key]=value;changes.push(`${r.key} = ${value}%`);break;
      }
      case 'minExtractionConfidence':{
        if(r.operator!=='LT'||r.action!=='NEEDS_REVIEW'||!Number.isFinite(value)||value<0||value>1)throw new Error(`Rule “${r.name}” needs a 0–1 confidence threshold with < and review action`);
        configuration.autoApproval.minExtractionConfidence=value;changes.push(`minExtractionConfidence = ${value}`);break;
      }
      case 'confirmedDuplicate':case 'blockedVendor':{
        if(r.operator!=='EQ'||r.value!==true||r.action!=='AUTO_REJECT')throw new Error(`Rule “${r.name}” cannot trigger automatic rejection without explicit evidence`);
        configuration.rejection[r.key]=true;changes.push(`${r.key} = auto reject`);break;
      }
      case 'invoiceAmountReview':{
        if(!['GT','GTE'].includes(r.operator)||!['MANAGER_REVIEW','FINANCE_REVIEW','CFO_REVIEW'].includes(r.action)||!Number.isFinite(value)||value<0||!r.currency)throw new Error(`Rule “${r.name}” needs a currency, amount, review role and > or ≥ operator`);
        if(configuration.approvalMatrix&&configuration.approvalMatrix.currency!==r.currency)throw new Error('Approval matrices with different currencies require separate scoped policies');
        const role=r.action.replace('_REVIEW','') as 'MANAGER'|'FINANCE'|'CFO';
        if(!configuration.approvalMatrix)configuration.approvalMatrix={currency:r.currency,reviewTiers:[]};
        configuration.approvalMatrix.reviewTiers.push({minimumAmount:value,operator:r.operator as 'GT'|'GTE',role});changes.push(`invoice amount ${r.operator} ${r.currency} ${value} → ${role} review`);break;
      }
      default:throw new Error(`Rule “${r.name}” uses an unsupported policy key`);
    }
  }
  if(configuration.approvalMatrix){const tiers=configuration.approvalMatrix.reviewTiers.sort((a,b)=>a.minimumAmount-b.minimumAmount);const duplicates=new Set<string>();for(const t of tiers){const key=`${t.minimumAmount}:${t.operator}`;if(duplicates.has(key))throw new Error('Approval matrix has duplicate thresholds');duplicates.add(key)}}
  PolicyConfigurationSchema.parse(configuration);return {configuration,changes};
}
