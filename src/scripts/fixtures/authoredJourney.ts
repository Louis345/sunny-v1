import type {AdventureBoardDefinition} from "../../shared/adventureBoardDefinition";
export function authoredJourney() {
  const ids = ['start', 'choose', 'learn-a', 'play-a', 'play-b', 'learn-b', 'check', 'end'];
  return {
    version: 2 as const, rootPathId: 'main', title: 'Choose your spelling adventure',
    rationale: 'Compare learning first with playing first without changing the checkpoint.',
    portals: ids.map((id, i) => ({ id, label: id, kind: id === 'start' ? 'start' as const : id === 'end' ? 'endpoint' as const : id === 'choose' ? 'choice' as const : 'activity' as const,
      ...(!['start', 'choose', 'end'].includes(id) ? { activityNodeId: id.startsWith('learn') ? 'learn' : id.startsWith('play') ? 'play' : 'check' } : {}),
      position: { landscape: [{x:0,y:.5},{x:.2,y:.5},{x:.4,y:.1},{x:.6,y:.1},{x:.4,y:.85},{x:.6,y:.85},{x:.8,y:.5},{x:1,y:.5}][i], portrait: [{x:.15,y:0},{x:.85,y:0},{x:.15,y:.28},{x:.15,y:.56},{x:.85,y:.28},{x:.85,y:.56},{x:.15,y:.86},{x:.85,y:.86}][i] } })),
    paths: [{ id: 'main', portalIds: ['start', 'choose', 'check', 'end'] }, { id: 'learn-first', portalIds: ['learn-a', 'play-a'] }, { id: 'play-first', portalIds: ['play-b', 'learn-b'] }],
    choices: [{ id: 'order', portalId: 'choose', purpose: 'Which way would you like to begin?', options: [{ id: 'learn', label: 'Learn first', pathId: 'learn-first', hypothesis: 'Explanation may help engagement.' }, { id: 'play', label: 'Play first', pathId: 'play-first', hypothesis: 'Play may help engagement.' }] }],
    edges: [['start','choose'],['choose','learn-a'],['learn-a','play-a'],['play-a','check'],['choose','play-b'],['play-b','learn-b'],['learn-b','check'],['check','end']].map(([from,to]) => ({ id: `${from}:${to}`, from, to })),
    theme: { background: { type: 'solid' as const, value: '#160d35' }, palette: { path:'#fff',completed:'#0f0',available:'#f00',locked:'#888',current:'#ff0',preview:'#888',text:'#fff',panel:'#160d35' } },
  };
}

/** Test-only authored linear case. Production never calls this to infer a journey. */
export function linearJourneyFixture(sequence: readonly string[]) {
  const source=authoredJourney();
  const ids=['start',...sequence,'end'];
  return {...source, singlePathReason:'This recorded fixture measures one declared sequence.',choices:[],rootPathId:'main',
    portals:ids.map((id,i)=>({id,label:id,kind:i===0?'start' as const:i===ids.length-1?'endpoint' as const:'activity' as const,
      ...(i>0&&i<ids.length-1?{activityNodeId:id}:{}),
      position:{landscape:ids.length<=7?{x:i/(ids.length-1),y:.5}:{x:(Math.floor(i/4)%2===0?i%4:3-i%4)/3,y:Math.floor(i/4)/Math.ceil(ids.length/4)},portrait:ids.length<=4?{x:.5,y:i/(ids.length-1)}:{x:Math.floor(i/2)%2===0?(i%2)*.7+.15:.85-(i%2)*.7,y:Math.floor(i/2)/(Math.ceil(ids.length/2)-1)}}})),
    paths:[{id:'main',portalIds:ids}],edges:ids.slice(1).map((to,i)=>({id:`edge-${i}`,from:ids[i],to})),
  };
}

/** Explicit branch sequences used by recorded provider fixtures, never by generation. */
export function choiceJourneyFixture(routes: Array<{id:string;label:string;nodeIds:string[]}>, opening:string[]=[], tail:string[]=[]) {
  const base=linearJourneyFixture([...opening,...tail]);
  const portals:AdventureBoardDefinition["portals"]=[...base.portals];
  portals[0].position={landscape:{x:0,y:opening.length?.05:.5},portrait:{x:.15,y:0}};
  portals[portals.length-1].position={landscape:{x:1,y:.5},portrait:{x:.85,y:1}};
  opening.forEach((id,i)=>{portals.find(p=>p.id===id)!.position={landscape:{x:i*.16,y:.65},portrait:{x:.5,y:i*.25}};});
  tail.forEach((id,i)=>{portals.find(p=>p.id===id)!.position={landscape:{x:.82,y:.5-i*.3},portrait:{x:.15,y:1-i*.24}};});
  const choice={id:'choice',label:'Choose your path',kind:'choice' as const,position:{landscape:{x:.2,y:.5},portrait:{x:.85,y:0}}};
  const paths=[{id:'main',portalIds:['start',...opening,'choice',...tail,'end']}];
  for(const [i,route] of routes.entries()) {
    const routePortals=route.nodeIds.map((id,j)=>({...choice,id:`${route.id}:${id}`,activityNodeId:id,label:id,kind:'activity' as const,position:{landscape:{x:.4+j*.18,y:i===0?.08:.85},portrait:{x:i===0?.1:.7,y:.27+j*.24}}}));
    portals.push(...routePortals);paths.push({id:route.id,portalIds:routePortals.map(p=>p.id)});
  }
  portals.push(choice);
  const chains=routes.map(route=>['start',...opening,'choice',...paths.find(p=>p.id===route.id)!.portalIds,...tail,'end']);
  const edges=[...new Map(chains.flatMap(ids=>ids.slice(1).map((to,i)=>({id:`${ids[i]}:${to}`,from:ids[i],to}))).map(edge=>[edge.id,edge])).values()];
  return {...base,portals,paths,edges,choices:[{id:'choice',portalId:'choice',purpose:'Choose your path',options:routes.map(route=>({id:route.id,label:route.label,pathId:route.id,hypothesis:'Recorded uncertain engagement hypothesis.'}))}]};
}
