import {z} from 'zod';
export const objectTypes=['invoice','purchase_order','goods_receipt','vendor','payment'] as const;
export const objectTypeSchema=z.enum(objectTypes);
export type ObjectType=z.infer<typeof objectTypeSchema>;
export const objectLabels:Record<ObjectType,string>={invoice:'Invoice',purchase_order:'Purchase order',goods_receipt:'Goods receipt',vendor:'Vendor',payment:'Payment'};
export const tables:Record<ObjectType,string>={invoice:'invoices',purchase_order:'purchase_orders',goods_receipt:'goods_receipts',vendor:'vendors',payment:'payments'};
export const lineTables:Partial<Record<ObjectType,{table:string;parent:string}>>={invoice:{table:'invoice_lines',parent:'invoice_id'},purchase_order:{table:'purchase_order_lines',parent:'po_id'},goods_receipt:{table:'goods_receipt_lines',parent:'goods_receipt_id'}};
export const fieldTypes=['text','long_text','number','currency','percentage','date','datetime','boolean','select','multi_select','user','organization','vendor','invoice','purchase_order','goods_receipt','file','url','json'] as const;
const key=z.string().regex(/^[a-z][a-z0-9_]{1,63}$/,'Use 2–64 lowercase letters, numbers or underscores').refine(v=>!['constructor','prototype','__proto__'].includes(v),'Reserved key');
const field=z.object({key,label:z.string().trim().min(1).max(100),type:z.enum(fieldTypes),section:key,scope:z.enum(['record','line']),required:z.boolean().default(false),hidden:z.boolean().default(false),searchable:z.boolean().default(false),filterable:z.boolean().default(false),integrationKey:z.string().max(100).default(''),options:z.array(z.string().trim().min(1).max(100)).max(100).default([]),defaultValue:z.unknown().optional(),min:z.number().finite().optional(),max:z.number().finite().optional(),help:z.string().max(250).default('')}).strict();
export type FieldDefinition=z.infer<typeof field>;
export const configurationSchema=z.object({object:objectTypeSchema,sections:z.array(z.object({key,label:z.string().trim().min(1).max(100),scope:z.enum(['record','line'])}).strict()).max(30),fields:z.array(field).max(200)}).strict().superRefine((schema,ctx)=>{
 const keys=new Set<string>(),sectionKeys=new Set<string>();
 for(const [i,s] of schema.sections.entries()){if(sectionKeys.has(s.key))ctx.addIssue({code:'custom',path:['sections',i,'key'],message:'Section keys must be unique'});sectionKeys.add(s.key);if(s.scope==='line'&&!lineTables[schema.object])ctx.addIssue({code:'custom',path:['sections',i,'scope'],message:'This object has no line items'});}
 for(const [i,f] of schema.fields.entries()){
  const id=`${f.scope}.${f.key}`;if(keys.has(id))ctx.addIssue({code:'custom',path:['fields',i,'key'],message:'Field keys must be unique within their scope'});keys.add(id);
  if(!schema.sections.some(s=>s.key===f.section&&s.scope===f.scope))ctx.addIssue({code:'custom',path:['fields',i,'section'],message:'Choose a section with the same scope'});
  if(f.min!==undefined&&f.max!==undefined&&f.min>f.max)ctx.addIssue({code:'custom',path:['fields',i,'min'],message:'Minimum exceeds maximum'});
  if(['select','multi_select'].includes(f.type)&&(!f.options.length||new Set(f.options).size!==f.options.length))ctx.addIssue({code:'custom',path:['fields',i,'options'],message:'Supply unique choices'});
  if(f.hidden&&f.required)ctx.addIssue({code:'custom',path:['fields',i],message:'A required field cannot be hidden'});
  if(f.defaultValue!==undefined){const error=validateField(f,f.defaultValue);if(error)ctx.addIssue({code:'custom',path:['fields',i,'defaultValue'],message:error});}
 }
});
export type ObjectConfiguration=z.infer<typeof configurationSchema>;
export const emptyConfiguration=(object:ObjectType):ObjectConfiguration=>({object,sections:[{key:'custom_details',label:'Additional details',scope:'record'},...(lineTables[object]?[{key:'line_details',label:'Line item details',scope:'line' as const}]:[])],fields:[]});
export function validateField(f:FieldDefinition,value:unknown):string|null {
 if(value===undefined||value===null||value==='')return f.required?'Required':null;
 switch(f.type){
  case 'number':case 'currency':case 'percentage':if(typeof value!=='number'||!Number.isFinite(value))return 'Enter a finite number';if(f.min!==undefined&&value<f.min)return `Minimum is ${f.min}`;if(f.max!==undefined&&value>f.max)return `Maximum is ${f.max}`;break;
  case 'boolean':if(typeof value!=='boolean')return 'Choose true or false';break;
  case 'select':if(typeof value!=='string'||!f.options.includes(value))return 'Choose an available option';break;
  case 'multi_select':if(!Array.isArray(value)||value.some(v=>typeof v!=='string'||!f.options.includes(v))||new Set(value).size!==value.length)return 'Choose unique available options';break;
  case 'date':if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)return 'Enter a valid date';break;
  case 'datetime':if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(value)||!Number.isFinite(Date.parse(value)))return 'Enter a valid date and time';break;
  case 'url':try{if(typeof value!=='string'||!['https:','http:'].includes(new URL(value).protocol))return 'Use an HTTP or HTTPS URL';}catch{return 'Enter a valid URL'}break;
  case 'json':try{if(JSON.stringify(value).length>10000)return 'JSON exceeds 10 KB';}catch{return 'Enter valid JSON'}break;
  default:if(typeof value!=='string'||value.length>(f.type==='long_text'?10000:1000))return 'Enter text within the field limit';
 }
 return null;
}
export function validateValues(schema:ObjectConfiguration,record:Record<string,unknown>,lines:Record<string,Record<string,unknown>>,lineIds:string[]){
 const errors:string[]=[];
 const check=(values:Record<string,unknown>,scope:'record'|'line',prefix:string)=>{for(const k of Object.keys(values))if(!schema.fields.some(f=>f.scope===scope&&f.key===k))errors.push(`${prefix}${k}: unknown field`);for(const f of schema.fields.filter(f=>f.scope===scope)){const err=validateField(f,values[f.key]);if(err)errors.push(`${prefix}${f.label}: ${err}`);}};
 check(record,'record','');for(const id of Object.keys(lines))if(!lineIds.includes(id))errors.push(`Unknown line ${id}`);for(const id of lineIds)check(lines[id]??{},'line',`Line ${id}: `);return errors;
}
export function compatibleSchema(previous:ObjectConfiguration,next:ObjectConfiguration){return previous.fields.flatMap(f=>{const n=next.fields.find(v=>v.key===f.key&&v.scope===f.scope);return n&&n.type!==f.type?[`${f.key}: changing an existing field type is not allowed; create a new key`]:[]})}
export const coreFields:Record<ObjectType,string[]>={invoice:['invoice_number','invoice_date','due_date','currency','subtotal','tax','total','status','decision','vendor_id','po_id'],purchase_order:['po_number','vendor_id','currency','po_date','valid_until','subtotal','tax','total','status'],goods_receipt:['grn_number','po_id','vendor_id','receipt_date','status'],vendor:['vendor_code','legal_name','display_name','gstin','tax_id','currency','status','email_domain'],payment:['payment_number','invoice_id','vendor_id','amount','currency','status','payment_date']};
export function canConfigure(role:string){return ['OWNER','ADMIN','FINANCE_ADMIN'].includes(role)}
export function canWrite(role:string){return !['AUDITOR'].includes(role)}
