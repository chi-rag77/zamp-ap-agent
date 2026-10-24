import {z} from 'zod';
export const integrationInput=z.object({
 name:z.string().trim().min(2).max(80),provider:z.enum(['rest','odata']),environment:z.enum(['development','staging','production']),
 endpoint:z.string().url().max(2000).refine(value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&(!u.port||u.port==='443')}catch{return false}},'Use an HTTPS URL without credentials, query parameters or a custom port'),
 test_path:z.string().max(500).regex(/^\/(?!\/)[A-Za-z0-9_./~$()-]*$/,'Use a relative path without query parameters').default('/'),
 auth_type:z.enum(['none','bearer','api_key']),credential_ref:z.string().regex(/^INTEGRATION_[A-Z0-9_]{1,80}$/).nullable(),
 header_name:z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,63}$/).default('X-API-Key')
}).strict().superRefine((value,ctx)=>{
 if(value.auth_type!=='none'&&!value.credential_ref)ctx.addIssue({code:'custom',path:['credential_ref'],message:'Choose a server credential reference'});
 if(/^(host|cookie|connection|content-length|transfer-encoding|proxy-.*|x-forwarded-.*)$/i.test(value.header_name))ctx.addIssue({code:'custom',path:['header_name'],message:'This header cannot be configured'});
});
export type IntegrationInput=z.infer<typeof integrationInput>;
export function parseOpenAPI(input:unknown){
 const doc=z.object({openapi:z.string().regex(/^3\./),info:z.object({title:z.string().max(100)}),servers:z.array(z.object({url:z.string().url()})).max(20).optional(),paths:z.record(z.string(),z.unknown())}).parse(input);
 const operations=Object.entries(doc.paths).flatMap(([path,value])=>typeof value==='object'&&value!==null?Object.keys(value).filter(method=>['get','post','patch','put','delete'].includes(method)).map(method=>({path,method:method.toUpperCase()})):[]);
 if(operations.length>500)throw new Error('Import is limited to 500 operations');
 return {title:doc.info.title,server:doc.servers?.[0]?.url??'',operations};
}
