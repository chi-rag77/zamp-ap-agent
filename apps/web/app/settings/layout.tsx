import Link from 'next/link';
import {SettingsNav} from '../../components/integrations/settings-nav';
import {PageHeading} from '../../components/ui';
import './settings.css';
export default function SettingsLayout({children}:{children:React.ReactNode}){return <div className="organization-settings"><PageHeading title="Organization settings" subtitle="Manage your workspace, connected systems and processing configuration." actions={<Link className="button" href="/">Back to workspace</Link>}/><SettingsNav/>{children}</div>}
