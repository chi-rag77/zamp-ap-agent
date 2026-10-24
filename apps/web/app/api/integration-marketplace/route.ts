import {NextRequest,NextResponse} from 'next/server';
import {allowed,denied} from '../../../lib/agent-api';
import {catalog} from '../../../../../packages/integrations/src/catalog';
export function GET(request:NextRequest){if(!allowed(request))return denied();return NextResponse.json({connectors:catalog})}
