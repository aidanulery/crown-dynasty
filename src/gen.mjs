import fs from 'fs';
import * as d3 from 'd3-geo';
import {Delaunay} from 'd3-delaunay';
import * as topo from 'topojson-client';
const t = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-10m.json'));
const land0 = topo.feature(t, t.objects.land);
const g0 = land0.geometry || land0.features[0].geometry;
const land = {type:'Feature',geometry:{type:'MultiPolygon',coordinates:(g0.type==='MultiPolygon'?g0.coordinates:[g0.coordinates]).filter(p=>d3.geoArea({type:'Polygon',coordinates:p})<2*Math.PI)}};
const W=1000,H=800;
const bbox={type:'Feature',geometry:{type:'MultiPoint',coordinates:[[-11,41.6],[10.5,41.6],[-11,57.5],[10.5,57.5]]}};
const proj=d3.geoConicConformal().rotate([-0.5,0]).parallels([44,54]).fitExtent([[80,70],[W-80,H-70]],bbox);
proj.clipExtent([[-170,-170],[W+170,H+170]]);
const d3path=d3.geoPath(proj).digits(1);
const LAND=d3path(land);
const GRAT=d3.geoPath(proj).digits(1)(d3.geoGraticule().step([5,5])());
const places=JSON.parse(fs.readFileSync('places.json')).map(p=>{const [x,y]=proj([p.lon,p.lat]);return {...p,x:+x.toFixed(1),y:+y.toFixed(1)};});
// rings of land in screen space
const rings=LAND.split('M').slice(1).map(s=>{const pts=[...s.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m=>[+m[1],+m[2]]);let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;for(const[p,q] of pts){x0=Math.min(x0,p);x1=Math.max(x1,p);y0=Math.min(y0,q);y1=Math.max(y1,q);}return {pts,b:[x0,y0,x1,y1]};});
function inRing(x,y,r){const b=r.b;if(x<b[0]||x>b[2]||y<b[1]||y>b[3])return false;let c=false;const p=r.pts;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])c=!c;}return c;}
const ringAt=(x,y)=>{for(let i=0;i<rings.length;i++)if(inRing(x,y,rings[i]))return i;return -1;};
// seeded random jittered points
let seed=20260;const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const SP=+(process.env.SP||13),pts=[];
for(let y=-110;y<=910;y+=SP)for(let x=-110;x<=1110;x+=SP)pts.push([x+(rnd()-.5)*SP*.9,y+(rnd()-.5)*SP*.9]);
const del=Delaunay.from(pts),vor=del.voronoi([-120,-120,1120,920]);
const cells=[];
for(let i=0;i<pts.length;i++){
 const poly=vor.cellPolygon(i);if(!poly)continue;const [sx,sy]=pts[i];
 let ring=-1;const samples=[[sx,sy],...poly.slice(0,-1).map(v=>[(v[0]+sx*1.2)/2.2,(v[1]+sy*1.2)/2.2])];
 for(const[x,y] of samples){const r=ringAt(x,y);if(r>=0){ring=r;break;}}
 if(ring<0)continue; if(sx<25||sx>975||sy<18||sy>782)continue;
 cells.push({i,poly,sx,sy,ring,town:-1,v:Math.floor(rnd()*10)});
}
// town cells
const byIdx=new Map(cells.map(c=>[c.i,c]));
const townCell=places.map((p,k)=>{
 const i=del.find(p.x,p.y);let c=byIdx.get(i);
 if(!c){let best=null,bd=1e9;for(const o of cells){const d=Math.hypot(o.sx-p.x,o.sy-p.y);if(d<bd){bd=d;best=o;}}const poly=vor.cellPolygon(i);c={i,poly,sx:pts[i][0],sy:pts[i][1],ring:best.ring,town:-1,v:5};cells.push(c);byIdx.set(i,c);}
 p.ring=c.ring;return i;});
for(const c of cells){let best=-1,bd=1e9;places.forEach((p,k)=>{if(p.ring!==c.ring)return;const d=Math.hypot(p.x-c.sx,p.y-c.sy)/(1+p.dev*.07);if(d<=140&&d<bd){bd=d;best=k;}});c.town=best;}
places.forEach((p,k)=>{byIdx.get(townCell[k]).town=k;});
const order=cells.map(c=>c.i), pos=new Map(order.map((v,k)=>[v,k]));
const CELLS=cells.map(c=>['M'+c.poly.slice(0,-1).map(v=>v[0].toFixed(1)+' '+v[1].toFixed(1)).join('L')+'Z',c.town,c.v]);
const NEI=cells.map(c=>[...del.neighbors(c.i)].filter(j=>pos.has(j)&&byIdx.get(j).ring===c.ring).map(j=>pos.get(j)));
const TOWNCELL=townCell.map(i=>pos.get(i));
const out=places.map(({ring,...p})=>p);
fs.writeFileSync('mapdata.js',`const LAND_PATH=${JSON.stringify(LAND)};\nconst GRAT_PATH=${JSON.stringify(GRAT)};\nconst PLACES_RAW=${JSON.stringify(out)};\nconst CELLS=${JSON.stringify(CELLS)};\nconst TOWNCELL=${JSON.stringify(TOWNCELL)};\nconst NEI=${JSON.stringify(NEI)};\n`);
console.log('rings',rings.length,'cells',CELLS.length,'owned',CELLS.filter(c=>c[1]>=0).length,'bytes',fs.statSync('mapdata.js').size,out.filter(p=>p.x<80||p.x>920||p.y<70||p.y>730).map(p=>p.id));
