import {describe,it,expect} from "vitest";
import {expandJourneySequence} from "../shared/adventureBoardDefinition";

// The map artist paints every spelling board. Code draws a portal only where the artist placed
// nothing — a portal it skipped, or every portal when it refused (2026-10-14 and 2026-10-19 both
// stopped the whole board). This fallback layout is that plain canvas, so it must always be tidy.
const layout=async()=>(await import("../shared/boardLayout")) as unknown as {
  layoutJourney:(journey:ReturnType<typeof expandJourneySequence>)=>{positions:Record<string,{landscape:{x:number;y:number};portrait:{x:number;y:number}}>;overCapacity:boolean};
  THEME_PRESETS:ReadonlyArray<{id:string;background:{type:string;value:string};palette:Record<string,string>}>;
};

// The kiosk composition areas and the largest labeled portal (BOARD_CANVAS_AUTHORING_CONSTRAINTS).
const AREAS={landscape:{width:980,height:400},portrait:{width:608,height:714}} as const;
const PORTAL={width:116,height:186};

function journeyOf(opening:number,options:number[],closing:number){
  let n=0;const id=()=>`a${++n}`;
  const open=Array.from({length:opening},id),opts=options.map(length=>Array.from({length},id)),close=Array.from({length:closing},id);
  const nodes=[...open,...opts.flat(),...close].map(nodeId=>({id:nodeId,title:nodeId}));
  return expandJourneySequence({title:"Map",endpointLabel:"Done",opening:open,closing:close,
    ...(opts.length>=2?{choice:{purpose:"Which way?",label:"Fork",options:opts.map((nodeIds,i)=>({id:`o${i}`,label:`Way ${i}`,hypothesis:"h",nodeIds}))}}:{singlePathReason:"one path"})},nodes);
}
/** Every journey shape the Planner can author: at most 12 activities, at most one choice of 2–3 options. */
function* shapes(){
  for(let opening=0;opening<=6;opening++)for(let closing=0;closing<=6;closing++){
    if(opening+closing>=1&&opening+closing<=12)yield journeyOf(opening,[],closing);
    for(const count of [2,3])for(let length=1;length<=4;length++){
      const total=opening+closing+count*length;
      if(total<=12)yield journeyOf(opening,Array(count).fill(length),closing);
    }
  }
}
const longest=(journey:ReturnType<typeof journeyOf>)=>{
  const root=journey.paths.find(path=>path.id===journey.rootPathId)!.portalIds.length;
  const branch=Math.max(0,...journey.paths.filter(path=>path.id!==journey.rootPathId).map(path=>path.portalIds.length));
  return root+branch;
};
function overlaps(positions:Record<string,{landscape:{x:number;y:number};portrait:{x:number;y:number}}>,orientation:"landscape"|"portrait"){
  const area=AREAS[orientation],ids=Object.keys(positions),hits:string[]=[];
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
    const a=positions[ids[i]][orientation],b=positions[ids[j]][orientation];
    if(Math.abs(a.x-b.x)*area.width<PORTAL.width&&Math.abs(a.y-b.y)*area.height<PORTAL.height)hits.push(`${ids[i]}~${ids[j]}`);
  }
  return hits;
}

describe("fallback layout for portals the artist did not place",()=>{
  it("places every portal of every authored shape inside the canvas, within capacity without overlap",async()=>{
    const {layoutJourney}=await layout();let checked=0;
    for(const journey of shapes()){
      const {positions,overCapacity}=layoutJourney(journey);
      expect(Object.keys(positions).sort()).toEqual(journey.portals.map(portal=>portal.id).sort());
      for(const position of Object.values(positions))for(const point of [position.landscape,position.portrait]){
        expect(point.x).toBeGreaterThanOrEqual(0);expect(point.x).toBeLessThanOrEqual(1);
        expect(point.y).toBeGreaterThanOrEqual(0);expect(point.y).toBeLessThanOrEqual(1);
      }
      // Within capacity (7 steps across in landscape, 12 stops in portrait) nothing touches.
      const fits=longest(journey)<=7&&journey.portals.length<=12;
      expect(overCapacity).toBe(!fits);
      if(fits){expect(overlaps(positions,"landscape")).toEqual([]);expect(overlaps(positions,"portrait")).toEqual([]);}
      // Over capacity the board still publishes: every portal keeps its own spot.
      for(const orientation of ["landscape","portrait"] as const)
        expect(new Set(Object.values(positions).map(p=>`${p[orientation].x.toFixed(3)},${p[orientation].y.toFixed(3)}`)).size).toBe(journey.portals.length);
      checked+=1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("keeps the level badge and Elli's corner clear and draws a fork as separate lanes",async()=>{
    const {layoutJourney}=await layout();
    for(const journey of shapes()){
      const {positions}=layoutJourney(journey);
      for(const position of Object.values(positions))for(const point of [position.landscape,position.portrait]){
        expect(point.x>0.85&&point.y>0.85,"Elli stands in the bottom-right corner").toBe(false);
        expect(point.x<0.15&&point.y<0.15,"the level badge sits top-left").toBe(false);
      }
      const options=journey.paths.filter(path=>path.id!==journey.rootPathId);
      if(options.length>=2){
        const lane=(path:typeof options[number])=>positions[path.portalIds[0]].landscape.y;
        expect(new Set(options.map(lane)).size).toBe(options.length);
      }
    }
  });

  it("is a pure function of the journey",async()=>{
    const {layoutJourney}=await layout();
    const journey=journeyOf(2,[2,3],1);
    expect(layoutJourney(journey)).toEqual(layoutJourney(structuredClone(journey)));
  });
});

const luminance=(hex:string)=>{
  const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4);
  return 0.2126*r+0.7152*g+0.0722*b;
};
const contrast=(a:string,b:string)=>{const [x,y]=[luminance(a),luminance(b)].sort((m,n)=>n-m);return (x+0.05)/(y+0.05);};

describe("theme presets the artist chooses from",()=>{
  it("offer several looks on the illustrated world, each with readable labels",async()=>{
    const {THEME_PRESETS}=await layout();
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(3);
    expect(new Set(THEME_PRESETS.map(preset=>preset.id)).size).toBe(THEME_PRESETS.length);
    for(const preset of THEME_PRESETS){
      expect(preset.background).toEqual({type:"image",value:"/generated/adventure-board-demo/silent-letter-world.jpeg"});
      expect(Object.keys(preset.palette).sort()).toEqual(["available","completed","current","locked","panel","path","preview","text"]);
      for(const colour of Object.values(preset.palette))expect(colour).toMatch(/^#[0-9a-f]{6}$/i);
      expect(contrast(preset.palette.text,preset.palette.panel),`${preset.id} label contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
