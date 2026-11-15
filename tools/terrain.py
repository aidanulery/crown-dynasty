#!/usr/bin/env python3
"""Step 2 of tile terrain: classify every tile as plains, forest, mountain, coastal, marsh or swamp
from real geographic data, and write the result into src/mapdata.js as TERRAIN (one letter per tile:
p plains, f forest, m mountain, c coastal, a marsh, s swamp).

Sources (downloaded into tools/.geodata/, not committed):
  * Elevation: ETOPO1 global relief, resampled to 10 arc-minutes (NOAA; Fatiando a Terra packaging)
    https://github.com/fatiando-data/earth-topography-10arcmin/releases/download/v1/earth-topography-10arcmin.nc
  * Land cover colour: NASA Blue Marble Next Generation true-colour mosaic (bmng.jpg) and
    Natural Earth shaded relief (shadedrelief.jpg), both from the basemap-data 2.0.0 package on PyPI.
  * Wetlands: historically documented marshes, fens, bogs and wooded wetlands of the region (list below).

Usage:  node tools/terrain-points.mjs src/mapdata.js tools/.geodata/terrain-points.json   (needs d3-geo)
        python3 tools/terrain.py
"""
import json, math, os, sys, io, glob, zipfile, subprocess, urllib.request
import numpy as np, h5py
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__)); D = os.path.join(HERE, '.geodata'); os.makedirs(D, exist_ok=True)
TOPO = os.path.join(D, 'topo10.nc')
if not os.path.exists(TOPO):
    urllib.request.urlretrieve('https://github.com/fatiando-data/earth-topography-10arcmin/releases/download/v1/earth-topography-10arcmin.nc', TOPO)
if not os.path.exists(os.path.join(D, 'bmng.jpg')):
    subprocess.run([sys.executable, '-m', 'pip', 'download', '--no-deps', 'basemap-data==2.0.0', '-d', D, '-q'], check=True)
    z = zipfile.ZipFile(glob.glob(os.path.join(D, 'basemap_data-*.whl'))[0])
    for n in ('bmng.jpg', 'shadedrelief.jpg'): open(os.path.join(D, n), 'wb').write(z.read('mpl_toolkits/basemap_data/' + n))
T = json.load(open(os.path.join(D, 'terrain-points.json')))
f=h5py.File(TOPO); LON=f['longitude'][:]; LAT=f['latitude'][:]; Z=f['topography'][:].astype(float)
def elev(lo,la):
    fx=(lo-LON[0])/(LON[1]-LON[0]); fy=(la-LAT[0])/(LAT[1]-LAT[0]); x0=np.floor(fx).astype(int); y0=np.floor(fy).astype(int); tx=fx-x0; ty=fy-y0
    a=Z[y0,x0]*(1-tx)+Z[y0,x0+1]*tx; b=Z[y0+1,x0]*(1-tx)+Z[y0+1,x0+1]*tx; return a*(1-ty)+b*ty
bm=np.asarray(Image.open(os.path.join(D,'bmng.jpg'))).astype(float)          # Blue Marble NG, 5400x2700, true colour
sr=np.asarray(Image.open(os.path.join(D,'shadedrelief.jpg')).convert('L')).astype(float)  # shaded relief 10800x5400
def px(img,lo,la):
    h,w=img.shape[:2]; x=((lo+180)/360*w).astype(int).clip(0,w-1); y=((90-la)/180*h).astype(int).clip(0,h-1); return img[y,x]
stats=[]
for t in T:
    P=np.array(t['pts']); lo,la=P[:,0],P[:,1]
    e=elev(lo,la); c=px(bm,lo,la); g=px(sr,lo,la)
    # ruggedness: brightness changes between neighbouring shaded-relief pixels around each point
    h,w=sr.shape; x=((lo+180)/360*w).astype(int); y=((90-la)/180*h).astype(int)
    land=(e>0)&(c[:,2]<c[:,1])                      # dry land: above sea level and not water-coloured
    if land.sum()<3: land=e>-1e9
    rug=float(np.mean([np.abs(sr[y,x]-sr[y+dy,x+dx])[land].mean() for dx,dy in ((2,0),(0,2),(-2,0),(0,-2))]))
    el=e[land]
    stats.append(dict(coastal=t['coastal'], emean=float(np.mean(np.maximum(el,0))), emax=float(el.max()), estd=float(np.std(el)), rug=float(rug),
      r=float(c[land,0].mean()), g=float(c[land,1].mean()), b=float(c[land,2].mean()), lon=float(lo.mean()), lat=float(la.mean()), n=len(P)))

KM=111.0
# historically documented wetlands of the region (lon, lat, radius km)
MARSH=[(0.1,52.55,35,'The Fens'),(-2.85,51.15,18,'Somerset Levels'),(0.9,51.0,10,'Romney Marsh'),(-0.9,53.6,15,'Humberhead Levels'),(-2.6,53.5,14,'Lancashire mosses'),
 (-0.95,46.35,25,'Marais Poitevin'),(-2.25,47.37,10,'Brière'),(4.55,43.55,25,'Camargue'),(5.0,46.0,18,'Dombes'),(2.3,51.0,14,'Flemish marshes'),
 (4.6,52.2,40,'Holland'),(3.8,51.5,25,'Zeeland'),(6.2,53.25,30,'Friesland & Groningen'),(-8.0,53.25,14,'Shannon Callows')]
SWAMP=[(1.9,47.55,35,'Sologne'),(1.2,46.7,15,'Brenne'),(-0.8,44.25,55,'Landes de Gascogne'),(-7.1,53.3,32,'Bog of Allen'),(7.1,52.8,25,'Bourtanger Moor'),
 (8.9,53.3,15,'Teufelsmoor'),(5.8,51.35,15,'De Peel'),(-3.9,58.35,30,'Flow Country')]
def near(s,L):
    for lo,la,r,n in L:
        if math.hypot((s['lon']-lo)*math.cos(math.radians(la))*KM,(s['lat']-la)*KM) <= r: return n
    return None
out=[]; why=[]
for s in stats:
    bright=s['r']+s['g']+s['b']
    forest = bright<=125 and (s['g']-s['r'])<=17
    mountain = s['emean']>=1200 or (s['emean']>=450 and s['estd']>=60) or (s['emean']>=700 and s['estd']>=40) or (s['emean']>=180 and s['rug']>=17.5)
    lowflat = s['emean']<=6 and s['emax']<=15
    if mountain: t='mountain'
    elif near(s,SWAMP): t='swamp'
    elif near(s,MARSH) or lowflat: t='marsh' if not (lowflat and forest and not near(s,MARSH)) else 'swamp'
    elif s['coastal']: t='coastal'
    elif forest: t='forest'
    else: t='plains'
    out.append(t)
code = {'plains':'p','forest':'f','mountain':'m','coastal':'c','marsh':'a','swamp':'s'}
line = 'const TERRAIN=' + json.dumps(''.join(code[t] for t in out)) + ';\n'
mp = os.path.join(HERE, '..', 'src', 'mapdata.js'); src = open(mp).read()
src = ''.join(l for l in src.splitlines(True) if not l.startswith('const TERRAIN=')) + line
open(mp, 'w').write(src)
from collections import Counter; print(len(out), 'tiles:', dict(Counter(out)))
