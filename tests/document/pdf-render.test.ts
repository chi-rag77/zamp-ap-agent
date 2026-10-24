import {describe,it,expect} from 'vitest';
import {DocumentError,prepareDocument} from '../../packages/document/src';

function pdfFixture(pageCount=1){
 const content='BT /F1 12 Tf 10 50 Td (Invoice 100) Tj ET';
 const pageIds=Array.from({length:pageCount},(_,i)=>i+3);
 const contentIds=Array.from({length:pageCount},(_,i)=>i+3+pageCount);
 const fontId=3+pageCount*2;
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  `<< /Type /Pages /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
  ...pageIds.map((_,i)=>`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`),
  ...contentIds.map(()=>`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 ];
 let source='%PDF-1.4\n';
 const offsets=[0];
 objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(source,'binary'));source+=`${index+1} 0 obj\n${object}\nendobj\n`});
 const xrefOffset=Buffer.byteLength(source,'binary');
 source+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
 return Buffer.from(source,'binary');
}

describe('serverless PDF preparation',()=>{
 it('counts and renders a valid PDF without system Poppler tools',async()=>{
  const runtime=globalThis as typeof globalThis&{DOMMatrix?:unknown};
  const original=runtime.DOMMatrix;
  Reflect.deleteProperty(runtime,'DOMMatrix');
  try{
  const result=await prepareDocument({bytes:pdfFixture(),mimeType:'application/pdf',filename:'invoice.pdf'});
  expect(result.pages).toHaveLength(1);
  expect(result.pages[0].mimeType).toBe('image/png');
  expect(result.pages[0].bytes.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect(result.text).toContain('Invoice 100');
  }finally{if(original)runtime.DOMMatrix=original}
 });
 it('enforces the configured page limit before rendering',async()=>{
  await expect(prepareDocument({bytes:pdfFixture(2),mimeType:'application/pdf',filename:'invoice.pdf'},{NODE_ENV:'test',MAX_INVOICE_PAGES:'1'})).rejects.toMatchObject({code:'DOCUMENT_TOO_LARGE'} satisfies Partial<DocumentError>);
 });
});
