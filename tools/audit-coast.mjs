// Coastline audit for Crown & Dynasty. Usage: node tools/audit-coast.mjs [path/to/mapdata.js]
// Exit code 0 = PASS, 1 = FAIL. Prints a report.
import fs from 'fs';
const file = process.argv[2] || 'mapdata.js';
const src = fs.readFileSync(file,'utf8');
const D = new Function(src + '\nreturn {LAND_PATH,PLACES_RAW,CELLS,TOWNCELL,NEI,MAPMETA};')();
const {LAND_PATH,PLACES_RAW,CELLS,TOWNCELL,NEI,MAPMETA} = D;
const NOM = MAPMETA.NOM, REG = MAPMETA.REG;
const rings = s => s.split('M').slice(1).map(r=>[...r.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(m=>[+m[1],+m[2]]));
const sarea = p => { let a=0; for(let i=0,j=p.length-1;i<p.length;j=i++) a+=(p[j][0]+p[i][0])*(p[j][1]-p[i][1]); return a/2; };
const inRing = (x,y,p) => { let c=false; for(let i=0,j=p.length-1;i<p.length;j=i++) if((p[i][1]>y)!==(p[j][1]>y) && x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0]) c=!c; return c; };
const tiles = CELLS.map(c => { const R=rings(c[0]); let bb=[1e9,1e9,-1e9,-1e9]; for(const r of R) for(const [x,y] of r){ bb[0]=Math.min(bb[0],x); bb[1]=Math.min(bb[1],y); bb[2]=Math.max(bb[2],x); bb[3]=Math.max(bb[3],y); } return {R, bb, area:Math.abs(R.reduce((s,r)=>s+sarea(r),0)), home:c[1]}; });
const inTile = (x,y,t) => x>=t.bb[0]&&x<=t.bb[2]&&y>=t.bb[1]&&y<=t.bb[3] && t.R.reduce((c,r)=>c^inRing(x,y,r),false);
const land = rings(LAND_PATH); const landBB = land.map(r=>{let b=[1e9,1e9,-1e9,-1e9]; for(const [x,y] of r){b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);} return b;});
const inLand = (x,y) => { let c=false; for(let k=0;k<land.length;k++){ const b=landBB[k]; if(x<b[0]||x>b[2]||y<b[1]||y>b[3]) continue; if(inRing(x,y,land[k])) c=!c; } return c; };
// spatial index of tiles
const GS=20, grid=new Map(); tiles.forEach((t,i)=>{ for(let gx=Math.floor(t.bb[0]/GS); gx<=Math.floor(t.bb[2]/GS); gx++) for(let gy=Math.floor(t.bb[1]/GS); gy<=Math.floor(t.bb[3]/GS); gy++){ const k=gx+','+gy; if(!grid.has(k)) grid.set(k,[]); grid.get(k).push(i); } });
const tileAt = (x,y) => { for(const i of grid.get(Math.floor(x/GS)+','+Math.floor(y/GS))||[]) if(inTile(x,y,tiles[i])) return i; return -1; };
const issues = [], warn = [];
// 1. bare land: land points inside the tiled region (minus a 4px seam margin) that no tile covers
const STEP=1.5, M=4; let landPts=0, bare=[];
for(let y=REG[1]+M; y<=REG[3]-M; y+=STEP) for(let x=REG[0]+M; x<=REG[2]-M; x+=STEP){ if(!inLand(x,y)) continue; landPts++; if(tileAt(x,y)<0) bare.push([x,y]); }
const clusters=[]; for(const p of bare){ const c=clusters.find(c=>Math.hypot(c.x-p[0],c.y-p[1])<8); if(c){ c.n++; } else clusters.push({x:p[0],y:p[1],n:1}); }
const bigBare = clusters.filter(c=>c.n>=4);
if(bigBare.length) issues.push(`Bare (untiled) land patches: ${bigBare.length} — e.g. ${bigBare.slice(0,6).map(c=>`(${c.x.toFixed(0)},${c.y.toFixed(0)}) ${c.n}pts`).join(', ')}`);
const coverage = 100*(1 - bare.length/Math.max(1,landPts));
// 2. slivers: tiles smaller than 30% of a normal tile
const tiny = tiles.map((t,i)=>[i,t.area]).filter(([i,a])=>a<0.3*NOM);
if(tiny.length) issues.push(`Sliver tiles (<30% of a normal tile): ${tiny.length} — ${tiny.slice(0,8).map(([i,a])=>`#${i} ${a.toFixed(0)}px²`).join(', ')}`);
// 3. unclaimed coastal scraps next to a full owned tile
const scraps = tiles.map((t,i)=>i).filter(i=>{ const t=tiles[i]; if(t.home>=0 || t.area>=0.7*NOM) return false; return NEI[i].some(j=>tiles[j].home>=0 && tiles[j].area>=0.7*NOM); });
if(scraps.length) issues.push(`Unclaimed scraps (<70% tile) beside a claimed tile: ${scraps.length} — ${scraps.slice(0,8).map(i=>`#${i} ${tiles[i].area.toFixed(0)}px²`).join(', ')}`);
// 4. towns sit on their own tile
PLACES_RAW.forEach((p,k)=>{ const i=TOWNCELL[k]; if(i==null||i<0){ issues.push(`Town ${p.name} has no tile`); return; } if(tiles[i].home!==k) issues.push(`Town ${p.name}'s tile is not homed to it`); if(!inTile(p.x,p.y,tiles[i])){ const t=tiles[i]; const near=t.R.some(r=>r.some(([x,y])=>Math.hypot(x-p.x,y-p.y)<6)); (near?warn:issues).push(`Town ${p.name} marker is ${near?"just":"well"} outside its tile`); } });
// 5. every tile connects (over land links) to a tile holding a town
{ const seen=new Uint8Array(tiles.length), q=[...TOWNCELL]; for(const i of q) seen[i]=1; while(q.length){ const i=q.pop(); for(const j of NEI[i]) if(!seen[j]){ seen[j]=1; q.push(j); } }
  const cut=tiles.map((t,i)=>i).filter(i=>!seen[i]); if(cut.length) issues.push(`Tiles cut off from every town (orphan islands): ${cut.length} — e.g. ${cut.slice(0,6).map(i=>`#${i} ${tiles[i].area.toFixed(0)}px²`).join(', ')}`); }
// 6. adjacency sanity
let asym=0; NEI.forEach((n,i)=>n.forEach(j=>{ if(!NEI[j].includes(i)) asym++; })); if(asym) issues.push(`Asymmetric neighbour links: ${asym}`);
const isolated = NEI.map((n,i)=>i).filter(i=>!NEI[i].length && tiles[i].area>=0.3*NOM); if(isolated.length) warn.push(`Island tiles with no land neighbours (expected for real islands): ${isolated.length}`);
console.log(`Coastline audit — ${tiles.length} tiles, ${PLACES_RAW.length} towns`);
console.log(`  land coverage inside tiled region: ${coverage.toFixed(2)}% (${bare.length} bare sample points of ${landPts})`);
console.log(`  smallest tile: ${Math.min(...tiles.map(t=>t.area)).toFixed(1)}px² (normal tile ≈ ${NOM}px²)`);
for(const w of warn) console.log('  note: '+w);
if(issues.length){ console.log('FAIL'); for(const s of issues) console.log('  ✗ '+s); process.exit(1); }
console.log('PASS'); process.exit(0);
