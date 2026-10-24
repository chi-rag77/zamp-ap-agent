import 'server-only';
import {createServerClient} from '@zamp/database';
import {safeProcessingMetadata} from './events';
import type {ProcessingEventInput,RealtimeProvider} from './types';

/** Server publisher: the RPC persists the event and broadcasts its compact payload on private topics. */
export class SupabaseRealtimePublisher implements Pick<RealtimeProvider,'publish'>{
  async publish(event:ProcessingEventInput):Promise<void>{
    const {error}=await createServerClient().rpc('phase9_event',{
      p_run_id:event.runId,p_invoice_id:event.invoiceId,p_type:event.type,p_step_name:event.stepName,
      p_status:event.status,p_message:event.message.slice(0,500),p_metadata:safeProcessingMetadata(event.metadata)
    });
    if(error)throw new Error(`Processing event could not be persisted: ${error.message}`);
  }
}
