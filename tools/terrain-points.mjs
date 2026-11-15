// Step 1 of tile terrain: sample points inside every tile and convert them back to longitude/latitude,
// using the same projection as the map generator (src/gen.mjs). Writes terrain-points.json.
import fs from 'fs';
import * as d3 from 'd3-geo';
const W=1000,H=800;
const src=fs.readFileSync(process.argv[2]||'src/mapdata.js','utf8');
const CELLS=JSON.parse(src.match(/const CELLS=(\[.*?\]);\n/s)[1]);
const bbox={type:'Feature',geometry:{type:'MultiPoint',coordinates:[[-11,41.6],[10.5,41.6],[-11,57.5],[10.5,57.5]]}};
const proj=d3.geoConicConformal().rotate([-0.5,0]).parallels([44,54]).fitExtent([[80,70],[W-80,H-70]],bbox);
const rings=d=>d.split('M').slice(1).map(r=>[...r.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map(m=>[+m[1],+m[2]]));
const inside=(x,y,R)=>{ let c=false; for(const r of R) for(let i=0,j=r.length-1;i<r.length;j=i++){ const [xi,yi]=r[i],[xj,yj]=r[j]; if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) c=!c; } return c; };
const out=CELLS.map((c,k)=>{ const R=rings(c[0]); let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const r of R) for(const [x,y] of r){ x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y); }
 const step=Math.max(0.6, Math.sqrt((x1-x0)*(y1-y0))/9), pts=[];
 for(let y=y0+step/2;y<y1;y+=step) for(let x=x0+step/2;x<x1;x+=step) if(inside(x,y,R)){ const ll=proj.invert([x,y]); pts.push([+ll[0].toFixed(4),+ll[1].toFixed(4)]); }
 if(!pts.length){ const r=R[0], cx=r.reduce((a,p)=>a+p[0],0)/r.length, cy=r.reduce((a,p)=>a+p[1],0)/r.length, ll=proj.invert([cx,cy]); pts.push([+ll[0].toFixed(4),+ll[1].toFixed(4)]); }
 return {coastal:c[5]===1, pts}; });
fs.writeFileSync(process.argv[3]||'terrain-points.json', JSON.stringify(out));
console.log(`${out.length} tiles, ${out.reduce((a,t)=>a+t.pts.length,0)} sample points`);
