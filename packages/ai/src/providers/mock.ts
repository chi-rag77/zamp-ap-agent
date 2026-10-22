import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InvoiceVisionInput, VisionModelProvider, VisionResult } from './vision-model';
import { ExtractedInvoiceSchema } from '../schema';

const fixtureByHint:Record<string,string>={'INV-1048':'perfect-invoice.json','INV-1047':'perfect-invoice.json','INV-1042':'missing-po.json','INV-1041':'low-confidence.json'};
export class MockVisionProvider implements VisionModelProvider {
  constructor(private fixtureDir=join(process.cwd(),'tests/fixtures')){}
  async extractInvoice(input:InvoiceVisionInput):Promise<VisionResult>{
    const name=fixtureByHint[input.hint??'']??'perfect-invoice.json';
    const rawResponse=await readFile(join(this.fixtureDir,name),'utf8');
    return {extraction:ExtractedInvoiceSchema.parse(JSON.parse(rawResponse)),rawResponse,model:'mock-fixture',provider:'MOCK',finishReason:'stop',latencyMs:0};
  }
}
