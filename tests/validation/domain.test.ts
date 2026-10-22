import {describe,it,expect} from 'vitest';
import {MoneySchema,ConfidenceSchema,CurrencySchema,CreateInvoiceSchema,isValidMoney} from '@zamp/validation';

describe('financial and invoice validation',()=>{
  it('accepts exact decimal strings without binary float conversion',()=>{
    for(const value of ['0.01','0.10','1234.5678','999999999.9999'])expect(MoneySchema.parse(value)).toBe(value);
    expect(isValidMoney('-1')).toBe(false);
    expect(MoneySchema.safeParse('12.12345').success).toBe(false);
  });
  it('stores confidence on 0–1 scale',()=>{
    for(const value of ['0','0.710','0.984','1'])expect(ConfidenceSchema.safeParse(value).success).toBe(true);
    for(const value of ['98.4','-0.1','1.0001'])expect(ConfidenceSchema.safeParse(value).success).toBe(false);
  });
  it('requires ISO-style currency and rejects negative totals',()=>{
    expect(CurrencySchema.safeParse('INR').success).toBe(true);
    expect(CurrencySchema.safeParse('₹').success).toBe(false);
    expect(CreateInvoiceSchema.safeParse({source:'DEMO',currency:'INR',total:'-1'}).success).toBe(false);
  });
});
