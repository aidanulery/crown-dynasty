// Crown & Dynasty map generator v2: exact coastline-clipped tiles, no slivers.
import fs from 'fs';
import * as d3 from 'd3-geo';
import {Delaunay} from 'd3-delaunay';
import * as topo from 'topojson-client';
import pc from 'polygon-clipping';
const W=1000,H=800, SP=+(process.env.SP||12), NOM=SP*SP;
const REG=[20,14,980,786];                      // tiled region; outside it the map fades to sea
const t = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-10m.json'));
const l0 = topo.feature(t, t.objects.land), g0 = l0.geometry || l0.features[0].geometry;
const land = {type:'Feature',geometry:{type:'MultiPolygon',coordinates:(g0.type==='MultiPolygon'?g0.coordinates:[g0.coordinates]).filter(p=>d3.geoArea({type:'Polygon',coordinates:p})<2*Math.PI)}};
const bbox={type:'Feature',geometry:{type:'MultiPoint',coordinates:[[-11,41.6],[10.5,41.6],[-11,57.5],[10.5,57.5]]}};
const proj=d3.geoConicConformal().rotate([-0.5,0]).parallels([44,54]).fitExtent([[80,70],[W-80,H-70]],bbox);
proj.clipExtent([[-170,-170],[W+170,H+170]]);
const LANDRAW=d3.geoPath(proj).digits(2)(land);
const GRAT=d3.geoPath(proj).digits(1)(d3.geoGraticule().step([5,5])());
// ---------- geometry helpers
const sarea=p=>{let a=0;for(let i=0,j=p.length-1;i<p.length;j=i++)a+=(p[j][0]+p[i][0])*(p[j][1]-p[i][1]);return a/2;};
const polyArea=poly=>Math.abs(sarea(poly[0]))-poly.slice(1).reduce((s,h)=>s+Math.abs(sarea(h)),0);
const mpArea=mp=>mp.reduce((s,p)=>s+polyArea(p),0);
function inRingPt(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])c=!c;}return c;}
const inPoly=(x,y,poly)=>inRingPt(x,y,poly[0])&&!poly.slice(1).some(h=>inRingPt(x,y,h));
const inMP=(x,y,mp)=>mp.some(p=>inPoly(x,y,p));
function centroid(mp){let A=0,cx=0,cy=0;for(const poly of mp)for(let r=0;r<poly.length;r++){const p=poly[r];for(let i=0,j=p.length-1;i<p.length;j=i++){const f=p[j][0]*p[i][1]-p[i][0]*p[j][1];A+=f;cx+=(p[j][0]+p[i][0])*f;cy+=(p[j][1]+p[i][1])*f;}}if(Math.abs(A)<1e-9){const q=mp[0][0][0];return q;}return [cx/(3*A),cy/(3*A)];}
function rdp(pts,eps){ if(pts.length<4) return pts; const keep=new Uint8Array(pts.length); keep[0]=keep[pts.length-1]=1; const st=[[0,pts.length-1]];
 while(st.length){ const [a,b]=st.pop(); let md=0,mi=-1; const [x1,y1]=pts[a],[x2,y2]=pts[b]; const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1e-9;
  for(let i=a+1;i<b;i++){ const d=Math.abs(dy*pts[i][0]-dx*pts[i][1]+x2*y1-y2*x1)/L; if(d>md){md=d;mi=i;} }
  if(md>eps){ keep[mi]=1; st.push([a,mi],[mi,b]); } }
 return pts.filter((_,i)=>keep[i]); }
