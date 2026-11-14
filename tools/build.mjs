// Build index.html from src/game.src.html + src/mapdata.js.  Usage: node tools/build.mjs [out.html]
import fs from 'fs';
const src = fs.readFileSync('src/game.src.html','utf8'), data = fs.readFileSync('src/mapdata.js','utf8');
const out = process.argv[2] || 'index.html';
fs.writeFileSync(out, src.replace('/*MAPDATA*/', data));
const v = (src.match(/const VERSION = "([^"]+)"/)||[])[1];
console.log(`built ${out} (${v}, ${fs.statSync(out).size} bytes)`);
