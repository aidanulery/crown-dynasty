// Screenshot coastlines at close zoom with the fog lifted, for visual review.
// Usage: node tools/coast-shots.mjs [index.html] [outdir] [viewWidth=240]   (needs puppeteer-core and Chrome)
// Moves the map view over a grid covering the whole tiled
// region, and keeps only the views that contain coastline, so the tour no longer depends on the UI layout
// or on where the player's realm starts. No clicks land on the map, so no info panel covers the shots.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const file = process.argv[2] || 'index.html', outdir = process.argv[3] || 'coast-shots', VW = +(process.argv[4] || 240);
fs.mkdirSync(outdir, {recursive:true});
const exe = ['/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(f=>fs.existsSync(f));
const b = await puppeteer.launch({executablePath:exe, args:['--no-sandbox']});
const p = await b.newPage(); await p.setViewport({width:1400,height:900});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+fs.realpathSync(file)); await new Promise(r=>setTimeout(r,800));
await p.click('#tnew'); await p.waitForSelector('#mch .btn'); await p.click('#mch .btn');
await p.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('crown-dynasty-save')), {timeout:15000});
// lift the fog: mark every tile as seen (inspection only)
await p.evaluate(()=>{ const k=Object.keys(localStorage).find(k=>k.startsWith('crown-dynasty-save')); const s=JSON.parse(localStorage.getItem(k)); s.seen=s.seen.map(()=>1); for(const r in s.realms) s.explored[r]=true; localStorage.setItem(k,JSON.stringify(s)); });
await p.reload(); await new Promise(r=>setTimeout(r,800)); await p.click('#tcont'); await new Promise(r=>setTimeout(r,800));

// The game keeps its view state inside a block scope, so drive it like a player: zoom buttons to reach the
// target width, then pointer drags (always > 4px, so no tile gets selected) until the viewBox is at the target.
const getVB = () => p.evaluate(()=>{ const [x,y,w,h]=document.getElementById('map').getAttribute('viewBox').split(/\s+/).map(Number); const s=document.getElementById('map'); return {x,y,w,h,cw:s.clientWidth,ch:s.clientHeight}; });
const rect = await p.evaluate(()=>{ const r=document.getElementById('map').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; });
const C = [rect.x+rect.w/2, rect.y+rect.h/2];
const drag = async (dx,dy) => { await p.mouse.move(C[0],C[1]); await p.mouse.down(); for(let k=1;k<=8;k++) await p.mouse.move(C[0]+dx*k/8, C[1]+dy*k/8); await p.mouse.up(); await new Promise(r=>setTimeout(r,120)); };
const setView = async (x,y,w) => {
  for(let t=0;t<12;t++){ const v=await getVB(); if(v.w>w*1.2) await p.click('#zin'); else if(v.w<w/1.2) await p.click('#zout'); else break; await new Promise(r=>setTimeout(r,260)); }
  await new Promise(r=>setTimeout(r,300));
  for(let t=0;t<8;t++){ const v=await getVB(), s=Math.max(v.w/v.cw, v.h/v.ch);
    const cx=x+v.w/2, cy=y+v.h/2; let dx=((v.x+v.w/2)-cx)/s, dy=((v.y+v.h/2)-cy)/s;
    if(Math.abs(dx)<6 && Math.abs(dy)<6) break;
    dx=Math.max(-rect.w*0.4,Math.min(rect.w*0.4,dx)); dy=Math.max(-rect.h*0.4,Math.min(rect.h*0.4,dy));
    if(Math.abs(dx)+Math.abs(dy)<=5) dx+=Math.sign(dx||1)*6; // keep it a drag, never a click
    await drag(dx,dy);
    const n=await getVB(); if(Math.abs(n.x-v.x)<1 && Math.abs(n.y-v.y)<1) break; // clamped at the map edge
  }
  return getVB();
};
const aspect = () => rect.w/rect.h;
// overview
for(let t=0;t<4;t++) await p.click('#zout'); await new Promise(r=>setTimeout(r,700));
await p.screenshot({path:`${outdir}/00-overview.png`});
// coastal grid: a view is kept if, on a 12x12 sample, any point is on a tile and at least 3% are not (so lone islets count)
const REG = await p.evaluate(()=>MAPMETA.REG), A = aspect();
const VH = VW/A, step=[VW*0.85, VH*0.85];
const views=[];
for(let y=REG[1]; y<REG[3]; y+=step[1]) for(let x=REG[0]; x<REG[2]; x+=step[0]){
  const frac = await p.evaluate((x,y,w,h)=>{ const svg=document.getElementById('map'); const tiles=[...document.querySelectorAll('#map .cell')]; let on=0,n=0;
    for(let i=0;i<12;i++) for(let j=0;j<12;j++){ const pt=svg.createSVGPoint(); pt.x=x+w*(i+.5)/12; pt.y=y+h*(j+.5)/12; n++; if(tiles.some(t=>t.isPointInFill&&t.isPointInFill(pt))) on++; }
    return on/n; }, x,y,VW,VH);
  if(frac>0 && frac<0.97) views.push([x,y,frac]);
}
let n=1;
for(const [x,y] of views){ const v=await setView(x,y,VW); await new Promise(r=>setTimeout(r,450));
  await p.screenshot({path:`${outdir}/${String(n++).padStart(2,'0')}-x${Math.round(v.x)}-y${Math.round(v.y)}.png`}); }
console.log(`saved ${n} screenshots (overview + ${views.length} coastal views at width ${VW}) to ${outdir}/`, errs.length?('page errors: '+errs.join('; ')):'');
await b.close();
