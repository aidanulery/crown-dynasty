// Screenshot coastlines at several zoom levels with the fog lifted, for visual review.
// Usage: node tools/coast-shots.mjs [index.html] [outdir]   (needs puppeteer-core and Chrome)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const file = process.argv[2] || 'index.html', outdir = process.argv[3] || 'coast-shots';
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
await p.click('#sidetog'); await new Promise(r=>setTimeout(r,500));
await p.click('#zout'); await p.click('#zout'); await p.click('#zout'); await new Promise(r=>setTimeout(r,600));
await p.screenshot({path:`${outdir}/00-overview.png`});
// zoomed tour: drag the map around at 3x zoom
await p.click('#zreset'); await new Promise(r=>setTimeout(r,1000));
for(let i=0;i<3;i++){ await p.click('#zin'); await new Promise(r=>setTimeout(r,250)); }
const drag=async(dx,dy)=>{ await p.mouse.move(800,450); await p.mouse.down(); for(let k=1;k<=10;k++) await p.mouse.move(800+dx*k/10,450+dy*k/10); await p.mouse.up(); await p.evaluate(()=>window.getSelection()?.removeAllRanges()); await new Promise(r=>setTimeout(r,450)); };
// Britain & Ireland, then the Channel, France, Iberia's north coast, the Low Countries and Denmark
const tour=[[0,0],[300,0],[0,-300],[-300,0],[-300,0],[0,300],[0,300],[300,0],[300,0],[300,0],[0,-300],[0,-300],[-600,-300],
  [0,-500],[0,-400],[300,0],[0,-400],[-300,0],[-400,0],[0,400],[-400,0],[0,500],[0,500],[-400,0],[0,300]];
let n=1; for(const [dx,dy] of tour){ await drag(dx,dy); await p.screenshot({path:`${outdir}/${String(n++).padStart(2,'0')}-zoom.png`}); }
console.log(`saved ${n} screenshots to ${outdir}/`, errs.length?('page errors: '+errs.join('; ')):'');
await b.close();
