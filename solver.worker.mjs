// Web Worker: bouwt de trie in de browser en draait findMoves én de
// rij-analyse (kolommen "Tegen" en "Zelf", zie "Rij-analyse" hieronder)
// buiten de UI-thread — afbreekbaar en met voortgangsberichten.
//
// De solver is puur en DOM-vrij, dus dezelfde module die server.mjs en de
// tests gebruiken draait hier ongewijzigd. Relatieve URL: de site staat onder
// /wordfeud-solver/, de dev-server serveert alles vanaf de root.
import {
  buildTrie, findMoves, applyMove, removeWord,
  remainingPool, distinctRacks, countDistinctRacks, makeMoveCounter,
} from './solver.mjs?v=2cf6e84225';

// De woordenlijst komt van de pagina: die laadt hem één keer (store.loadWords;
// dev van de server, de site van OpenTaal) en stuurt de tekst ({type:
// 'words'}) naar elke worker, of {type: 'words-error'} als laden mislukt. De
// trie wordt eenmalig gebouwd; daarna meldt de worker 'trie-ready'.
let wordsResolve, wordsReject;
const wordsPromise = new Promise((res, rej) => { wordsResolve = res; wordsReject = rej; });
let triePromise = null;
function getTrie() {
  if (!triePromise) {
    triePromise = wordsPromise.then((txt) => {
      const t0 = Date.now();
      const trie = buildTrie(txt.split('\n').filter(Boolean));
      self.postMessage({ type: 'trie-ready', ms: Date.now() - t0 });
      return trie;
    });
    triePromise.catch(() => {}); // de fout komt per solve/rij terug, niet als unhandled
  }
  return triePromise;
}

// ---- Rij-analyse (kolommen "Tegen" en "Zelf") ------------------------------
// Eén kandidaat-zet per bericht ('opp-row-start'): de UI-thread verdeelt de
// rijen dynamisch over een pool van workers en stuurt een volgende rij zodra
// een worker klaar is. Per rij, op een kopie van het bord mét de zet:
// - wantOpp ("Tegen"): max. aantal antwoordzetten van de tegenstander over
//   alle mogelijke rekken (7-multisets) uit de resterende pot.
// - wantSelf ("Zelf"): min/max aantal eigen vervolgzetten — het overgebleven
//   rack plus elke mogelijke bijtrekking uit de zak. Elke d-multiset uit de
//   pot (d = min(bij te trekken, zakgrootte)) is een mogelijke trekking: de
//   tegenstander kan altijd 7 van de overige potstenen vasthouden. Bij lege
//   zak is dit exact één rack en dus één exact getal.
// Beide delen delen dezelfde makeMoveCounter (bordvoorbereiding is de vaste
// kost per rij). Harde deadline per deel; tussendoor kort terug naar de
// event-loop zodat 'opp-cancel' (of een nieuwe 'solve') verwerkt wordt.
const OPP_ROW_BUDGET_MS = 5000;
let activeOppId = 0; // id van de lopende berekening; 0 = geen/geannuleerd

// Gedeelde sweep: max/min antwoordzetten over een reeks rekken, met budget,
// yields en voortgang. Geeft null terug bij cancel.
async function sweepRacks(racks, total, countMoves, msg, part) {
  const deadline = Date.now() + OPP_ROW_BUDGET_MS;
  let max = 0, min = Infinity, done = 0, timedOut = false;
  let lastYield = Date.now(), lastProgress = lastYield;
  for (const rack of racks) {
    const n = countMoves(rack);
    if (n > max) max = n;
    if (n < min) min = n;
    done++;
    const now = Date.now();
    if (now >= deadline && done < total) { timedOut = true; break; }
    if (now - lastYield >= 25) {
      await new Promise((r) => setTimeout(r));
      if (activeOppId !== msg.id) return null;
      lastYield = Date.now();
      if (lastYield - lastProgress >= 250) {
        lastProgress = lastYield;
        self.postMessage({ type: 'opp-progress', id: msg.id, index: msg.index, part, best: max, done, total });
      }
    }
  }
  return { max, min: done ? min : 0, done, total, timedOut };
}

async function runOppRow(msg) {
  const trie = await getTrie();
  if (activeOppId !== msg.id) return;
  const pool = remainingPool(msg.board, msg.rack, msg.variant);
  const { board, used } = applyMove(msg.board, msg.move);
  const countMoves = makeMoveCounter(board, trie, msg.variant);
  const out = { type: 'opp-row', id: msg.id, index: msg.index };
  if (msg.wantOpp) {
    const r = await sweepRacks(distinctRacks(pool, 7), countDistinctRacks(pool, 7), countMoves, msg, 'opp');
    if (!r) return;
    Object.assign(out, { max: r.max, done: r.done, total: r.total, timedOut: r.timedOut });
  }
  if (msg.wantSelf) {
    // Overgebleven rack: eigen letters minus wat de zet verbruikte.
    const left = [...(msg.rack || '').toLowerCase()];
    for (const ch of used) { const i = left.indexOf(ch); if (i >= 0) left.splice(i, 1); }
    const leftStr = left.join('');
    const totalPool = Object.values(pool).reduce((a, b) => a + b, 0);
    const bag = Math.max(0, totalPool - 7); // de tegenstander houdt er (max.) 7 vast
    const d = Math.min(7 - left.length, bag);
    const racks = (function* () { for (const D of distinctRacks(pool, d)) yield leftStr + D; })();
    const r = await sweepRacks(racks, countDistinctRacks(pool, d), countMoves, msg, 'self');
    if (!r) return;
    Object.assign(out, { selfMax: r.max, selfMin: r.min, selfDone: r.done, selfTotal: r.total, selfTimedOut: r.timedOut });
  }
  if (activeOppId !== msg.id) return;
  self.postMessage(out);
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'words') { wordsResolve(String(msg.text || '')); getTrie(); return; }
  if (msg.type === 'words-error') { wordsReject(new Error(msg.error || 'woordenlijst laden mislukt')); getTrie(); return; }
  if (msg.type === 'remove-word') {
    // Geschrapt woord ook uit deze trie; komt het vóór de lijst, dan wacht het erop.
    getTrie().then((t) => removeWord(t, String(msg.word || ''))).catch(() => {});
    return;
  }
  if (msg.type === 'opp-row-start') {
    activeOppId = msg.id;
    runOppRow(msg).catch((err) => {
      if (activeOppId === msg.id) activeOppId = 0;
      self.postMessage({ type: 'opp-error', id: msg.id, error: String((err && err.message) || err) });
    });
    return;
  }
  if (msg.type === 'opp-cancel') {
    if (activeOppId === msg.id) activeOppId = 0;
    return;
  }
  if (msg.type !== 'solve') return;
  try {
    const trie = await getTrie();
    const t = Date.now();
    // limit: Infinity — alle geldige zetten (zoals de oude server-solve).
    const moves = findMoves(msg.board, msg.rack, trie, { limit: Infinity, variant: msg.variant });
    self.postMessage({ type: 'solved', id: msg.id, moves, ms: Date.now() - t });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, error: String((err && err.message) || err) });
  }
};
