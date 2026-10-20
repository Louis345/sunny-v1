import {expect,it,vi} from 'vitest';
const {stream}=vi.hoisted(()=>({stream:vi.fn()}));
vi.mock('ai',()=>({streamText:stream,stepCountIs:()=>()=>false}));
vi.mock('@ai-sdk/anthropic',()=>({anthropic:()=> 'model'}));
vi.mock('../agents/elli/tools/generateToolDocs',()=>({ALL_TOOLS:{}}));
import {runAgent} from '../agents/elli/run';
it('passes the persona and live context to the model without injecting a turn-count script',async()=>{
 stream.mockReturnValue({fullStream:(async function*(){yield {type:'text-delta',text:'Let us try it together.'};})(),finishReason:Promise.resolve('stop')});
 const tokens:string[]=[];
 await runAgent({history:[],userMessage:'Help me',profile:{systemPrompt:'Live persona'} as any,onToken:t=>tokens.push(t),...({transitionToWorkPhase:true} as any),quiet:true});
 expect(stream.mock.calls.at(-1)?.[0].system).toBe('Live persona');
 expect(tokens.join('')).toBe('Let us try it together.');
 expect(stream.mock.calls.at(-1)?.[0].maxOutputTokens).toBeGreaterThanOrEqual(1500);
});

it('does not end a session because the model uses farewell words in ordinary conversation',async()=>{
 const {runCompanionResponseForSession}=await import('./companion-response-runner');
 stream.mockReturnValue({fullStream:(async function*(){yield {type:'text-delta',text:'See you next time!'};})(),finishReason:Promise.resolve('stop')});
 const session:any={sessionId:'synthetic',companion:{name:'Elli',systemPrompt:'Live persona'},conversationHistory:[],gamePendingRevision:null,
  turnSM:{getState:()=> 'IDLE',onStartCompanionFromIdle:vi.fn(),onToken:vi.fn(),onAgentComplete:vi.fn()},
  buildAgentToolkit:()=>({}),send:vi.fn(),flushPendingRoundComplete:vi.fn(),end:vi.fn(),recordDebugEvent:vi.fn()};
 await runCompanionResponseForSession(session,'What did your friend say?');
 expect(session.conversationHistory.at(-1)?.content).toBe('See you next time!');
 expect(session.end).not.toHaveBeenCalled();
 expect(session.send).toHaveBeenCalledWith('audio_done',expect.anything());
});

it.each([true,false])('accepts a completed tool-only turn without recovery speech, owned audio=%s',async owned=>{
 const {runCompanionResponseForSession}=await import('./companion-response-runner');
 const session:any={sessionId:'quiet',companion:{name:'Elli',systemPrompt:'Live persona'},conversationHistory:[],gamePendingRevision:null,
  turnSM:{getState:()=> 'IDLE',onStartCompanionFromIdle:vi.fn(),onToken:vi.fn(),onAgentComplete:vi.fn(),onSpeakingDone:vi.fn(),onInterrupt:vi.fn()},
  buildAgentToolkit:()=>({}),send:vi.fn(),flushPendingRoundComplete:vi.fn(),end:vi.fn(),recordDebugEvent:vi.fn(),handleCompanionTurn:vi.fn()};
 let owner:any;session.ttsBridge={beginPlayback:(requestId:string)=>{owner={requestId:owned?requestId:'native-word'};},currentPlaybackIdentity:()=>owner,connect:async()=>{},stop:vi.fn(),finish:vi.fn()};
 stream.mockReturnValue({fullStream:(async function*(){session.toolCallsMadeThisTurn=1;})(),finishReason:Promise.resolve('stop')});
 await runCompanionResponseForSession(session,'Wave to me');
 expect(session.handleCompanionTurn).not.toHaveBeenCalled();
 expect(session.ttsBridge.finish).not.toHaveBeenCalled();
 expect(session.ttsBridge.stop).toHaveBeenCalledTimes(owned?1:0);
 expect(session.send).toHaveBeenCalledWith('audio_done',expect.anything());
});
