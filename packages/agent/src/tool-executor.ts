import type {AgentContext} from './types';
import {getRegisteredTool} from './tool-registry';
import {assertToolPermission} from './permissions';
import {assertLimits} from './planner';
import {AgentError,errorCode} from './errors';
import {finishStep,startStep,checkActive,incrementRetry} from './run-manager';
import {retryTransient} from './retry';
export async function executeTool<T=unknown>(context:AgentContext,name:string,rawInput:unknown,stepType:'READ'|'VALIDATION'|'POLICY'|'ACTION'|'VERIFICATION'|'AUDIT'='READ'):Promise<T>{
 await checkActive(context);assertLimits(context);const tool=getRegisteredTool(name);const parsed=tool.inputSchema.safeParse(rawInput);
 if(!parsed.success)throw new AgentError('TOOL_ARGUMENT_INVALID',parsed.error.message);
 assertToolPermission(tool.category,context);
 const input=parsed.data as Record<string,unknown>;
 if('invoiceId' in input&&input.invoiceId!==context.invoiceId)throw new AgentError('TOOL_ARGUMENT_INVALID','Invoice ID mismatch');
 const stepId=await startStep(context,stepType,name,name,{invoiceId:context.invoiceId});const started=Date.now();
 try{const result=await retryTransient(()=>tool.execute(parsed.data,context),()=>incrementRetry(context));if(result===undefined)throw new AgentError('TOOL_EXECUTION_FAILED','Tool returned no result');await finishStep(context,stepId,'COMPLETED',Date.now()-started,{result:compactResult(result)});return result as T}
 catch(error){await finishStep(context,stepId,'FAILED',Date.now()-started,{},errorCode(error,'TOOL_EXECUTION_FAILED'));throw error}
}
function compactResult(result:unknown):Record<string,unknown>{if(!result||typeof result!=='object')return {value:String(result)};const object=result as Record<string,unknown>;return Object.fromEntries(['id','status','decision','reasonCode','runId','engineVersion','reviewCaseId','actual'].filter(k=>k in object).map(k=>[k,object[k]]))}
