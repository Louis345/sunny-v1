import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {SpellingParentPage} from '../components/SpellingParentPage';
afterEach(()=>vi.restoreAllMocks());
it('requires every school mark and explicit parent confirmation, leaves absent forecast unknown',async()=>{
 const snapshot={draft:null,assignments:[{assignmentId:'hw-1',assignment:{words:['knee','know'],testDate:null},coverage:{assigned:2,discovery:0,eligible:0,recall:0},schoolResult:null,forecast:null}],report:{weeks:[{assignmentId:'hw-1',prior:{brier:null,coverage:{matched:0}},forecast:{brier:null,coverage:{matched:0}}}],patternHistory:[]}};
 const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify(snapshot)));
 render(<SpellingParentPage childId="synthetic-parent"/>);
 expect(await screen.findByText('No readiness forecast recorded')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('School test date'),{target:{value:'2026-10-09'}});
 expect((screen.getByRole('button',{name:'Save school results'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Mark for knee'),{target:{value:'correct'}});
 fireEvent.change(screen.getByLabelText('Mark for know'),{target:{value:'incorrect'}});
 fireEvent.click(screen.getByLabelText('I checked these marks against the returned school work'));
 fireEvent.click(screen.getByRole('button',{name:'Save school results'}));
 await waitFor(()=>expect(fetchMock.mock.calls.some(([url,init])=>String(url).endsWith('/school')&&init?.method==='POST')).toBe(true));
 const call=fetchMock.mock.calls.find(([,init])=>init?.method==='POST')!;
 expect(JSON.parse(String(call[1]?.body))).toEqual({testDate:'2026-10-09',confirmed:true,results:[{word:'knee',correct:true,writtenResponse:null},{word:'know',correct:false,writtenResponse:null}]});
});
it('saves an explicit default weekday through the existing parent page',async()=>{
 const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({draft:null,assignments:[],schedules:[],report:{weeks:[],patternHistory:[]}})));
 render(<SpellingParentPage childId="synthetic-parent"/>);
 fireEvent.change(await screen.findByLabelText('Usual test weekday'),{target:{value:'5'}});
 fireEvent.click(screen.getByRole('button',{name:'Save usual weekday'}));
 await waitFor(()=>expect(fetchMock.mock.calls.some(([url,init])=>String(url).endsWith('/schedule')&&init?.method==='POST')).toBe(true));
 const call=fetchMock.mock.calls.find(([,init])=>init?.method==='POST')!;
 expect(JSON.parse(String(call[1]?.body))).toMatchObject({kind:'weekday',weekday:5,confirmed:true});
});
it('offers explicit recovery when a forecast attempt needs attention',async()=>{
 const snapshot={draft:null,assignments:[{assignmentId:'a',assignment:{words:['knee']},coverage:{assigned:1,discovery:1,eligible:1,recall:1},schoolResult:null,forecast:null}],recovery:[{assignmentId:'a',attempted:true,needsAttention:true}],report:{weeks:[],patternHistory:[]}};
 const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify(snapshot)));
 render(<SpellingParentPage childId="synthetic-parent"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Try forecast again'}));
 await waitFor(()=>expect(fetchMock.mock.calls.some(([url,init])=>String(url).endsWith('/recover')&&init?.method==='POST')).toBe(true));
 expect(JSON.parse(String(fetchMock.mock.calls.find(([,init])=>init?.method==='POST')![1]?.body))).toEqual({acknowledge:true});
});
it('discloses missing word answers separately from game results',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({draft:null,assignments:[],report:{weeks:[],patternHistory:[]},limitations:[{assignmentId:'a',nodeId:'explainer',reason:'non_spelling_response',rawChoice:'ight',aggregateAccuracy:null}]})));
 render(<SpellingParentPage childId="synthetic-parent"/>);
 expect(await screen.findByText(/1 activity report did not include whole-word spelling answers/)).toBeTruthy();
});
it('offers parent retry for a failed intake without re-uploading the assignment',async()=>{
 const snapshot={draft:null,assignments:[{assignmentId:'a',assignment:{words:['knee']},coverage:{assigned:1,discovery:0,eligible:0,recall:0},schoolResult:null,forecast:null}],priorRecovery:[{assignmentId:'a',ready:false,attempted:true,needsAttention:true}],report:{weeks:[],patternHistory:[]}};
 const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify(snapshot)));
 render(<SpellingParentPage childId="synthetic-parent"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Retry spelling preparation'}));
 await waitFor(()=>expect(fetchMock.mock.calls.some(([,init])=>init?.method==='POST')).toBe(true));
 expect(JSON.parse(String(fetchMock.mock.calls.find(([,init])=>init?.method==='POST')![1]?.body))).toEqual({acknowledge:true,stage:'prior'});
});
