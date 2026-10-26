import {describe,it,expect} from 'vitest';
import {prepareImport,suggestMapping} from '../../packages/objects/src/import';
const row={vendor_code:'AC-1',legal_name:'Acme Ltd',display_name:'Acme',currency:'INR'};
const mapping=Object.fromEntries(Object.keys(row).map(k=>[k,k]));
describe('reviewed object imports',()=>{
 it('suggests only exact normalized field names',()=>expect(suggestMapping(['Vendor Code','Legal Name','Unknown'],'vendor')).toEqual({'Vendor Code':'vendor_code','Legal Name':'legal_name',Unknown:''}));
 it('validates a vendor without altering source values',()=>{const r=prepareImport('vendor',[row],mapping);expect(r[0].errors).toEqual([]);expect(r[0].data).toEqual(row)});
 it('rejects duplicate rows',()=>expect(prepareImport('vendor',[row,row],mapping)[1].errors).toContain('Duplicate identifier in this file'));
 it('requires all canonical values',()=>expect(prepareImport('vendor',[{vendor_code:'A'}],{vendor_code:'vendor_code'})[0].errors.length).toBeGreaterThan(0));
 it('cannot map financial approval or status',()=>expect(()=>prepareImport('vendor',[row],{...mapping,currency:'status'})).toThrow('protected'));
 it('rejects duplicate mapping targets',()=>expect(()=>prepareImport('vendor',[row],{...mapping,legal_name:'display_name'})).toThrow('only once'));
 it('rejects mismatched totals',()=>{const invoice={invoice_number:'I1',vendor_id:'11111111-1111-4111-8111-111111111111',po_id:'22222222-2222-4222-8222-222222222222',invoice_date:'2026-10-25',currency:'INR',subtotal:'10',tax:'2',total:'99'};expect(prepareImport('invoice',[invoice],Object.fromEntries(Object.keys(invoice).map(k=>[k,k])))[0].errors).toContain('Subtotal plus tax must equal total')});
 it('rejects malformed references',()=>{const payment={payment_number:'P1',invoice_id:'wrong',vendor_id:'wrong',currency:'INR',amount:'-1'};expect(prepareImport('payment',[payment],Object.fromEntries(Object.keys(payment).map(k=>[k,k])))[0].errors).toHaveLength(3)});
});
