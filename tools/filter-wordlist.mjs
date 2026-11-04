// Filtert de OpenTaal-woordenlijst tot Wordfeud-speelbare woorden.
//
// Regels:
// - woorden met een hoofdletter (afkortingen, eigennamen) vervallen
// - diacrieten worden genormaliseerd (café -> cafe), zoals Wordfeud zelf doet
// - alleen a-z, lengte 2..15 (bordmaat), geen koppeltekens/apostrofs/spaties
// - dubbelen na normalisatie vervallen
//
// Gebruik:  node tools/filter-wordlist.mjs
// Woorden in data/removed.txt (via de UI geschrapt omdat Wordfeud ze niet
// accepteert) blijven er ook na her-filtering uit.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'data', 'wordlist.txt');
const dst = join(root, 'data', 'words.txt');

const removedFile = join(root, 'data', 'removed.txt');
const removed = existsSync(removedFile)
  ? new Set(readFileSync(removedFile, 'utf8').split('\n').filter(Boolean))
  : new Set();

const raw = readFileSync(src, 'utf8').split('\n');
const out = new Set();
let dropped = { case: 0, chars: 0, len: 0, removed: 0 };

for (let w of raw) {
  w = w.trim();
  if (!w) continue;
  if (/[A-ZÀ-Þ]/.test(w)) { dropped.case++; continue; }        // hoofdletter ergens = afkorting/eigennaam
  const norm = w.normalize('NFD').replace(/[̀-ͯ]/g, ''); // é -> e enz.
  if (!/^[a-z]+$/.test(norm)) { dropped.chars++; continue; }   // koppelteken, apostrof, spatie, cijfer
  if (norm.length < 2 || norm.length > 15) { dropped.len++; continue; }
  if (removed.has(norm)) { dropped.removed++; continue; }
  out.add(norm);
}

const words = [...out].sort();
writeFileSync(dst, words.join('\n') + '\n');
console.log(`bron: ${raw.length} regels`);
console.log(`weggefilterd: hoofdletters ${dropped.case}, tekens ${dropped.chars}, lengte ${dropped.len}, handmatig geschrapt ${dropped.removed}`);
console.log(`resultaat: ${words.length} woorden -> data/words.txt`);
