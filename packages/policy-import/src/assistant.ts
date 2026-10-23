import {getPolicyImport} from './service';
import {RuleSchema} from './schema';
type Data=Awaited<ReturnType<typeof getPolicyImport>>;
export type GeneratedPolicyTest={ruleId:string;ruleName:string;input:string;expected:'TRIGGER'|'NO_TRIGGER';reason:string};
export function generatePolicyTests(data:Data):GeneratedPolicyTest[]{
  const tests:GeneratedPolicyTest[]=[];
  for(const row of data.rules){if(row.status!=='APPROVED')continue;const parsed=RuleSchema.safeParse(row.final_rule);if(!parsed.success)continue;const rule=parsed.data;
    if(typeof rule.value==='number'&&['GT','GTE','LT','LTE'].includes(rule.operator)){
      const epsilon=rule.key==='minExtractionConfidence'?.001:.01;
      for(const amount of [Math.max(0,rule.value-epsilon),rule.value,rule.value+epsilon]){
        const trigger=rule.operator==='GT'?amount>rule.value:rule.operator==='GTE'?amount>=rule.value:rule.operator==='LT'?amount<rule.value:amount<=rule.value;
        tests.push({ruleId:row.id,ruleName:rule.name,input:`${rule.currency??(rule.key.includes('Percent')?'%':'')} ${Number(amount.toFixed(3))}`.trim(),expected:trigger?'TRIGGER':'NO_TRIGGER',reason:`${rule.key} ${rule.operator} ${rule.value}`});
      }
    }else if(typeof rule.value==='boolean'&&rule.operator==='EQ')for(const value of [false,true])tests.push({ruleId:row.id,ruleName:rule.name,input:`${rule.key} = ${value}`,expected:value===rule.value?'TRIGGER':'NO_TRIGGER',reason:`${rule.key} equals ${rule.value}`});
  }
  return tests;
}
export function answerPolicyQuestion(data:Data,question:string){
  const q=question.trim().toLowerCase();if(q.length<3||q.length>500)throw new Error('Ask a question between 3 and 500 characters');
  const citations:{documentId:string;filename:string;quote:string}[]=[];
  const cite=(rows:typeof data.rules)=>{for(const row of rows)for(const item of row.source_evidence??[])if(item&&typeof item==='object'&&'documentId' in item&&'filename' in item&&'quote' in item)citations.push({documentId:String(item.documentId),filename:String(item.filename),quote:String(item.quote)})};
  if(/ambigu|clarif|unclear|question/.test(q)){const issues=data.issues.filter(i=>i.issue_type==='AMBIGUITY'&&i.status==='OPEN');return {answer:issues.length?issues.map(i=>i.description).join('\n'):'No open ambiguity questions were found.',citations}}
  if(/conflict|disagree|contradic/.test(q)){const issues=data.issues.filter(i=>i.issue_type==='CONFLICT'&&i.status==='OPEN');return {answer:issues.length?issues.map(i=>i.description).join('\n'):'No open document conflicts were found.',citations}}
  if(/test|boundary/.test(q)){const tests=generatePolicyTests(data);return {answer:tests.length?`Generated ${tests.length} boundary cases for approved rules. Open Test cases below to inspect them.`:'Approve rules first to generate boundary cases.',citations}}
  if(/simulat|impact|invoice/.test(q)&&data.simulation){const sim=data.simulation;return {answer:`The latest simulation covered ${sim.invoice_count} recent invoices and changed ${Array.isArray(sim.decision_diffs)?sim.decision_diffs.length:0} decisions.`,citations}}
  if(/approval|amount|threshold|limit/.test(q)){const rows=data.rules.filter(r=>{const parsed=RuleSchema.safeParse(r.final_rule);return parsed.success&&['invoiceAmountReview','maxPriceVariancePercent','maxQuantityVariancePercent','maxTotalVariancePercent'].includes(parsed.data.key)});cite(rows);return {answer:rows.length?rows.map(r=>{const rule=RuleSchema.parse(r.final_rule);return `${rule.name}: ${rule.key} ${rule.operator} ${rule.currency??''} ${rule.value} → ${rule.action} (${r.status.toLowerCase()}).`}).join('\n'):'No approval or threshold rules were extracted.',citations}}
  if(/source|why|evidence/.test(q)){cite(data.rules);return {answer:data.rules.length?`Each proposed rule is linked to an exact quote in its source document. Select “View original” on a rule card to inspect the file.`:'No rules with source evidence were extracted.',citations}}
  if(/chang|edit|make|set|update/.test(q))return {answer:'Edit the proposed rule in its card, save the change, and approve it. The original AI interpretation stays in the audit record. Simulate the reviewed draft before activation.',citations};
  return {answer:`This package contains ${data.documents.length} documents, ${data.rules.length} proposed rules, and ${data.issues.filter(i=>i.status==='OPEN').length} open questions. Ask about approval rules, conflicts, ambiguities, source evidence, test cases, or simulation.`,citations};
}