// ---------- projected rings -> polygons with holes
const rawRings=LANDRAW.split('M').slice(1).map(s=>[...s.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m=>[+m[1],+m[2]]));
const hiRings=rawRings.map(r=>rdp(r,0.08)).filter(r=>r.length>=4&&Math.abs(sarea(r))>0.05);
const sgnExt=Math.sign(sarea(hiRings.reduce((a,b)=>Math.abs(sarea(a))>Math.abs(sarea(b))?a:b)));
const exts=hiRings.filter(r=>Math.sign(sarea(r))===sgnExt).map(r=>[r]);
for(const h of hiRings.filter(r=>Math.sign(sarea(r))!==sgnExt)){ const [x,y]=h[0]; let best=null,ba=1e18; for(const e of exts){ const a=Math.abs(sarea(e[0])); if(a<ba && inRingPt(x,y,e[0])){ba=a;best=e;} } if(best) best.push(h); }
const close=r=>{const q=r.slice(); if(q[0][0]!==q[q.length-1][0]||q[0][1]!==q[q.length-1][1]) q.push(q[0]); return q;};
const rect=(x0,y0,x1,y1)=>[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]];
// clip each landmass to the tiled region
const masses=[]; 
for(const e of exts){ const P=e.map(close); let bb=[1e9,1e9,-1e9,-1e9]; for(const [x,y] of P[0]){bb[0]=Math.min(bb[0],x);bb[1]=Math.min(bb[1],y);bb[2]=Math.max(bb[2],x);bb[3]=Math.max(bb[3],y);}
 if(bb[2]<REG[0]||bb[0]>REG[2]||bb[3]<REG[1]||bb[1]>REG[3]) continue;
 const mp=pc.intersection([P],rect(...REG)); if(!mp.length) continue;
 for(const poly of mp){ const a=polyArea(poly); if(a<0.02) continue; let b=[1e9,1e9,-1e9,-1e9]; for(const [x,y] of poly[0]){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);} masses.push({id:masses.length,poly,area:a,bb}); } }
const LAND_TOTAL=masses.reduce((s,m)=>s+m.area,0);
console.log('landmasses',masses.length,'area',LAND_TOTAL.toFixed(0));
// block-split big landmasses so per-tile clipping is cheap
const BS=48, blocks=[];
for(const m of masses){
 if(m.area < 4*NOM || (m.bb[2]-m.bb[0]<BS && m.bb[3]-m.bb[1]<BS)){ blocks.push({m:m.id,mp:[m.poly],bb:m.bb,full:false}); continue; }
 for(let x=Math.floor(m.bb[0]/BS)*BS;x<m.bb[2];x+=BS) for(let y=Math.floor(m.bb[1]/BS)*BS;y<m.bb[3];y+=BS){
  const mp=pc.intersection([m.poly],rect(x,y,x+BS,y+BS)); if(!mp.length) continue; const a=mpArea(mp);
  blocks.push({m:m.id,mp,bb:[x,y,x+BS,y+BS],full:a>BS*BS-0.01}); } }
