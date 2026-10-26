import {notFound,redirect} from 'next/navigation';
import {z} from 'zod';
import {objectTypeSchema} from '../../../../../../packages/objects/src/schema';
import {ObjectWorkspace} from '../../../../components/objects/object-workspace';
export default async function ObjectPage({params}:{params:Promise<{type:string;id:string}>}){const p=await params;const type=objectTypeSchema.safeParse(p.type);if(!type.success||!z.string().uuid().safeParse(p.id).success)notFound();if(type.data==='invoice')redirect(`/invoices/${p.id}`);return <ObjectWorkspace type={type.data} id={p.id}/>}
