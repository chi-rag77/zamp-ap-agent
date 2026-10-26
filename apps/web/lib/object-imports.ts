import 'server-only';
import {NextRequest} from 'next/server';
import {parse} from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import {z} from 'zod';
import {objectTypeSchema,tables,type ObjectType} from '../../../packages/objects/src/schema';
import {prepareImport,suggestMapping,importFields,identityFields} from '../../../packages/objects/src/import';
import {objectRecord,WorkspaceError,type ObjectContext} from './objects';
async function validate(c:ObjectContext,type:ObjectType,rows:Record<string,string>[],mapping:Record<string,string>){
 const results=prepareImport(type,rows,mapping);
 // Cache checks within the job, but revalidate all references again at confirmation.
 const references=new Map<string,Promise<Record<string,unknown>>>();
 for(const r of results){if(r.errors.length)continue;
  for(const [field,t] of [['vendor_id','vendor'],['po_id','purchase_order'],['invoice_id','invoice']] as const){if(!r.data[field])continue;const key=`${t}/${r.data[field]}`;if(!references.has(key))references.set(key,objectRecord(c,t,String(r.data[field])));try{const record=await references.get(key)!;if(t==='purchase_order'&&record.vendor_id!==r.data.vendor_id)r.errors.push('Purchase order belongs to a different vendor');if(t==='invoice'&&record.vendor_id!==r.data.vendor_id)r.errors.push('Invoice belongs to a different vendor')}catch{r.errors.push(`${field}: not found in this organization`)}}
  const existing=await c.db.from(tables[type]).select('id').eq('organization_id',c.organizationId).eq(identityFields[type],r.data[identityFields[type]]).limit(1);if(existing.error)throw new WorkspaceError('Duplicate check failed.',503);if(existing.data?.length)r.errors.push('Identifier already exists; existing records are never overwritten');
 }
 return results;
}
export async function importRequest(c:ObjectContext,request:NextRequest,id?:string){
 if(request.method==='GET'){
  let q=c.db.from('data_import_jobs').select(id?'*':'id,object_type,filename,status,success_count,error_count,created_at').eq('organization_id',c.organizationId).eq('created_by',c.userId);if(id){z.string().uuid().parse(id);q=q.eq('id',id)}const r=await q.order('created_at',{ascending:false}).limit(30);if(r.error)throw new WorkspaceError('Import jobs unavailable.',503);if(id&&!r.data?.length)throw new WorkspaceError('Import not found.',404);return id?r.data![0]:{jobs:r.data};
 }
 if(!id){
  if(Number(request.headers.get('content-length'))>6*1024*1024)throw new WorkspaceError('File exceeds 5 MB.',413);
  const form=await request.formData(),type=objectTypeSchema.parse(form.get('type')),file=form.get('file');if(!(file instanceof File)||file.size>5*1024*1024||!file.size)throw new WorkspaceError('Choose a CSV or XLSX file up to 5 MB.');let rows:Record<string,string>[]=[];
  if(file.name.toLowerCase().endsWith('.csv')){try{rows=parse(await file.text(),{columns:true,bom:true,skip_empty_lines:true,max_record_size:20000,to:501})}catch{throw new WorkspaceError('The CSV file could not be parsed.')}}
  else if(file.name.toLowerCase().endsWith('.xlsx')){const workbook=new ExcelJS.Workbook();try{await workbook.xlsx.load(await file.arrayBuffer());const sheet=workbook.worksheets[0];if(!sheet||sheet.rowCount>501||sheet.columnCount>80)throw new Error();const headers:string[]=[];sheet.getRow(1).eachCell((cell,col)=>{headers[col-1]=cell.text.trim()});if(new Set(headers).size!==headers.length||headers.some(h=>!h))throw new Error();sheet.eachRow((row,index)=>{if(index===1)return;const record:Record<string,string>={};headers.forEach((h,i)=>{const cell=row.getCell(i+1);if(cell.type===ExcelJS.ValueType.Formula)throw new Error();record[h]=cell.value instanceof Date?cell.value.toISOString().slice(0,10):cell.text});rows.push(record)})}catch{throw new WorkspaceError('XLSX must have one header row, unique columns, no formulas, and at most 500 data rows.')}}
  else throw new WorkspaceError('Only CSV and XLSX files are supported.');
  if(!rows.length||rows.length>500||Object.keys(rows[0]).length>80)throw new WorkspaceError('Upload 1–500 rows with at most 80 columns.');
  const mapping=suggestMapping(Object.keys(rows[0]),type);const r=await c.db.from('data_import_jobs').insert({organization_id:c.organizationId,object_type:type,filename:file.name.slice(0,180),created_by:c.userId,status:'MAPPING',rows,mapping}).select('id').single();if(r.error)throw new WorkspaceError('Could not save import.',503);return {...r.data,fields:importFields(type)};
 }
 z.string().uuid().parse(id);const job=await c.db.from('data_import_jobs').select('*').eq('organization_id',c.organizationId).eq('created_by',c.userId).eq('id',id).single();if(job.error)throw new WorkspaceError('Import not found.',404);
 const input=z.object({action:z.enum(['validate','confirm']),mapping:z.record(z.string(),z.string()).optional()}).parse(await request.json());const type=objectTypeSchema.parse(job.data.object_type);
 if(['COMPLETED','PARTIAL','IMPORTING'].includes(job.data.status))return {status:job.data.status,results:job.data.results};
 const mapping=input.action==='validate'?(input.mapping??{}):job.data.mapping;
 if(input.action==='confirm'&&job.data.status!=='READY')throw new WorkspaceError('Validate and preview the mapping first.');
 const results=await validate(c,type,job.data.rows,mapping);
 if(input.action==='validate'||results.some(r=>r.errors.length)){const status=results.some(r=>r.errors.length)?'MAPPING':'READY';const saved=await c.db.from('data_import_jobs').update({mapping,results,status,error_count:results.filter(r=>r.errors.length).length}).eq('organization_id',c.organizationId).eq('id',id).in('status',['MAPPING','READY','FAILED']);if(saved.error)throw new WorkspaceError('Could not save validation.',503);return {status,results,fields:importFields(type)}}
 const imported=await c.db.rpc('commit_object_import',{p_org:c.organizationId,p_job:id,p_actor:c.userId,p_records:results.map(r=>r.data)});if(imported.error)throw new WorkspaceError('Import could not commit. No rows were saved. Revalidate and retry.',409);return {status:'COMPLETED',count:imported.data};
}
