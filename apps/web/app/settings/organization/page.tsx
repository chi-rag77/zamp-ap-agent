import { objectContext, members } from '../../../lib/objects';
import { OrganizationProfile, type OrganizationSettings } from './profile';
import '../../../components/objects/workspace.css';

export const dynamic = 'force-dynamic';

const defaults: OrganizationSettings = {
  logo_data_url: null,
  time_zone: 'Asia/Kolkata',
  date_format: 'DD/MM/YYYY',
  clock_format: '24-hour',
  number_locale: 'en-IN',
  number_format: 'indian',
  currency: 'INR',
  language: 'en',
  decimal_precision: { price: 2, number: 2, percentage: 2 },
  exchange_source: 'open_exchange_rates',
  allow_free_text_items: false,
  email_approvals: false,
  show_item_specifications: false,
};

export default async function OrganizationPage() {
  const context = await objectContext();
  const [org, people] = await Promise.all([
    context.db.from('organizations').select('name,status,plan,settings').eq('id', context.organizationId).single(),
    members(context),
  ]);
  if (org.error) throw new Error('Organization settings unavailable');
  const settings = { ...defaults, ...(org.data.settings as Partial<OrganizationSettings> ?? {}) };
  settings.decimal_precision = { ...defaults.decimal_precision, ...settings.decimal_precision };
  return <OrganizationProfile organization={{ name: org.data.name, status: org.data.status, plan: org.data.plan }} role={context.role} members={people} initialSettings={settings} />;
}
