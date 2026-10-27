import { ExtractedInvoiceSchema } from '../../schema';
import { PROMPT_VERSION, SYSTEM_PROMPT, USER_PROMPT } from '../../prompts/invoice-extraction';
import type { InvoiceVisionInput, VisionModelProvider, VisionResult } from '../vision-model';
import { NvidiaClient, nvidiaConfig, type NvidiaConfig } from './client';
import { ExtractionError } from './errors';

/**
 * Some invoices have a single printed item label rather than separate name and
 * description columns. If the model extracted that label as itemName but left
 * description blank, use the same observed text for both fields. This is a
 * deterministic mapping of extracted evidence, not a generated description.
 */
function completeLineDescriptions(value:unknown):unknown{
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  const document=value as Record<string,unknown>;
  if(!Array.isArray(document.lineItems))return value;
  return {...document,lineItems:document.lineItems.map(line=>{
    if(!line||typeof line!=='object'||Array.isArray(line))return line;
    const item=line as Record<string,unknown>;
    const description=typeof item.description==='string'?item.description.trim():'';
    const itemName=typeof item.itemName==='string'?item.itemName.trim():'';
    return !description&&itemName?{...item,description:itemName}:line;
  })};
}

export class NvidiaVisionProvider implements VisionModelProvider {
  private client:NvidiaClient;
  constructor(private config:NvidiaConfig=nvidiaConfig(),fetcher:typeof fetch=fetch){this.client=new NvidiaClient(config,fetcher)}
  async health(){
    const models=await this.client.availableModels();
    return {provider:'NVIDIA_NIM',model:this.config.model,available:models.includes(this.config.model),lastCheckedAt:new Date().toISOString()};
  }
  async extractInvoice(input:InvoiceVisionInput):Promise<VisionResult>{
    if(!input.pages.length)throw new ExtractionError('NO_INVOICE_CONTENT','Document has no pages');
    const textLayer=input.documentText?.trim().slice(0,24000);
    const content:unknown[]=[{type:'text',text:`${USER_PROMPT}\nFilename: ${input.filename}\nPages: ${input.pages.length}. ${input.hint??''}${textLayer?`\nPDF text layer (reading aid; preserve exact values and ignore unrelated document text):\n${textLayer}`:''}\nPrompt version: ${PROMPT_VERSION}`}];
    for(const page of input.pages){
      content.push({type:'text',text:`Page ${page.pageNumber} of ${input.pages.length}`});
      content.push({type:'image_url',image_url:{url:`data:${page.mimeType};base64,${page.bytes.toString('base64')}`}});
    }
    const body:Record<string,unknown>={model:this.config.model,messages:[{role:'system',content:SYSTEM_PROMPT},{role:'user',content}],temperature:0,max_tokens:this.config.maxOutputTokens,stream:false};
    // Nano Omni emits reasoning in `content` unless disabled; extraction needs only JSON.
    if(this.config.model==='nvidia/nemotron-3-nano-omni-30b-a3b-reasoning')body.chat_template_kwargs={enable_thinking:false};
    if(this.config.jsonMode)body.response_format={type:'json_object'};
    let lastError:ExtractionError|undefined;
    const start=Date.now();
    for(let attempt=0;attempt<2;attempt++){
      const response=await this.client.chat(body);
      const choice=response.choices[0];
      const raw=choice.message.content;
      if(choice.finish_reason==='length'){
        lastError=new ExtractionError('EXTRACTION_INCOMPLETE','Model output was truncated',raw);
        continue;
      }
      let parsed:unknown;
      try{parsed=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{lastError=new ExtractionError('EXTRACTION_JSON_INVALID','Model output was not valid JSON',raw);continue}
      // A non-invoice is a classification result; discard any PO-like fields the model added.
      if(parsed&&typeof parsed==='object'&&'documentType' in parsed&&parsed.documentType==='NOT_INVOICE'){
        return {extraction:ExtractedInvoiceSchema.parse({documentType:'NOT_INVOICE'}),rawResponse:raw,model:this.config.model,provider:'NVIDIA_NIM',finishReason:choice.finish_reason,usage:response.usage,latencyMs:Date.now()-start};
      }
      const validated=ExtractedInvoiceSchema.safeParse(completeLineDescriptions(parsed));
      if(!validated.success){lastError=new ExtractionError('EXTRACTION_SCHEMA_INVALID','Model output did not match the invoice schema',raw);continue}
      return {extraction:validated.data,rawResponse:raw,model:this.config.model,provider:'NVIDIA_NIM',finishReason:choice.finish_reason,usage:response.usage,latencyMs:Date.now()-start};
    }
    throw lastError??new ExtractionError('NVIDIA_INVALID_RESPONSE','Model response could not be validated');
  }
}