console.log('blocks',blocks.length);
// ---------- voronoi tiles
let seed=20260;const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let q=Math.imul(seed^seed>>>15,1|seed);q=q+Math.imul(q^q>>>7,61|q)^q;return((q^q>>>14)>>>0)/4294967296;};
const pts=[]; for(let y=-110;y<=910;y+=SP)for(let x=-110;x<=1110;x+=SP)pts.push([x+(rnd()-.5)*SP*.9,y+(rnd()-.5)*SP*.9]);
const del=Delaunay.from(pts), vor=del.voronoi([-120,-120,1120,920]);
const SMALL_ISLAND = 0.35*NOM;
let units=[];   // {cell, m, mp, area}
for(let i=0;i<pts.length;i++){
 const poly=vor.cellPolygon(i); if(!poly) continue;
 let bb=[1e9,1e9,-1e9,-1e9]; for(const [x,y] of poly){bb[0]=Math.min(bb[0],x);bb[1]=Math.min(bb[1],y);bb[2]=Math.max(bb[2],x);bb[3]=Math.max(bb[3],y);}
 if(bb[2]<REG[0]||bb[0]>REG[2]||bb[3]<REG[1]||bb[1]>REG[3]) continue;
 const cand=blocks.filter(b=>!(b.bb[2]<bb[0]||b.bb[0]>bb[2]||b.bb[3]<bb[1]||b.bb[1]>bb[3]) && masses[b.m].area>=SMALL_ISLAND);
 if(!cand.length) continue;
 const byM=new Map();
 for(const b of cand){ const r=pc.intersection([[poly]],b.mp); if(r.length){ if(!byM.has(b.m)) byM.set(b.m,[]); byM.get(b.m).push(...r); } }
 for(const [m,parts] of byM){ const mp=parts.length>1?pc.union(...parts.map(p=>[p])):parts; for(const piece of mp){ const a=polyArea(piece); if(a>1e-3) units.push({cell:i,m,mp:[piece],area:a}); } }
}
// small islands become units to be attached later
for(const m of masses) if(m.area<SMALL_ISLAND) units.push({cell:-1,m:m.id,mp:[m.poly],area:m.area,island:true});
console.log('raw units',units.length);
// ---------- union-find merging
const par=units.map((_,i)=>i), find=x=>par[x]===x?x:(par[x]=find(par[x]));
const join=(a,b)=>{a=find(a);b=find(b); if(a!==b) par[a]=b; return b;};
const groupArea=()=>{ const g=new Map(); units.forEach((u,i)=>{const r=find(i); g.set(r,(g.get(r)||0)+u.area);}); return g; };
const cellUnits=new Map(); units.forEach((u,i)=>{ if(u.cell>=0){ if(!cellUnits.has(u.cell)) cellUnits.set(u.cell,[]); cellUnits.get(u.cell).push(i);} });
// unit adjacency: same landmass and voronoi-neighbouring cells (or same cell)
const uadj=units.map(()=>new Set());
units.forEach((u,i)=>{ if(u.cell<0) return; for(const j of [...del.neighbors(u.cell), u.cell]) for(const k of (cellUnits.get(j)||[])) if(k!==i && units[k].m===u.m) uadj[i].add(k); });
const C=units.map(u=>centroid(u.mp));
// land-touch adjacency: units whose outlines share a border (>= 2 common vertices), i.e. not just Voronoi
// neighbours facing each other across a bay, fjord or strait
const utouch=units.map(()=>new Set());
{ const vk=new Map(); units.forEach((u,i)=>{ const seen=new Set(); for(const poly of u.mp) for(const r of poly) for(const [x,y] of r){ const k=Math.round(x*100)+','+Math.round(y*100); if(seen.has(k)) continue; seen.add(k); if(!vk.has(k)) vk.set(k,[]); vk.get(k).push(i); } });
  const cnt=new Map(); for(const l of vk.values()) for(let a=0;a<l.length;a++) for(let b=a+1;b<l.length;b++){ const k=l[a]<l[b]?l[a]+'|'+l[b]:l[b]+'|'+l[a]; cnt.set(k,(cnt.get(k)||0)+1); }
  for(const [k,n] of cnt) if(n>=2){ const [a,b]=k.split('|').map(Number); if(units[a].m===units[b].m){ utouch[a].add(b); utouch[b].add(a); } } }
// 1) secondary pieces of a cell: keep if big, else merge into the largest neighbour they share a land border with
//    (not their own cell's main piece across a bay); only a piece touching nothing falls back to Voronoi neighbours
for(const [cell,list] of cellUnits){ if(list.length<2) continue; const main=list.reduce((a,b)=>units[a].area>=units[b].area?a:b);
 for(const k of list){ if(k===main || units[k].area>=0.5*NOM) continue; let nb=[...utouch[k]].filter(j=>units[j].cell!==cell); if(!nb.length) nb=[...uadj[k]].filter(j=>units[j].cell!==cell||j===main); if(nb.length){ const best=nb.reduce((a,b)=>units[a].area>=units[b].area?a:b); join(k,best);} } }
// 2) slivers: groups smaller than 30% of a tile merge into their largest land-touching neighbour (Voronoi neighbour if none)
for(let pass=0;pass<4;pass++){ const ga=groupArea(); let ch=0;
 units.forEach((u,i)=>{ if(u.island) return; const r=find(i); if(ga.get(r)>=0.3*NOM) return;
  let best=-1,ba=-1; for(const A of [utouch,uadj]){ for(let k=0;k<units.length;k++){ if(find(k)!==r) continue; for(const j of A[k]){ const rj=find(j); if(rj===r) continue; if(ga.get(rj)>ba){ba=ga.get(rj);best=rj;} } } if(best>=0) break; }
  if(best>=0){ join(r,best); ch++; ga.set(best,ga.get(best)+ga.get(r)); ga.set(r,0); } });
 if(!ch) break; }
