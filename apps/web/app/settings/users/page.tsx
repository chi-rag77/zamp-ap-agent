import {PageHeading} from '../../../components/ui';
import {UsersConsole} from '../../../components/admin/users-console';
export const dynamic='force-dynamic';
export default function UsersPage(){return <><PageHeading title="Users & access" subtitle="Manage organization members, roles and approval authority."/><UsersConsole/></>}
