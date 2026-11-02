import {describe,expect,it} from 'vitest';
import {classifyCopilotRoute,resolveCopilotModel} from '../../apps/web/lib/copilot-model-router';

describe('Copilot model routing',()=>{
 const config={standard:'bolt',deepAnalysis:'ultra',document:'super-vl'};
 it('keeps everyday AP questions on the compact default model',()=>{
  expect(classifyCopilotRoute('Why did AIS/26-27/0847 fail?')).toBe('standard');
  expect(resolveCopilotModel('Show invoices needing review',config)).toMatchObject({route:'standard',model:'bolt',fallback:false});
 });
 it('routes visual document questions to the vision model',()=>{
  expect(resolveCopilotModel('Does the invoice PDF show a GST number?',config)).toMatchObject({route:'document_question',model:'super-vl',fallback:false});
 });
 it('uses the deep model only for cross-period analysis',()=>{
  expect(resolveCopilotModel('Analyze AP exception trends over the last quarter',config)).toMatchObject({route:'deep_analysis',model:'ultra',fallback:false});
 });
 it('falls back to the configured default when a specialized model is not set',()=>{
  expect(resolveCopilotModel('Compare policy versions', {standard:'bolt'})).toMatchObject({route:'deep_analysis',model:'bolt',fallback:true});
 });
});