// 3) small islands join the closest tile: the one with the nearest coast (outline point), any landmass
{ const V=units.map(u=>{ const v=[]; for(const poly of u.mp) for(const q of poly[0]) v.push(q); return v; });
  const BB=V.map(v=>{ let b=[1e9,1e9,-1e9,-1e9]; for(const [x,y] of v){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);} return b; });
 units.forEach((u,i)=>{ if(!u.island) return; const iv=V[i].filter((_,n)=>n%Math.ceil(V[i].length/60)===0); let best=-1,bd=1e9;
  units.forEach((v,k)=>{ if(v.island) return; const b=BB[k]; const lb=Math.hypot(Math.max(0,b[0]-BB[i][2],BB[i][0]-b[2]),Math.max(0,b[1]-BB[i][3],BB[i][1]-b[3])); if(lb>=bd) return;
   for(const [x,y] of V[k]) for(const [a,c] of iv){ const d=Math.hypot(x-a,y-c); if(d<bd){bd=d;best=k;} } });
  if(best>=0) join(i,best); }); }
// ---------- groups, ownership
let roots=[...new Set(units.map((_,i)=>find(i)))];
const places=JSON.parse(fs.readFileSync('places.json')).map(p=>{const [x,y]=proj([p.lon,p.lat]);return {...p,x:+x.toFixed(1),y:+y.toFixed(1)};});
function buildGroups(){ roots=[...new Set(units.map((_,i)=>find(i)))]; const G=roots.map(r=>({r,mem:[],area:0})); const idx=new Map(roots.map((r,k)=>[r,k]));
 units.forEach((u,i)=>{ const g=G[idx.get(find(i))]; g.mem.push(i); g.area+=u.area; });
 for(const g of G){ const main=g.mem.filter(i=>!units[i].island).reduce((a,b)=>a<0||units[b].area>units[a].area?b:a,-1); g.m=units[main>=0?main:g.mem[0]].m; let ax=0,ay=0,aw=0; for(const i of g.mem){ ax+=C[i][0]*units[i].area; ay+=C[i][1]*units[i].area; aw+=units[i].area; } g.c=[ax/aw,ay/aw]; }
 for(const g of G){ g.adj=new Set(); g.touch=new Set(); } G.forEach((g,k)=>{ for(const i of g.mem){ for(const j of uadj[i]){ const o=idx.get(find(j)); if(o!==k) g.adj.add(o); } for(const j of utouch[i]){ const o=idx.get(find(j)); if(o!==k){ g.touch.add(o); g.adj.add(o); } } } });
 return {G,idx}; }
let {G,idx}=buildGroups();
// town tiles
const townG=places.map(p=>{ let k=G.findIndex(g=>g.mem.some(i=>inMP(p.x,p.y,units[i].mp))); if(k<0){ let bd=1e9; G.forEach((g,j)=>{const d=Math.hypot(g.c[0]-p.x,g.c[1]-p.y); if(d<bd){bd=d;k=j;}}); } return k; });
places.forEach((p,t)=>{ p.m=G[townG[t]].m; });
function assignHomes(){ for(const g of G){ let best=-1,bs=1e9; places.forEach((p,k)=>{ if(p.m!==g.m) return; const d=Math.hypot(p.x-g.c[0],p.y-g.c[1]), s=d/(1+p.dev*.07); if(d<=140&&s<bs){bs=s;best=k;} }); g.home=best; } townG.forEach((k,t)=>{ G[k].home=t; }); }
assignHomes();
// 4) coastal wild scraps beside a full tile join that tile
{ let ch=0; const isCoastal=g=>g.mem.some(i=>units[i].cell>=0 && units[i].area < 0.97*Math.abs(sarea(vor.cellPolygon(units[i].cell))));
  G.forEach((g,k)=>{ if(g.home>=0 || g.area>=0.7*NOM) return; const nb=[...g.adj].filter(o=>G[o].home>=0 && G[o].area>=0.7*NOM); if(!nb.length) return; const best=nb.reduce((a,b)=>G[a].area>=G[b].area?a:b); join(g.r, G[best].r); ch++; });
  console.log('coastal scraps merged',ch); if(ch){ ({G,idx}=buildGroups()); for(let t=0;t<places.length;t++) townG[t]=G.findIndex(g=>g.mem.some(i=>inMP(places[t].x,places[t].y,units[i].mp))) ; places.forEach((p,t)=>{ if(townG[t]<0){ let bd=1e9; G.forEach((g,j)=>{const d=Math.hypot(g.c[0]-p.x,g.c[1]-p.y); if(d<bd){bd=d;townG[t]=j;}}); } }); assignHomes(); } }
