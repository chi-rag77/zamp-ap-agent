import {RuleSchema,type AnalyzedRule,type ImportIssue,type ModelResult,type SourceEvidence} from './schema';
import type {ParsedChunk} from './parse';
export function normalizeQuote(text:string){return text.replace(/\s+/g,' ').trim().toLowerCase()}
export function buildRule(result:ModelResult,chunk:ParsedChunk,documentId:string,filename:string):{rules:AnalyzedRule[];issues:ImportIssue[]}{
  const source=chunk.image?result.transcription??'':chunk.content;
  const rules:AnalyzedRule[]=[],issues:ImportIssue[]=[];
  for(const raw of result.rules){const parsed=RuleSchema.safeParse(raw);if(!parsed.success)continue;const rule=parsed.data;const evidence:SourceEvidence={documentId,filename,chunkIndex:chunk.index,quote:rule.sourceQuote,pageNumber:chunk.pageNumber,sheetName:chunk.sheetName,cellRange:chunk.cellRange,section:chunk.section};
    const verified=normalizeQuote(source).includes(normalizeQuote(rule.sourceQuote));
    const confidenceLevel=rule.confidence>=.95&&verified?'HIGH':rule.confidence>=.8&&verified?'MEDIUM':'LOW';
    rules.push({rule,evidence:[evidence],documentId,confidenceLevel,verifiedQuote:verified});
    if(!verified)issues.push({type:'AMBIGUITY',description:`Source quote for “${rule.name}” could not be verified in ${filename}.`,ruleIndexes:[rules.length-1],evidence:[evidence]});
    else if(confidenceLevel==='LOW')issues.push({type:'AMBIGUITY',description:`Low-confidence rule “${rule.name}” needs explicit confirmation.`,ruleIndexes:[rules.length-1],evidence:[evidence]});
  }
  for(const a of result.ambiguities)issues.push({type:'AMBIGUITY',description:`${a.statement} Clarify: ${a.question}`,ruleIndexes:[],evidence:[{documentId,filename,chunkIndex:chunk.index,quote:a.statement,pageNumber:chunk.pageNumber,sheetName:chunk.sheetName,cellRange:chunk.cellRange}]});
  for(const statement of result.unsupportedStatements)issues.push({type:'UNSUPPORTED',description:statement,ruleIndexes:[],evidence:[{documentId,filename,chunkIndex:chunk.index,quote:statement,pageNumber:chunk.pageNumber,sheetName:chunk.sheetName,cellRange:chunk.cellRange}]});
  return {rules,issues};
}
export function detectConflicts(rules:AnalyzedRule[]):ImportIssue[]{
  const issues:ImportIssue[]=[];const groups=new Map<string,number[]>();rules.forEach((entry,index)=>{const r=entry.rule;const key=`${r.key}|${r.scope??''}|${r.key==='invoiceAmountReview'?String(r.value):''}`;groups.set(key,[...(groups.get(key)??[]),index])});
  for(const [key,indexes] of groups){if(indexes.length<2)continue;const first=rules[indexes[0]].rule;const incompatible=indexes.filter(i=>{const r=rules[i].rule;return r.action!==first.action||r.operator!==first.operator||r.value!==first.value});if(incompatible.length)issues.push({type:'CONFLICT',description:`Documents disagree on ${key.split('|')[0]}: ${indexes.map(i=>`${rules[i].evidence[0].filename} says ${rules[i].rule.operator} ${rules[i].rule.value} → ${rules[i].rule.action}`).join('; ')}`,ruleIndexes:indexes,evidence:indexes.flatMap(i=>rules[i].evidence)})}
  return issues;
}
export function qualityScore(rules:AnalyzedRule[],issues:ImportIssue[]):number{
  if(!rules.length)return 0;const average=rules.reduce((n,r)=>n+r.rule.confidence*(r.verifiedQuote?1:.5),0)/rules.length;return Math.max(0,Math.min(100,Math.round(average*100-issues.filter(i=>i.type==='CONFLICT').length*10-issues.filter(i=>i.type==='AMBIGUITY').length*5)));
}
