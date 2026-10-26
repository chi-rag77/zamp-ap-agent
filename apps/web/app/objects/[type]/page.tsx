import {notFound} from 'next/navigation';
import {objectTypeSchema} from '../../../../../packages/objects/src/schema';
import {ObjectList} from '../../../components/objects/object-list';
export default async function ObjectsPage({params}:{params:Promise<{type:string}>}){const type=objectTypeSchema.safeParse((await params).type);if(!type.success)notFound();return <ObjectList type={type.data}/>}
