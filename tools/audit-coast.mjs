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
// 3. unclaimed scraps next to a full claimed tile — checked for the tile homes AND for the starting borders (CELLS[i][4])
const held = (i,mode) => mode==='home' ? tiles[i].home>=0 : CELLS[i][4]===1;
for(const mode of ['home','start']){
 const scraps = tiles.map((t,i)=>i).filter(i=>{ if(held(i,mode) || tiles[i].area>=0.7*NOM) return false; return NEI[i].some(j=>held(j,mode) && tiles[j].area>=0.7*NOM); });
 if(scraps.length) issues.push(`Unclaimed scraps (<70% tile) beside a claimed tile [${mode==='home'?'tile homes':'starting borders'}]: ${scraps.length} — ${scraps.slice(0,8).map(i=>`#${i} ${tiles[i].area.toFixed(0)}px²`).join(', ')}`);
}
// 3b. every town starts holding its own tile, and every starting-held tile connects to its town
if(CELLS[0].length>4){ const bad=[]; PLACES_RAW.forEach((p,k)=>{ if(CELLS[TOWNCELL[k]][4]!==1) bad.push(p.name); }); if(bad.length) issues.push(`Towns not holding their own tile at start: ${bad.join(', ')}`);
  const reach=new Uint8Array(tiles.length); TOWNCELL.forEach((c,k)=>{ const q=[c]; reach[c]=1; while(q.length){ const i=q.pop(); for(const j of NEI[i]) if(!reach[j] && CELLS[j][4]===1 && PLACES_RAW[CELLS[j][1]]?.realm===PLACES_RAW[k].realm){ reach[j]=1; q.push(j); } } });
  const cut=CELLS.map((c,i)=>i).filter(i=>CELLS[i][4]===1 && !reach[i]); if(cut.length) issues.push(`Starting-held tiles cut off from their kingdom: ${cut.length}`);
  console.log(`  starting borders: ${CELLS.filter(c=>c[4]===1).length} of ${CELLS.length} tiles held, the rest wild`); }
// 4. towns sit on their own tile
PLACES_RAW.forEach((p,k)=>{ const i=TOWNCELL[k]; if(i==null||i<0){ issues.push(`Town ${p.name} has no tile`); return; } if(tiles[i].home!==k) issues.push(`Town ${p.name}'s tile is not homed to it`); if(!inTile(p.x,p.y,tiles[i])){ const t=tiles[i]; const near=t.R.some(r=>r.some(([x,y])=>Math.hypot(x-p.x,y-p.y)<6)); (near?warn:issues).push(`Town ${p.name} marker is ${near?"just":"well"} outside its tile`); } });
// 5. every tile connects (over land links) to a tile holding a town
{ const seen=new Uint8Array(tiles.length), q=[...TOWNCELL]; for(const i of q) seen[i]=1; while(q.length){ const i=q.pop(); for(const j of NEI[i]) if(!seen[j]){ seen[j]=1; q.push(j); } }
  const cut=tiles.map((t,i)=>i).filter(i=>!seen[i]); if(cut.length) issues.push(`Tiles cut off from every town (orphan islands): ${cut.length} — e.g. ${cut.slice(0,6).map(i=>`#${i} ${tiles[i].area.toFixed(0)}px²`).join(', ')}`); }
// 6. adjacency sanity
let asym=0; NEI.forEach((n,i)=>n.forEach(j=>{ if(!NEI[j].includes(i)) asym++; })); if(asym) issues.push(`Asymmetric neighbour links: ${asym}`);
const isolated = NEI.map((n,i)=>i).filter(i=>!NEI[i].length && tiles[i].area>=0.3*NOM); if(isolated.length) warn.push(`Island tiles with no land neighbours (expected for real islands): ${isolated.length}`);
// 7. coastal flag (CELLS[i][5]): a tile is geometrically coastal if its outline runs along the coastline (LAND_PATH) —
//    i.e. it has edges whose both endpoints lie within TOL px of a LAND_PATH segment, totalling >= MINLEN px. Lake shores count as coast.
let coastLine='';
if(CELLS[0].length>5){
 const TOL=0.3, MINLEN=0.5, CG=4, seg=new Map();
 for(const r of land) for(let i=0;i<r.length;i++){ const a=r[i], b=r[(i+1)%r.length]; const s=[a[0],a[1],b[0],b[1]];
  for(let gx=Math.floor((Math.min(a[0],b[0])-TOL)/CG); gx<=Math.floor((Math.max(a[0],b[0])+TOL)/CG); gx++) for(let gy=Math.floor((Math.min(a[1],b[1])-TOL)/CG); gy<=Math.floor((Math.max(a[1],b[1])+TOL)/CG); gy++){ const k=gx+','+gy; if(!seg.has(k)) seg.set(k,[]); seg.get(k).push(s); } }
 const dseg=(x,y,s)=>{ const dx=s[2]-s[0], dy=s[3]-s[1], L=dx*dx+dy*dy; let t=L?((x-s[0])*dx+(y-s[1])*dy)/L:0; t=Math.max(0,Math.min(1,t)); return Math.hypot(x-s[0]-t*dx, y-s[1]-t*dy); };
 const onCoast=(x,y)=>{ for(const s of seg.get(Math.floor(x/CG)+','+Math.floor(y/CG))||[]) if(dseg(x,y,s)<=TOL) return true; return false; };
 const coastLen = tiles.map(t=>{ let L=0; for(const r of t.R){ const on=r.map(([x,y])=>onCoast(x,y)); for(let i=0;i<r.length;i++){ const j=(i+1)%r.length; if(on[i]&&on[j]){ const mx=(r[i][0]+r[j][0])/2, my=(r[i][1]+r[j][1])/2; if(onCoast(mx,my)) L+=Math.hypot(r[j][0]-r[i][0], r[j][1]-r[i][1]); } } } return L; });
 const geo = coastLen.map(L=>L>=MINLEN);
 const flagged = CELLS.filter(c=>c[5]===1).length;
 const missed = tiles.map((t,i)=>i).filter(i=>geo[i] && CELLS[i][5]!==1);   // touches sea but not flagged
 const extra  = tiles.map((t,i)=>i).filter(i=>!geo[i] && CELLS[i][5]===1);  // flagged but no coastline on outline
 coastLine = `  coastal flag: ${flagged} flagged, ${geo.filter(Boolean).length} touch the coastline geometrically; ${missed.length} unflagged coastal, ${extra.length} flagged inland`;
 const fmtL = a=>a.slice(0,8).map(i=>`#${i} (${((tiles[i].bb[0]+tiles[i].bb[2])/2).toFixed(0)},${((tiles[i].bb[1]+tiles[i].bb[3])/2).toFixed(0)}) coast ${coastLen[i].toFixed(1)}px`).join(', ');
 if(missed.length) issues.push(`Coastal tiles not flagged coastal (CELLS[i][5]): ${missed.length} — ${fmtL(missed)}`);
 if(extra.length) issues.push(`Inland tiles flagged coastal (CELLS[i][5]): ${extra.length} — ${fmtL(extra)}`);
}
console.log(`Coastline audit — ${tiles.length} tiles, ${PLACES_RAW.length} towns`);
if(coastLine) console.log(coastLine);
console.log(`  land coverage inside tiled region: ${coverage.toFixed(2)}% (${bare.length} bare sample points of ${landPts})`);
console.log(`  smallest tile: ${Math.min(...tiles.map(t=>t.area)).toFixed(1)}px² (normal tile ≈ ${NOM}px²)`);
for(const w of warn) console.log('  note: '+w);
if(issues.length){ console.log('FAIL'); for(const s of issues) console.log('  ✗ '+s); process.exit(1); }
console.log('PASS'); process.exit(0);
