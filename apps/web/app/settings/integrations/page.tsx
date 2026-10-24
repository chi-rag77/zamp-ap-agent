import {IntegrationHub} from '../../../components/integrations/integration-hub';
import {getIntegrationHub} from '../../../lib/integrations';
export const dynamic='force-dynamic';
export default async function IntegrationsPage(){return <IntegrationHub initial={await getIntegrationHub()}/>}
