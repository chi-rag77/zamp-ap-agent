import type { InvoiceVisionInput, VisionModelProvider, VisionResult } from './vision-model';
import { ExtractedInvoiceSchema } from '../schema';
import perfect from '../../../../tests/fixtures/perfect-invoice.json';
import missingPo from '../../../../tests/fixtures/missing-po.json';
import lowConfidence from '../../../../tests/fixtures/low-confidence.json';

const fixtureByHint:Record<string,unknown>={'INV-1048':perfect,'INV-1047':perfect,'INV-1042':missingPo,'INV-1041':lowConfidence};
export class MockVisionProvider implements VisionModelProvider {
  async extractInvoice(input:InvoiceVisionInput):Promise<VisionResult>{
    const rawResponse=JSON.stringify(fixtureByHint[input.hint??'']??perfect);
    return {extraction:ExtractedInvoiceSchema.parse(JSON.parse(rawResponse)),rawResponse,model:'mock-fixture',provider:'MOCK',finishReason:'stop',latencyMs:0};
  }
}
