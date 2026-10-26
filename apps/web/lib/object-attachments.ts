import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {objectTypeSchema} from '../../../packages/objects/src/schema';
import {objectRecord,WorkspaceError,type ObjectContext} from './objects';
export async function attachmentRequest(c:ObjectContext,request:NextRequest,id?:string){
 if(request.method==='GET'){
  z.string().uuid().parse(id);const r=await c.db.from('object_attachments').select('storage_path,filename').eq('organization_id',c.organizationId).eq('id',id!).single();if(r.error)throw new WorkspaceError('Attachment not found.',404);
  const url=await c.db.storage.from('object-attachments').createSignedUrl(r.data.storage_path,60,{download:r.data.filename});if(url.error)throw new WorkspaceError('Download unavailable.',503);return NextResponse.redirect(url.data.signedUrl);
 }
 if(Number(request.headers.get('content-length'))>11*1024*1024)throw new WorkspaceError('Maximum file size is 10 MB.',413);
 const form=await request.formData(),type=objectTypeSchema.parse(form.get('type')),objectId=z.string().uuid().parse(form.get('objectId'));
 await objectRecord(c,type,objectId);const file=form.get('file');if(!(file instanceof File)||!file.size||file.size>10*1024*1024)throw new WorkspaceError('Select a file up to 10 MB.');
 const bytes=Buffer.from(await file.arrayBuffer());let mime='';
 if(bytes.subarray(0,5).toString()==='%PDF-')mime='application/pdf';
 else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))mime='image/png';
 else if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)mime='image/jpeg';
 if(!mime)throw new WorkspaceError('Upload a PDF, PNG, or JPEG document.');
 const messageId=form.get('messageId');if(messageId){z.string().uuid().parse(messageId);const m=await c.db.from('object_messages').select('id').eq('organization_id',c.organizationId).eq('object_type',type).eq('object_id',objectId).eq('id',messageId).single();if(m.error)throw new WorkspaceError('Discussion not found.');}
 const filename=file.name.replace(/[^\p{L}\p{N} ._-]/gu,'_').slice(0,180)||'document',path=`${c.organizationId}/${type}/${objectId}/${randomUUID()}`;
 const uploaded=await c.db.storage.from('object-attachments').upload(path,bytes,{contentType:mime,upsert:false});if(uploaded.error)throw new WorkspaceError('Upload failed. Retry.',503);
 const saved=await c.db.from('object_attachments').insert({organization_id:c.organizationId,object_type:type,object_id:objectId,message_id:messageId||null,filename,mime_type:mime,size_bytes:bytes.length,storage_path:path,file_hash:createHash('sha256').update(bytes).digest('hex'),created_by:c.userId}).select('id').single();
 if(saved.error){await c.db.storage.from('object-attachments').remove([path]);throw new WorkspaceError('Could not save the attachment.',503);}return saved.data;
}
