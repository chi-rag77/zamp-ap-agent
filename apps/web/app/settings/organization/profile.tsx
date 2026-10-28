'use client';

import { useState } from 'react';
import Link from 'next/link';
import { workspaceRequest } from '../../../components/objects/client';

export type OrganizationSettings = {
  logo_data_url: string | null;
  time_zone: string;
  date_format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  clock_format: '12-hour' | '24-hour';
  number_locale: 'en-GB' | 'en-US' | 'en-IN';
  number_format: 'western' | 'indian';
  currency: string;
  language: 'en' | 'hi' | 'fr' | 'de' | 'es';
  decimal_precision: { price: number; number: number; percentage: number };
  exchange_source: 'open_exchange_rates' | 'manual';
  allow_free_text_items: boolean;
  email_approvals: boolean;
  show_item_specifications: boolean;
};

type Props = {
  organization: { name: string; status: string; plan: string };
  role: string;
  members: { workos_user_id: string; email: string; role: string }[];
  initialSettings: OrganizationSettings;
};

const currencies = [['INR', 'Indian Rupee'], ['USD', 'US Dollar'], ['GBP', 'British Pound'], ['EUR', 'Euro'], ['SGD', 'Singapore Dollar'], ['AED', 'UAE Dirham'], ['CAD', 'Canadian Dollar'], ['AUD', 'Australian Dollar']];
const timeZones = typeof Intl !== 'undefined' && 'supportedValuesOf' in Intl ? Intl.supportedValuesOf('timeZone') : ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York'];
const locales = [
  { id: 'en-GB', title: 'EN-GB · United Kingdom', description: 'Western grouping · thousands separator', example: '1,234,567.89', format: 'western' as const },
  { id: 'en-US', title: 'EN-US · United States', description: 'Western grouping · thousands separator', example: '1,234,567.89', format: 'western' as const },
  { id: 'en-IN', title: 'EN-IN · India', description: 'Indian grouping · lakh / crore', example: '12,34,567.89', format: 'indian' as const },
];

