'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Icon} from '../shell';
export function SettingsNav(){const path=usePathname();return <nav className="org-settings-nav" aria-label="Organization settings"><Link href="/settings" aria-current={path==='/settings'?'page':undefined}><Icon name="settings"/>General</Link><Link href="/settings/integrations" aria-current={path.startsWith('/settings/integrations')?'page':undefined}><Icon name="integrations"/>Integrations</Link></nav>}
