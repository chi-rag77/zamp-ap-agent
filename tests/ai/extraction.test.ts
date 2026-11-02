import { describe,expect,it,vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExtractedInvoiceSchema, extractionQuality, normalizeExtraction, overallConfidence, validateExtraction, NvidiaVisionProvider, type NvidiaConfig } from '../../packages/ai/src/index';
import { validateDocument, DocumentError } from '../../packages/document/src/index';

async function fixture(name:string){return ExtractedInvoiceSchema.parse(JSON.parse(await readFile(join(process.cwd(),'tests/fixtures',name),'utf8')))}
describe('invoice extraction validation',()=>{
  it('normalizes a complete invoice and checks arithmetic',async()=>{
    const invoice=normalizeExtraction(await fixture('perfect-invoice.json'));
    expect(invoice.invoiceDate).toBe('2026-10-20');
    expect(invoice.currency).toBe('INR');
    expect(extractionQuality(invoice)).toBe('COMPLETE');
    expect(validateExtraction(invoice)).toMatchObject({lineItemMath:'PASS',subtotalMath:'PASS',totalMath:'PASS'});
    expect(overallConfidence(invoice)).toBeGreaterThan(0.9);
  });
  it('keeps missing PO as valid extraction',async()=>{expect(extractionQuality(await fixture('missing-po.json'))).toBe('COMPLETE')});
  it('marks low-confidence incomplete data partial',async()=>{expect(extractionQuality(await fixture('low-confidence.json'))).toBe('PARTIAL')});
  it('flags ambiguous dates without guessing',async()=>{const invoice=await fixture('perfect-invoice.json');invoice.invoiceDate='01/02/2026';const value=normalizeExtraction(invoice);expect(value.invoiceDate).toBeNull();expect(value.warnings[0]).toContain('ambiguous')});
  it('does not alter arithmetic mismatches',async()=>{const invoice=await fixture('perfect-invoice.json');invoice.total=112101;const report=validateExtraction(invoice);expect(report.totalMath).toBe('FAIL');expect(invoice.total).toBe(112101)});
  it('rejects wrong field types and confidence beyond 1',async()=>{const invoice=await fixture('perfect-invoice.json');expect(ExtractedInvoiceSchema.safeParse({...invoice,total:{amount:1}}).success).toBe(false);expect(ExtractedInvoiceSchema.safeParse({...invoice,confidence:{total:1.2}}).success).toBe(false)});
  it('accepts percent tax rates and reports bad monetary text without throwing',async()=>{const invoice=await fixture('perfect-invoice.json');expect(ExtractedInvoiceSchema.parse({...invoice,lineItems:[{...invoice.lineItems[0],taxRate:'18%'}]}).lineItems[0].taxRate).toBe(18);expect(ExtractedInvoiceSchema.safeParse({...invoice,total:'not an amount'}).success).toBe(false)});
  it('retains ship-to, item names, and units for the invoice document view',async()=>{const invoice=await fixture('perfect-invoice.json');const parsed=ExtractedInvoiceSchema.parse({...invoice,shipTo:{name:'Receiving',address:'Dock 4'},lineItems:[{...invoice.lineItems[0],itemName:'Pump assembly',uom:'EA'}]});expect(parsed.shipTo).toMatchObject({name:'Receiving',address:'Dock 4'});expect(parsed.lineItems[0]).toMatchObject({itemName:'Pump assembly',uom:'EA'})});
  it('rejects a spoofed MIME type',()=>{expect(()=>validateDocument({bytes:Buffer.from('hello'),mimeType:'application/pdf',filename:'invoice.pdf'})).toThrow(DocumentError)});
  it('accepts a sparse non-invoice classification without inventing invoice fields',()=>{
    const value=ExtractedInvoiceSchema.parse({documentType:'NOT_INVOICE'});
    expect(value.invoiceNumber).toBeNull();expect(value.vendor.name).toBeNull();expect(value.lineItems).toEqual([]);
  });
});
describe('NVIDIA provider',()=>{
  const config:NvidiaConfig={apiKey:'test',baseUrl:'https://example.test/v1',model:'vision-test',timeoutMs:1000,maxAttempts:1,maxOutputTokens:8192,jsonMode:false};
  const input={pages:[{pageNumber:1,mimeType:'image/png' as const,bytes:Buffer.from('fake')}],filename:'test.png'};
  it('sends image content and parses valid JSON',async()=>{
    const invoice=await fixture('perfect-invoice.json');
    const fetcher=vi.fn(async (_url:string,request:RequestInit)=>{
      const body=JSON.parse(String(request.body));expect(body.messages[1].content.some((v:{type:string})=>v.type==='image_url')).toBe(true);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invoice)},finish_reason:'stop'}]}),{status:200});
    });
    const result=await new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice(input);
    expect(result.extraction.invoiceNumber).toBe('INV-1048');
  });
  it('uses the observed item name when a separate line description is blank',async()=>{
    const invoice=await fixture('perfect-invoice.json');
    invoice.lineItems[0].description='';
    invoice.lineItems[0].itemName='Industrial supplies';
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invoice)},finish_reason:'stop'}]}),{status:200}));
    const result=await new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice(input);
    expect(result.extraction.lineItems[0].description).toBe(result.extraction.lineItems[0].itemName);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('turns off Nano Omni reasoning and bounds its JSON output',async()=>{
    const invoice=await fixture('perfect-invoice.json');
    const fetcher=vi.fn(async (_url:string,request:RequestInit)=>{
      const body=JSON.parse(String(request.body));
      expect(body.chat_template_kwargs).toEqual({enable_thinking:false});
      expect(body.max_tokens).toBe(8192);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invoice)},finish_reason:'stop'}]}),{status:200});
    });
    await new NvidiaVisionProvider({...config,model:'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning'},fetcher as typeof fetch).extractInvoice(input);
  });
  it('accepts null or omitted party fields and formatted INR amounts from model output',async()=>{
    const fixtureInvoice=await fixture('perfect-invoice.json');
    const invoice={...fixtureInvoice,vendor:null,buyer:null,shipTo:null,subtotal:'INR 25,000.00',tax:'INR 0.00',total:'INR 25,000.00',lineItems:fixtureInvoice.lineItems.map(line=>({...line,unitPrice:'INR 25,000.00',amount:'INR 25,000.00'}))};
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invoice)},finish_reason:'stop'}]}),{status:200}));
    const result=await new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice(input);
    expect(result.extraction.vendor).toEqual({name:null,gstin:null,taxId:null,address:null});
    expect(result.extraction.buyer).toEqual({name:null,taxId:null,address:null});
    expect(result.extraction.shipTo).toEqual({name:null,taxId:null,address:null});
    expect(result.extraction.total).toBe(25000);
    expect(result.extraction.lineItems[0].unitPrice).toBe(25000);
  });
  it('retries truncated output then fails closed',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'{}'},finish_reason:'length'}]}),{status:200}));
    await expect(new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice(input)).rejects.toMatchObject({code:'EXTRACTION_INCOMPLETE'});
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not retry auth failure',async()=>{
    const fetcher=vi.fn(async()=>new Response('unauthorized',{status:401}));
    await expect(new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice(input)).rejects.toMatchObject({code:'NVIDIA_AUTH_ERROR'});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries a rate limit and succeeds',async()=>{
    const invoice=await fixture('perfect-invoice.json');
    const fetcher=vi.fn().mockResolvedValueOnce(new Response('limited',{status:429,headers:{'retry-after':'0'}})).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invoice)},finish_reason:'stop'}]}),{status:200}));
    const result=await new NvidiaVisionProvider({...config,maxAttempts:2},fetcher as typeof fetch).extractInvoice(input);
    expect(result.extraction.documentType).toBe('INVOICE');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('classifies malformed JSON as an invalid extraction',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'{oops'},finish_reason:'stop'}]}),{status:200}));
    await expect(new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice(input)).rejects.toMatchObject({code:'EXTRACTION_JSON_INVALID'});
  });
  it('accepts a non-invoice classification and discards PO fields',async()=>{
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({documentType:'NOT_INVOICE',poNumber:'PO-884',provenance:{poNumber:'PO-884'}})},finish_reason:'stop'}]}),{status:200}));
    const result=await new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice(input);
    expect(result.extraction.documentType).toBe('NOT_INVOICE');
    expect(result.extraction.poNumber).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('sends every page in order',async()=>{
    const invoice=await fixture('perfect-invoice.json');
    const fetcher=vi.fn(async(_url:string,request:RequestInit)=>{
      const parts=JSON.parse(String(request.body)).messages[1].content;
      expect(parts.filter((v:{type:string})=>v.type==='image_url')).toHaveLength(2);
      expect(parts.filter((v:{type:string;text?:string})=>v.type==='text').map((v:{text:string})=>v.text)).toEqual(expect.arrayContaining(['Page 1 of 2','Page 2 of 2']));
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invoice)},finish_reason:'stop'}]}),{status:200});
    });
    await new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice({...input,pages:[input.pages[0],{...input.pages[0],pageNumber:2}]});
  });
  it('includes PDF text as a bounded reading aid alongside page images',async()=>{
    const invoice=await fixture('perfect-invoice.json');
    const fetcher=vi.fn(async(_url:string,request:RequestInit)=>{
      const parts=JSON.parse(String(request.body)).messages[1].content;
      expect(parts[0].text).toContain('PDF text layer (reading aid');
      expect(parts[0].text).toContain('Invoice No: INV-1048');
      expect(parts.some((v:{type:string})=>v.type==='image_url')).toBe(true);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(invoice)},finish_reason:'stop'}]}),{status:200});
    });
    await new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice({...input,documentText:'Invoice No: INV-1048'});
  });
  it('maps provider timeout',async()=>{
    const fetcher=vi.fn(async()=>{const error=new Error('timed out');error.name='TimeoutError';throw error});
    await expect(new NvidiaVisionProvider(config,fetcher as typeof fetch).extractInvoice(input)).rejects.toMatchObject({code:'NVIDIA_TIMEOUT'});
  });
});