// 5) islands without a town: small ones merge into the closest coastal tile; larger ones get homes + a link to the mainland
const LINKS=[];
function finalize(){
 ({G,idx}=buildGroups());
 for(let t=0;t<places.length;t++){ townG[t]=G.findIndex(g=>g.mem.some(i=>inMP(places[t].x,places[t].y,units[i].mp))); if(townG[t]<0){ let bd=1e9; G.forEach((g,j)=>{const d=Math.hypot(g.c[0]-places[t].x,g.c[1]-places[t].y); if(d<bd){bd=d;townG[t]=j;}}); } }
 assignHomes();
 for(const [a,b] of LINKS){ const ka=idx.get(find(a)), kb=idx.get(find(b)); if(ka==null||kb==null||ka===kb) continue; G[ka].adj.add(kb); G[kb].adj.add(ka); }
 const tm=new Set(places.map(p=>p.m));
 G.forEach(g=>{ if(g.home>=0 || tm.has(g.m)) return; let best=-1,bs=1e9; places.forEach((p,k)=>{ const d=Math.hypot(p.x-g.c[0],p.y-g.c[1]); if(d<=140 && d<bs){bs=d;best=k;} }); g.home=best; });
}
{ const townMass=new Set(places.map(p=>p.m)); const byMass=new Map(); G.forEach((g,k)=>{ if(!byMass.has(g.m)) byMass.set(g.m,[]); byMass.get(g.m).push(k); });
  const mainland=G.map((g,k)=>k).filter(k=>townMass.has(G[k].m));
  let merged=0;
  for(const [m,list] of byMass){ if(townMass.has(m)) continue; const area=list.reduce((s,k)=>s+G[k].area,0);
   let bi=-1,bm=-1,bd=1e9; for(const k of list) for(const j of mainland){ const d=Math.hypot(G[k].c[0]-G[j].c[0],G[k].c[1]-G[j].c[1]); if(d<bd){bd=d;bi=k;bm=j;} }
   if(bm<0) continue;
   if(area<1.5*NOM){ for(const k of list) join(G[k].r, G[bm].r); merged++; }
   else LINKS.push([G[bi].r, G[bm].r]); }
  console.log('town-less islands merged',merged,'linked',LINKS.length);
  finalize(); }
// 6) final sweep: any unclaimed scrap beside a claimed full tile joins it (repeat until clean)
for(let pass=0;pass<5;pass++){ let ch=0;
 G.forEach(g=>{ if(g.home>=0 || g.area>=0.7*NOM) return; const nb=[...g.adj].filter(o=>G[o].home>=0 && G[o].area>=0.7*NOM); if(!nb.length) return; const best=nb.reduce((a,b)=>G[a].area>=G[b].area?a:b); join(g.r, G[best].r); ch++; });
 if(!ch) break; finalize(); console.log('final sweep merged',ch); }
