import type {AdventureJourneyDefinition} from './adventureBoardDefinition';

type Point={x:number;y:number};
export type PortalPlacement={landscape:Point;portrait:Point};
const ARTWORK='/generated/adventure-board-demo/silent-letter-world.jpeg';

/** Looks the map artist chooses from. Every label is palette.text on a palette.panel plate, so each
 * pair is contrast-checked in a test; more illustrated worlds become more presets. */
export const THEME_PRESETS=[
  {id:'illustrated-night',label:'Starry night',palette:{path:'#ffffff',completed:'#1f8f68',available:'#7c3aed',locked:'#aeb7c2',current:'#f59e0b',preview:'#d5dde5',text:'#ffffff',panel:'#0f172a'}},
  {id:'illustrated-dusk',label:'Purple dusk',palette:{path:'#fde68a',completed:'#34d399',available:'#a855f7',locked:'#94a3b8',current:'#f59e0b',preview:'#c7d2fe',text:'#ffffff',panel:'#1e1b4b'}},
  {id:'illustrated-dawn',label:'Warm dawn',palette:{path:'#fb923c',completed:'#10b981',available:'#ec4899',locked:'#9ca3af',current:'#f59e0b',preview:'#fed7aa',text:'#1f2937',panel:'#fff7ed'}},
  {id:'illustrated-meadow',label:'Green meadow',palette:{path:'#fef08a',completed:'#4ade80',available:'#22d3ee',locked:'#a3a3a3',current:'#facc15',preview:'#bbf7d0',text:'#ffffff',panel:'#14532d'}},
  {id:'illustrated-ocean',label:'Deep ocean',palette:{path:'#e0f2fe',completed:'#2dd4bf',available:'#38bdf8',locked:'#94a3b8',current:'#fbbf24',preview:'#bae6fd',text:'#ffffff',panel:'#0c4a6e'}},
].map(preset=>({...preset,background:{type:'image' as const,value:ARTWORK}}));
export const DEFAULT_THEME_PRESET=THEME_PRESETS[0];
export const themeOfPreset=(id:string)=>{const preset=THEME_PRESETS.find(row=>row.id===id);return preset?{background:preset.background,palette:{...preset.palette}}:undefined;};

/** Kiosk capacity: 7 stops across in landscape, 12 stops in portrait (3 columns x 4 rows). */
const LANDSCAPE_COLUMNS=7,PORTRAIT_STOPS=12,MAX_LANES=3,PORTRAIT_X=[.15,.5,.85];

/** The plain canvas, used only for portals the artist did not place (all of them when it refused).
 * Landscape: the shared journey runs left to right on the middle lane and each option of a choice
 * gets its own lane. Portrait: the same order snakes down three columns. Over capacity the spacing
 * tightens instead of dropping anything, and overCapacity says so. Pure and deterministic. */
export function layoutJourney(journey:AdventureJourneyDefinition):{positions:Record<string,PortalPlacement>;overCapacity:boolean} {
  const root=journey.paths.find(path=>path.id===journey.rootPathId)?.portalIds??[];
  const choice=journey.choices[0],choiceAt=choice?root.indexOf(choice.portalId):-1;
  const options=choice?choice.options.map(option=>journey.paths.find(path=>path.id===option.pathId)?.portalIds??[]):[];
  const branch=Math.max(0,...options.map(path=>path.length));
  const columns=root.length+branch;
  // Columns: the root path, with the option segments inserted after the choice portal.
  const landscape:Record<string,Point>={},order:string[]=[];
  const lanes=options.length===2?[0,1]:options.map((_,i)=>options.length<2?.5:i/(options.length-1));
  const x=(column:number)=>columns<=1?.5:column/(columns-1);
  root.forEach((id,i)=>{
    const column=choiceAt>=0&&i>choiceAt?i+branch:i;
    landscape[id]??={x:x(column),y:.5};
    order.push(id);
    if(i===choiceAt)options.forEach((path,lane)=>path.forEach((portalId,j)=>{landscape[portalId]??={x:x(i+1+j),y:lanes[lane]};order.push(portalId);}));
  });
  for(const portal of journey.portals)if(!landscape[portal.id]){landscape[portal.id]={x:x(columns),y:.5};order.push(portal.id);}
  // Keep the level badge (top-left) and Elli (bottom-right) clear when spacing is tight.
  for(const point of Object.values(landscape)){if(point.x>.85&&point.y>.85)point.y=.8;if(point.x<.15&&point.y<.15)point.y=.2;}
  const unique=[...new Set(order)],rows=Math.max(1,Math.ceil(unique.length/PORTRAIT_X.length));
  const positions:Record<string,PortalPlacement>={};
  unique.forEach((id,i)=>{
    const row=Math.floor(i/PORTRAIT_X.length),step=i%PORTRAIT_X.length;
    positions[id]={landscape:landscape[id],portrait:{x:PORTRAIT_X[row%2===0?step:PORTRAIT_X.length-1-step],y:rows===1?.5:row/(rows-1)}};
  });
  return {positions,overCapacity:columns>LANDSCAPE_COLUMNS||options.length>MAX_LANES||unique.length>PORTRAIT_STOPS};
}
