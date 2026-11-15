# Crown & Dynasty

A historical strategy game set in fictional 1500s Europe. Rule a kingdom, wage war, marry, raise heirs, colonise the New World, and grow your realm into an empire.

- `index.html` — latest build (currently **pre-alpha v0.1.1**). Open it in a browser.
- `versions/` — every released version, one folder each.
- `src/` — game source (`game.src.html`), map data (`mapdata.js`), town list (`places.json`) and the map generator (`gen.mjs`).
- `tools/` — `build.mjs` (builds `index.html`), `audit-coast.mjs` (coastline audit), `coast-shots.mjs` (coastline screenshots).
- `.claude/agents/coastline-auditor.md` — agent that audits coastlines and tiles on every update.

## Building
```
npm i --no-save d3-geo d3-delaunay topojson-client world-atlas@2 polygon-clipping puppeteer-core
node tools/build.mjs            # index.html from src/
node tools/audit-coast.mjs src/mapdata.js
```

## Versions
- v0.0.1 — first playable: map, war, marriage, children, colonies, succession.
- v0.0.2 — title screen; header text recoloured brown for readability.
- v0.0.3 — territory grid (Voronoi cells coloured by nation, city tiles highlighted), faded map edges, textured water, darker land, scroll-style popups, actions panel moved to the left, version shown top-left on title screen.
- v0.0.4 — brown text on the sovereign-selection screen (inputs, realm buttons, labels).
- v0.0.5 — darker brown UI; fog of war over foreign lands until explored (Send explorers, or click fogged land); home button smoothly flies to your realm; collapsible side panel; town markers scale with zoom.
- v0.0.6 — high-detail (1:10m) coastline and deeper zoom; ~2,400 smaller tiles; tiles owned independently of towns (claim wild land, occupy enemy land with yearly marches); smaller city markers; larger centered stats bar. Saves from earlier versions are not carried over.
- v0.0.7 — four seasons per year (End Season); fog lifts tile by tile, each expedition charting about a fifth of a hidden region; overseas exploration needs ships built in a port town and takes 2–4 seasons (sail out, map, sail home); darker, calmer sea. Earlier saves are not carried over.
- v0.0.8 — performance: coastline drawn at three levels of detail by zoom, SVG noise filters and masks replaced with pre-rendered textures, map moves as a GPU layer while dragging/zooming and redraws on release (~6× faster frames).
- v0.0.9 — tiles clipped exactly to the coastline (no bare or unclaimed slivers; small islands join the nearest tile, larger town-less islands are linked to the mainland); coastline-auditor agent + audit tools; game gutted to a core (map, fog & exploration, ships, seasons, gold, towns, war) — realm management, court & family, armies, prestige, stability and colonies removed for rebuilding (see `HOOK:` comments in `src/game.src.html`). Earlier saves are not carried over.
- v0.0.10 — 34 smaller kingdoms with wild, unexplored land between them; random ruler names each match; 12 gilded notches across the top (Explore, War, Romance, 8 reserved, Chronicle) replace the left bar; pages open as paper sheets over the full-width map; darker gilded old-paper UI. Earlier saves are not carried over.
- v0.1.0 — economy: +3 gold per held tile each season; tile developments (farm +6 food, fishery +5 food on coastal tiles, village +4 resources, gold mine level IV→I: +5/+10/+15/+25 gold); Food and Resources counters; towns and villages eat food, famine halves taxes and empties villages or borderlands; buildings cost gold and resources. Generator now flags coastal tiles. v0.0.10 saves carry over.
- v0.1.1 — people: towns hold 100 per development level, villages add 150/300; taxes +1 gold per 50 people; every 100 people eat 1 food. Resources now come only from held land left undeveloped (+1 a tile). Every build (including town development, walls and ships) costs resources. Villages grow each season into market villages and then into new, player-named cities with their own marker on the map. v0.1.0 saves carry over.