// 7) starting borders: each town holds only the land within a radius that grows with its development,
//    leaving wild, unexplored land between kingdoms. Slivers left beside a held tile join it.
//    Held land must reach its town over land borders (g.touch); a step across water (g.adj only) is allowed
//    only onto a tile that shares no land border with any tile (a one-tile island), so no kingdom starts
//    with a stranded patch on a far shore. A small wild tile that sits beside held land only across water,
//    and so cannot be held without being stranded, is merged into its largest land-touching neighbour.
const startR = p => 14 + p.dev*4.5;
const NOLAND = g => g.touch.size===0;
function startBorders(){
 G.forEach(g=>{ g.start = 0; if(g.home<0) return; const p=places[g.home]; if(Math.hypot(g.c[0]-p.x,g.c[1]-p.y) <= startR(p)) g.start=1; });
 townG.forEach(k=>{ G[k].start=1; });
 const prune=()=>{ const keep=new Uint8Array(G.length); townG.forEach((k,t)=>{ const q=[k]; keep[k]=1; while(q.length){ const i=q.pop();
    for(const j of G[i].adj) if(!keep[j] && G[j].start && G[j].home===t && (G[i].touch.has(j) || NOLAND(G[j]) || NOLAND(G[i]))){ keep[j]=1; q.push(j); } } });
  G.forEach((g,k)=>{ if(!keep[k]) g.start=0; }); };
 prune();
 const strand=[];
 for(let pass=0;pass<6;pass++){ let ch=0; strand.length=0;
  G.forEach((g,k)=>{ if(g.start || g.area>=0.7*NOM) return; const nb=[...g.adj].filter(o=>G[o].start && G[o].area>=0.7*NOM); if(!nb.length) return;
   const land=nb.filter(o=>g.touch.has(o) || NOLAND(g) || NOLAND(G[o]));
   if(!land.length){ strand.push(k); return; }
   const best=land.reduce((a,b)=>G[a].area>=G[b].area?a:b); g.start=1; g.home=G[best].home; ch++; });
  if(!ch) break; }
 return strand;
}
for(let round=0;round<6;round++){
 const strand=startBorders(); if(!strand.length) break;
 let merged=0; for(const k of strand){ const g=G[k]; const t=[...g.touch]; if(!t.length) continue; const best=t.reduce((a,b)=>G[a].area>=G[b].area?a:b); join(g.r, G[best].r); merged++; }
 console.log('start: wild scraps cut off by water merged into their land neighbour',merged);
 if(!merged) break; finalize();
}
console.log('start-held tiles',G.filter(g=>g.start).length,'of',G.length);
// ---------- output
const fmt=mp=>mp.map(poly=>poly.map(r=>'M'+r.slice(0,-1).map(v=>v[0].toFixed(1)+' '+v[1].toFixed(1)).join('L')+'Z').join('')).join('');
let vrng=20260; const vr=()=>{vrng=(vrng*16807)%2147483647;return vrng/2147483647;};
// coastal: a tile touches the sea if any of its pieces was cut by the coastline (its land area is smaller than its cell inside the tiled region) or is an island
const cellRegArea=new Map();
const isCoastUnit=u=>{ if(u.island||u.cell<0) return true; if(!cellRegArea.has(u.cell)){ const r=pc.intersection([[vor.cellPolygon(u.cell)]],rect(...REG)); cellRegArea.set(u.cell, mpArea(r)); } return u.area < cellRegArea.get(u.cell)-1e-4; };
const CELLS=G.map(g=>{ const parts=g.mem.map(i=>units[i].mp); const mp=parts.length>1?pc.union(...parts):parts[0]; return [fmt(mp), g.home, Math.floor(vr()*10), +g.area.toFixed(1), g.start, g.mem.some(i=>isCoastUnit(units[i]))?1:0]; });
console.log('coastal tiles',CELLS.filter(c=>c[5]).length);
const NEI=G.map(g=>[...g.adj]);
const area=p=>Math.abs(sarea(p));
function lod(eps,minA){ return rawRings.map(r=>{ if(area(r)<minA) return ''; const q=rdp(r,eps); if(q.length<3) return ''; return 'M'+q.map(v=>v[0].toFixed(1)+','+v[1].toFixed(1)).join('L')+'Z'; }).join(''); }
const out=places.map(({m,...p})=>p);
fs.writeFileSync('mapdata.js',`const LAND_PATH=${JSON.stringify(lod(0.08,0.05))};\nconst LAND_MID=${JSON.stringify(lod(0.25,0.6))};\nconst LAND_LO=${JSON.stringify(lod(0.7,4))};\nconst GRAT_PATH=${JSON.stringify(GRAT)};\nconst PLACES_RAW=${JSON.stringify(out)};\nconst CELLS=${JSON.stringify(CELLS)};\nconst TOWNCELL=${JSON.stringify(townG)};\nconst NEI=${JSON.stringify(NEI)};\nconst MAPMETA=${JSON.stringify({SP,NOM,REG,LAND_TOTAL:+LAND_TOTAL.toFixed(1)})};\n`);
console.log('tiles',CELLS.length,'owned',CELLS.filter(c=>c[1]>=0).length,'bytes',fs.statSync('mapdata.js').size);
