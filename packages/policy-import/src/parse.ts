import {TextDecoder} from 'node:util';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import {PDFParse} from 'pdf-parse';
import {parse as parseCsv} from 'csv-parse/sync';
import {prepareDocument} from '@zamp/document';

export type PolicyMime='application/pdf'|'application/vnd.openxmlformats-officedocument.wordprocessingml.document'|'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'|'application/vnd.ms-excel'|'text/csv'|'image/png'|'image/jpeg';
export type ParsedChunk={index:number;content:string;pageNumber?:number;sheetName?:string;cellRange?:string;section?:string;image?:Buffer};
export type ParsedPolicyDocument={mimeType:PolicyMime;pageCount?:number;sheetCount?:number;chunks:ParsedChunk[]};
const run=promisify(execFile);
const MAX_BYTES=20*1024*1024;
const MAX_TEXT=160000;
const zip=Buffer.from([0x50,0x4b,0x03,0x04]);
const ole=Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
export function detectPolicyMime(bytes:Buffer,filename:string,claimedMime?:string):PolicyMime{
  if(!bytes.length||bytes.length>MAX_BYTES)throw new Error('Policy file is empty or exceeds 20 MB');
  const ext=filename.toLowerCase().split('.').pop();let detected:PolicyMime;
  if(bytes.subarray(0,5).toString()==='%PDF-')detected='application/pdf';
  else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))detected='image/png';
  else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)detected='image/jpeg';
  else if(bytes.subarray(0,4).equals(zip)){
    if(bytes.includes(Buffer.from('word/document.xml')))detected='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if(bytes.includes(Buffer.from('xl/workbook.xml')))detected='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else throw new Error('Unsupported ZIP document');
  }else if(bytes.subarray(0,8).equals(ole))detected='application/vnd.ms-excel';
  else {if(ext!=='csv'||bytes.includes(0))throw new Error('Unsupported policy document');new TextDecoder('utf-8',{fatal:true}).decode(bytes);detected='text/csv'}
  const extensions:Record<PolicyMime,string[]>={'application/pdf':['pdf'],'image/png':['png'],'image/jpeg':['jpg','jpeg'],'application/vnd.openxmlformats-officedocument.wordprocessingml.document':['docx'],'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':['xlsx'],'application/vnd.ms-excel':['xls'],'text/csv':['csv']};
  if(!extensions[detected].includes(ext??''))throw new Error('File extension does not match its content');
  if(claimedMime&&claimedMime!=='application/octet-stream'&&claimedMime!==detected&&!(detected==='image/jpeg'&&claimedMime==='image/jpg')&&!(detected==='text/csv'&&claimedMime==='application/vnd.ms-excel'))throw new Error('Claimed file type does not match its content');
  return detected;
}
function textChunks(text:string,section:string,extras:Partial<ParsedChunk>={}):ParsedChunk[]{
  const normalized=text.replace(/\r\n?/g,'\n').trim();if(!normalized)throw new Error('No readable policy content found');if(normalized.length>MAX_TEXT)throw new Error('Policy text exceeds 160,000 characters');
  const chunks:ParsedChunk[]=[];for(let start=0;start<normalized.length;start+=6000)chunks.push({index:chunks.length,content:normalized.slice(start,start+6000),section,...extras});return chunks;
}
async function parseWorkbook(bytes:Buffer):Promise<ParsedPolicyDocument>{
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  if(workbook.worksheets.length>20)throw new Error('Spreadsheet exceeds 20 sheets');
  let cells=0;const chunks:ParsedChunk[]=[];
  for(const sheet of workbook.worksheets){const header=sheet.getRow(1).values?.toString()??'';let batch:string[]=[];let first=1;sheet.eachRow({includeEmpty:false},(row,rowNumber)=>{cells+=row.cellCount;if(cells>5000)throw new Error('Spreadsheet exceeds 5,000 cells');const values: string[]=[];row.eachCell({includeEmpty:false},(cell,col)=>{const value=cell.text||String(cell.value??'');if(value.trim())values.push(`${sheet.getColumn(col).letter}${rowNumber}: ${value.slice(0,500)}`)});if(values.length)batch.push(values.join(' | '));if(batch.length===20){chunks.push({index:chunks.length,content:`Sheet ${sheet.name}\nHeader: ${header}\n${batch.join('\n')}`.slice(0,12000),sheetName:sheet.name,cellRange:`A${first}:${sheet.getColumn(Math.max(row.cellCount,1)).letter}${rowNumber}`});batch=[];first=rowNumber+1}});if(batch.length)chunks.push({index:chunks.length,content:`Sheet ${sheet.name}\nHeader: ${header}\n${batch.join('\n')}`.slice(0,12000),sheetName:sheet.name,cellRange:`A${first}:${sheet.getColumn(Math.max(sheet.columnCount,1)).letter}${sheet.rowCount}`})}
  if(!chunks.length)throw new Error('Spreadsheet contains no readable cells');return {mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',sheetCount:workbook.worksheets.length,chunks};
}
async function convertLegacyXls(bytes:Buffer):Promise<Buffer>{
  const dir=await mkdtemp(join(tmpdir(),'zamp-policy-xls-'));
  try{const input=join(dir,'policy.xls');await writeFile(input,bytes,{mode:0o600});const profile=join(dir,'lo-profile');await run(process.env.POLICY_SOFFICE_PATH??'soffice',[`-env:UserInstallation=file://${profile}`,'--headless','--convert-to','xlsx','--outdir',dir,input],{timeout:45000,maxBuffer:1024*1024});return await readFile(join(dir,'policy.xlsx'))}finally{await rm(dir,{recursive:true,force:true})}
}
export async function parsePolicyDocument(bytes:Buffer,filename:string,claimedMime?:string):Promise<ParsedPolicyDocument>{
  const mime=detectPolicyMime(bytes,filename,claimedMime);
  if(mime==='text/csv'){const rows=parseCsv(bytes.toString('utf8'),{bom:true,skip_empty_lines:true,relax_column_count:true}) as string[][];if(rows.length>5000)throw new Error('CSV exceeds 5,000 rows');return {mimeType:mime,sheetCount:1,chunks:textChunks(rows.map((row,i)=>`${i+1}: ${row.map(v=>String(v).slice(0,500)).join(' | ')}`).join('\n'),'CSV rows',{sheetName:filename,cellRange:`A1:${rows.length}`})}}
  if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){const result=await mammoth.extractRawText({buffer:bytes});return {mimeType:mime,chunks:textChunks(result.value,'Word document')}}
  if(mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')return parseWorkbook(bytes);
  if(mime==='application/vnd.ms-excel'){const parsed=await parseWorkbook(await convertLegacyXls(bytes));return {...parsed,mimeType:mime}}
  if(mime==='image/png'||mime==='image/jpeg'){const prepared=await prepareDocument({bytes,mimeType:mime,filename});return {mimeType:mime,pageCount:1,chunks:[{index:0,pageNumber:1,content:'Image policy page',image:prepared.pages[0].bytes}]}}
  const parser=new PDFParse({data:bytes});
  try{const info=await parser.getInfo();if(info.total<1||info.total>20)throw new Error('PDF must contain 1–20 pages');const chunks:ParsedChunk[]=[];let readable=0;for(let page=1;page<=info.total;page++){const result=await parser.getText({partial:[page]});const content=result.text.trim();if(content.length>=20){readable++;chunks.push({index:chunks.length,pageNumber:page,content:content.slice(0,12000)})}}
    if(readable===info.total)return {mimeType:mime,pageCount:info.total,chunks};
    const prepared=await prepareDocument({bytes,mimeType:mime,filename});const seen=new Set(chunks.map(c=>c.pageNumber));for(const page of prepared.pages)if(!seen.has(page.pageNumber))chunks.push({index:chunks.length,pageNumber:page.pageNumber,content:`Scanned PDF page ${page.pageNumber}`,image:page.bytes});chunks.sort((a,b)=>(a.pageNumber??0)-(b.pageNumber??0));chunks.forEach((chunk,i)=>chunk.index=i);return {mimeType:mime,pageCount:info.total,chunks};
  }finally{await parser.destroy()}
}
