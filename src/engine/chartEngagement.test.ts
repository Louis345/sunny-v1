import {it,expect} from 'vitest';
import {validatePayload,validateEvent} from '../chart/eventTypes';
import {factId} from '../chart/spelling/schemas';
import {evaluatePriors,evaluateForecast} from '../chart/spelling/projections';
const payload={assignmentId:'week',sessionId:'session',nodeId:'launched-node',itemId:null,observationId:'signal-1',metric:'session_duration_ms',value:1200};
it('accepts strict engagement measurements only from room or system',()=>{
 for(const actor of ['room','system'] as const) expect(()=>validateEvent({event_id:factId('engagement.observed',payload),child_id:'synthetic',type:'engagement.observed',actor,occurred_at:'2026-10-03T12:00:00.000Z',cites:[],payload})).not.toThrow();
 expect(()=>validatePayload('engagement.observed',{...payload,correct:true})).toThrow();
 expect(()=>validatePayload('engagement.observed',{...payload,value:-1})).toThrow();
 expect(()=>validatePayload('engagement.observed',{...payload,metric:'mastery'})).toThrow();
});
it('preserves separate identity for every observed signal',()=>{
 expect(factId('engagement.observed',payload)).not.toBe(factId('engagement.observed',{...payload,observationId:'signal-2'}));
});
it('never scores engagement as academic performance',()=>{
 const e={event_id:'signal',child_id:'synthetic',type:'engagement.observed' as const,actor:'room' as const,occurred_at:'2026-10-03T12:00:00.000Z',recorded_at:'2026-10-03T12:00:00.000Z',sequence:1,cites:[],payload};
 expect(evaluatePriors([e],'week').rows).toEqual([]);
 expect(evaluateForecast([e],'week').rows).toEqual([]);
});
