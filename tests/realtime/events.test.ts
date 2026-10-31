import {describe,expect,it} from 'vitest';
import {classifyProcessingError,notificationType,processingEventCopy,safeProcessingMetadata} from '../../packages/realtime/src/events';

describe('processing event helpers',()=>{
  it('classifies errors in the most specific-first order',()=>{
    expect(classifyProcessingError('ACTION_VERIFICATION_FAILED')).toBe('VERIFICATION_ERROR');
    expect(classifyProcessingError('PURCHASE_ORDER_NOT_FOUND')).toBe('PO_RESOLUTION_ERROR');
    expect(classifyProcessingError('unexpected')).toBe('SYSTEM_ERROR');
    expect(classifyProcessingError(null)).toBeNull();
  });
  it('creates notifications only for meaningful state changes',()=>{
    expect(notificationType({type:'REVIEW_REQUIRED',metadata:{}})).toBe('REVIEW_REQUIRED');
    expect(notificationType({type:'RUN_COMPLETED',metadata:{decision:'AUTO_APPROVED'}})).toBe('AUTO_APPROVED');
    expect(notificationType({type:'RUN_COMPLETED',metadata:{decision:'NEEDS_REVIEW'}})).toBeNull();
  });
  it('keeps only bounded, explicitly safe metadata fields',()=>{
    const safe=safeProcessingMetadata({stepNumber:3,durationMs:20,errorCode:'PO_NOT_FOUND',decision:'AUTO_APPROVED',prompt:'private prompt',documentText:'invoice body',token:'secret',reasonCode:'X'.repeat(300)});
    expect(safe).toEqual({stepNumber:3,durationMs:20,errorCode:'PO_NOT_FOUND',decision:'AUTO_APPROVED',reasonCode:'X'.repeat(120)});
  });
  it('turns technical processing entries into useful human-readable updates',()=>{
    expect(processingEventCopy({type:'STEP_COMPLETED',message:'COMPLETED step 7',stepName:'verifyInvoiceState',metadata:{}}))
      .toEqual({title:'Verify Invoice State',description:'The agent completed this step.'});
    expect(processingEventCopy({type:'RUN_COMPLETED',message:'{}',stepName:null,metadata:{decision:'AUTO_APPROVED'}}).description)
      .toContain('passed the configured checks');
  });
});