export function OrganizationProfile({ organization, role, members, initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [saved, setSaved] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const canEdit = ['OWNER', 'ADMIN'].includes(role);
  const dirty = JSON.stringify(settings) !== JSON.stringify(saved);
  const set = <K extends keyof OrganizationSettings>(key: K, value: OrganizationSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const setLogo = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setMessage('Choose a PNG, JPEG, SVG, or WebP logo.'); return; }
    if (file.size > 2 * 1024 * 1024) { setMessage('Logo must be 2 MB or smaller.'); return; }
    try {
      const image = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 512 / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Logo preview is unavailable.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
      if (!blob || blob.size > 160_000) blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.5));
      if (!blob || blob.size > 160_000) throw new Error('This logo could not be optimized. Choose a simpler image.');
      const reader = new FileReader();
      reader.onload = () => { set('logo_data_url', String(reader.result)); setMessage('Logo ready. Save changes to apply it.'); };
      reader.readAsDataURL(blob);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Logo could not be prepared.'); }
  };

  const save = async () => {
    setBusy(true); setMessage('');
    try {
      await workspaceRequest('organization', { settings });
      setSaved(settings); setMessage('Organization settings saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Settings could not be saved.'); }
    finally { setBusy(false); }
  };

  return <div className="object-workspace org-profile">
    <header className="org-profile-heading">
      <div><div className="org-profile-breadcrumb">Settings <span>›</span> General settings <span>›</span> <strong>Organization profile</strong></div><p className="org-profile-kicker">WORKSPACE SETTINGS</p><h2>Organization profile</h2><p>Manage {organization.name}&apos;s identity, regional formats, and workspace defaults.</p></div>
      <div className="org-profile-heading-actions"><Link className="button" href="/audit">Audit log</Link><button className="button primary" disabled={!canEdit || !dirty || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </header>
    {!canEdit && <div className="org-profile-note">You have read-only access to organization settings. Ask an organization admin to make changes.</div>}
    {message && <div className={`org-profile-message ${message.includes('could not') || message.includes('Choose') || message.includes('must be') ? 'error' : 'success'}`} role="status">{message}</div>}

    <fieldset className="org-profile-settings" disabled={!canEdit || busy}>
      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">▧</span><div><h3>Customer logo</h3><p>Your organization&apos;s logo displayed in the workspace header.</p></div></div>
        <div className="org-setting-content org-logo-content"><div className="org-logo-preview">{settings.logo_data_url ? <img src={settings.logo_data_url} alt={`${organization.name} logo`} /> : <span>{organization.name.slice(0, 2).toUpperCase()}</span>}</div><label className="button org-upload">Upload logo<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(event) => void setLogo(event.target.files?.[0])} /></label><small>PNG, SVG, JPEG, or WebP · up to 2 MB</small>{settings.logo_data_url && <button type="button" className="org-text-button" onClick={() => set('logo_data_url', null)}>Remove logo</button>}</div>
      </section>

      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">◷</span><div><h3>Timezone settings</h3><p>Set the default timezone for your organization.</p></div></div>
        <div className="org-setting-content"><label className="org-field">Time zone<select value={settings.time_zone} onChange={(event) => set('time_zone', event.target.value)}>{timeZones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}</select></label></div>
      </section>

      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">▦</span><div><h3>Date format settings</h3><p>Choose how dates are displayed across the platform.</p></div></div>
        <div className="org-setting-content"><label className="org-field">Date format<select value={settings.date_format} onChange={(event) => set('date_format', event.target.value as OrganizationSettings['date_format'])}><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label><div className="org-radio-row"><label><input type="radio" name="clock-format" checked={settings.clock_format === '12-hour'} onChange={() => set('clock_format', '12-hour')} />12-hour</label><label><input type="radio" name="clock-format" checked={settings.clock_format === '24-hour'} onChange={() => set('clock_format', '24-hour')} />24-hour</label></div></div>
      </section>

      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">↗</span><div><h3>Number settings</h3><p>Choose how numbers are formatted across the platform.</p></div></div>
        <div className="org-setting-content"><div className="org-number-locales">{locales.map((locale) => <button key={locale.id} type="button" className={settings.number_locale === locale.id ? 'selected' : ''} onClick={() => { set('number_locale', locale.id as OrganizationSettings['number_locale']); set('number_format', locale.format); }}><strong>{locale.title}</strong><small>{locale.description}</small><b>{locale.example}</b>{settings.number_locale === locale.id && <i aria-label="Selected">✓</i>}</button>)}</div><label className="org-field org-compact-field">More formats<select value={settings.number_locale} onChange={(event) => { const locale = locales.find((item) => item.id === event.target.value); if (locale) { set('number_locale', locale.id as OrganizationSettings['number_locale']); set('number_format', locale.format); } }}><option value="en-GB">English (United Kingdom)</option><option value="en-US">English (United States)</option><option value="en-IN">English (India)</option></select></label><small className="org-help">This format is used in every document and email and on screen for anyone whose language has no number format of its own.</small></div>
      </section>

      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">₹</span><div><h3>Default currency</h3><p>The primary currency used across the organization.</p></div></div>
        <div className="org-setting-content"><label className="org-field org-compact-field">Default currency<select value={settings.currency} onChange={(event) => set('currency', event.target.value)}>{currencies.map(([code, name]) => <option key={code} value={code}>{name} ({code})</option>)}</select></label><small className="org-help">Changing the default currency may require confirmation and affects how amounts are displayed.</small></div>
      </section>

      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">文</span><div><h3>Default language</h3><p>The default language for emails and UI when a user or vendor has not set their own.</p></div></div>
        <div className="org-setting-content"><label className="org-field org-compact-field">Default language<select value={settings.language} onChange={(event) => set('language', event.target.value as OrganizationSettings['language'])}><option value="en">🇬🇧 English</option><option value="hi">🇮🇳 Hindi</option><option value="fr">🇫🇷 French</option><option value="de">🇩🇪 German</option><option value="es">🇪🇸 Spanish</option></select></label></div>
      </section>

      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">0.0</span><div><h3>Decimal settings</h3><p>Configure decimal precision for different value types across the organization.</p></div></div>
        <div className="org-setting-content org-decimals">{([['price', 'Price', 'e.g. USD 490.50'], ['number', 'Decimal number', 'e.g. 994.01'], ['percentage', 'Percentage', 'e.g. 15.00%']] as const).map(([key, label, example]) => <label key={key}>{label}<span>{example}</span><select value={settings.decimal_precision[key]} onChange={(event) => set('decimal_precision', { ...settings.decimal_precision, [key]: Number(event.target.value) })}>{[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} decimals</option>)}</select></label>)}</div>
      </section>

      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">⇄</span><div><h3>Currency exchange preference</h3><p>Choose the default exchange rate source for currency conversion.</p></div></div>
        <div className="org-setting-content"><label className="org-field org-compact-field">Exchange source<select value={settings.exchange_source} onChange={(event) => set('exchange_source', event.target.value as OrganizationSettings['exchange_source'])}><option value="open_exchange_rates">Open Exchange Rates</option><option value="manual">Manual rates</option></select></label><small className="org-help">Exchange rate source is configured by your organization administrator.</small></div>
      </section>

      <section className="org-setting-card">
        <div className="org-setting-title"><span className="org-setting-icon">☷</span><div><h3>Additional configurations</h3><p>Customer-level feature settings for this organization.</p></div></div>
        <div className="org-setting-content org-toggles">{([
          ['allow_free_text_items', 'Free text inputs in items', 'Allow users to enter free-text values instead of selecting from the item catalog in application and spend master item tables.'],
          ['email_approvals', 'Email approvals', 'Let approvers approve or reject from one-click actions in the email. Rejections still require a reason.'],
          ['show_item_specifications', 'Item specifications', 'Show item specification and material characteristic columns across item tables and templates.'],
        ] as const).map(([key, title, description]) => <label key={key}><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={settings[key]} onChange={(event) => set(key, event.target.checked)} /></label>)}</div>
      </section>
    </fieldset>

    <section className="org-setting-card org-account-card"><div className="org-setting-title"><span className="org-setting-icon">◎</span><div><h3>Organization access</h3><p>Identity and membership are managed by WorkOS.</p></div></div><div className="org-setting-content org-account-grid"><div><small>Organization</small><strong>{organization.name}</strong></div><div><small>Workspace status</small><strong>{organization.status} · {organization.plan}</strong></div><div><small>Your role</small><strong>{role}</strong></div><div><small>Active members</small><strong>{members.length}</strong></div></div><div className="org-account-links"><Link href="/settings/users">Users &amp; access</Link><Link href="/settings/roles">Roles</Link><Link href="/audit">Audit log</Link><Link href="/settings/integrations">Integrations</Link></div></section>
    {dirty && canEdit && <div className="org-profile-sticky-save"><span>Unsaved organization changes</span><button className="button primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button></div>}
  </div>;
}
