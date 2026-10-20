import {it,expect} from 'vitest';
import {buildGameContextSummary} from './gameContextSummary';
it('includes the actual displayed journey options without inventing a choice',()=>{
  const summary=buildGameContextSummary({phase:'choice_open',purpose:'Choose how to begin',options:[{id:'learn',label:'Learn first',state:'available'},{id:'play',label:'Play first',state:'available'}]});
  expect(summary).toContain('Learn first'); expect(summary).toContain('Play first'); expect(summary).toContain('Choose how to begin');
});
