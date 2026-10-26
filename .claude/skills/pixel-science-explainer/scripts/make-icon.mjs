#!/usr/bin/env node
// Turn a text-grid sprite into a crisp pixel-art SVG.
// Usage: node make-icon.mjs <sprite.txt> <out.svg>
// sprite.txt: first lines map a char to a colour ("a=#ffd23f"), then a blank line,
// then the grid ("." = transparent). All rows must be the same length (16 or 24 wide).
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error("usage: make-icon.mjs <sprite.txt> <out.svg>"); process.exit(1); }

const [head, grid] = readFileSync(src, "utf8").trim().split(/\n\s*\n/);
const pal = {};
for (const line of head.split("\n")) {
  const m = line.trim().match(/^(\S)\s*=\s*(#[0-9a-fA-F]{3,8})$/);
  if (!m) { console.error(`bad palette line: ${line}`); process.exit(1); }
  pal[m[1]] = m[2];
}
const rows = grid.split("\n").map(r => r.trim());
const w = rows[0].length, h = rows.length;
if (rows.some(r => r.length !== w)) { console.error("rows differ in length"); process.exit(1); }

let rects = "";
rows.forEach((row, y) => {
  // merge horizontal runs of one colour into a single rect
  for (let x = 0; x < w;) {
    const c = row[x];
    let n = 1;
    while (x + n < w && row[x + n] === c) n++;
    if (c !== ".") {
      if (!pal[c]) { console.error(`no colour for '${c}' at row ${y}`); process.exit(1); }
      rects += `<rect x="${x}" y="${y}" width="${n}" height="${h ? 1 : 0}" fill="${pal[c]}"/>`;
    }
    x += n;
  }
});
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>\n`);
console.log(`wrote ${out} (${w}x${h})`);
