// Wordfeud-solver: trie + anchor/cross-check zetgeneratie (Appel–Jacobson-stijl).
// Puur en DOM-vrij; wordt gebruikt door server.mjs en de tests.
//
// Bord-representatie:
//   { size: 15,
//     bonus: string[size*size]   '' | 'dl' | 'tl' | 'dw' | 'tw'
//     tiles: (null | {letter, blank})[size*size] }
// Rack: string, kleine letters, '?' = blanco.

// Nederlandse Wordfeud-waarden (104 stenen, bron: wordfeud.help).
export const LETTER_VALUES = {
  a: 1, b: 4, c: 5, d: 2, e: 1, f: 4, g: 3, h: 4, i: 2, j: 4, k: 3, l: 3, m: 3,
  n: 1, o: 1, p: 4, q: 10, r: 2, s: 2, t: 2, u: 2, v: 4, w: 5, x: 8, y: 8, z: 5,
};
export const LETTER_COUNTS = {
  a: 7, b: 2, c: 2, d: 5, e: 18, f: 2, g: 3, h: 2, i: 4, j: 2, k: 3, l: 3, m: 3,
  n: 11, o: 6, p: 2, q: 1, r: 5, s: 5, t: 5, u: 3, v: 2, w: 2, x: 1, y: 1, z: 2,
  '?': 2,
};

// Spelvarianten. Scrabble-NL: officiële verdeling sinds 1998 (102 stenen),
// bingo +50 i.p.v. +40. De bordindeling hoort bij de server/UI, niet hier.
export const VARIANTS = {
  wordfeud: { values: LETTER_VALUES, counts: LETTER_COUNTS, bingo: 40 },
  scrabble: {
    values: {
      a: 1, b: 3, c: 5, d: 2, e: 1, f: 4, g: 3, h: 4, i: 1, j: 4, k: 3, l: 3, m: 3,
      n: 1, o: 1, p: 3, q: 10, r: 2, s: 2, t: 2, u: 4, v: 4, w: 5, x: 8, y: 8, z: 4,
    },
    counts: {
      a: 6, b: 2, c: 2, d: 5, e: 18, f: 2, g: 3, h: 2, i: 4, j: 2, k: 3, l: 3, m: 3,
      n: 10, o: 6, p: 2, q: 1, r: 5, s: 5, t: 5, u: 3, v: 2, w: 2, x: 1, y: 1, z: 2,
      '?': 2,
    },
    bingo: 50,
  },
};

// Accepteert een variantnaam ('wordfeud'/'scrabble') of een variantobject;
// onbekend of ontbrekend valt terug op wordfeud.
function resolveVariant(variant) {
  if (variant && typeof variant === 'object') return variant;
  return VARIANTS[variant] ?? VARIANTS.wordfeud;
}

const END = '$';

export function buildTrie(words) {
  const root = {};
  for (const w of words) {
    let n = root;
    for (const ch of w) n = n[ch] ?? (n[ch] = {});
    n[END] = 1;
  }
  return root;
}

// Haal een woord uit de trie (knooppunten blijven staan; alleen de
// eindmarkering verdwijnt). Geeft terug of het woord er stond.
export function removeWord(trie, w) {
  let n = trie;
  for (const ch of w) {
    n = n[ch];
    if (!n) return false;
  }
  if (!n[END]) return false;
  delete n[END];
  return true;
}

export function hasWord(trie, w) {
  let n = trie;
  for (const ch of w) {
    n = n[ch];
    if (!n) return false;
  }
  return !!n[END];
}

export function emptyBoard(size = 15) {
  return {
    size,
    bonus: Array(size * size).fill(''),
    tiles: Array(size * size).fill(null),
  };
}

function tileValue(t, values) {
  return t.blank ? 0 : (values[t.letter] ?? 0);
}

// Transponeer bord zodat de verticale pas dezelfde horizontale generator kan gebruiken.
function transpose(board) {
  const { size } = board;
  const bonus = Array(size * size);
  const tiles = Array(size * size);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      bonus[c * size + r] = board.bonus[r * size + c];
      tiles[c * size + r] = board.tiles[r * size + c];
    }
  return { size, bonus, tiles };
}

// Per lege cel: welke letters zijn verticaal toegestaan (null = onbeperkt, geen
// verticale buren) en de vaste som van de bestaande verticale letters
// (voor de kruiswoord-score).
function crossChecks(board, trie, values) {
  const { size, tiles } = board;
  const allow = Array(size * size).fill(null);
  const base = Array(size * size).fill(0);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (tiles[i]) continue;
      let above = '', below = '', sum = 0;
      for (let k = r - 1; k >= 0 && tiles[k * size + c]; k--) {
        above = tiles[k * size + c].letter + above;
        sum += tileValue(tiles[k * size + c], values);
      }
      for (let k = r + 1; k < size && tiles[k * size + c]; k++) {
        below += tiles[k * size + c].letter;
        sum += tileValue(tiles[k * size + c], values);
      }
      if (!above && !below) continue;
      const ok = new Set();
      for (const ch of 'abcdefghijklmnopqrstuvwxyz')
        if (hasWord(trie, above + ch + below)) ok.add(ch);
      allow[i] = ok;
      base[i] = sum;
    }
  }
  return { allow, base };
}

function findAnchors(board) {
  const { size, tiles } = board;
  const anchors = new Set();
  let any = false;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      if (!tiles[i]) continue;
      any = true;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        const j = rr * size + cc;
        if (!tiles[j]) anchors.add(j);
      }
    }
  if (!any) anchors.add((size >> 1) * size + (size >> 1)); // leeg bord: middenvak
  return anchors;
}

const MULT = { dl: [2, 1], tl: [3, 1], dw: [1, 2], tw: [1, 3], '': [1, 1] };

// Genereer alle horizontale zetten op `board`; roept report({row, col, word, score, marks}) aan.
// marks[k] hoort bij letter k van het woord: null = lag er al, anders {blank}.
// `pre` (optioneel): eerder berekende {cross, anchors} voor dit bord, zodat
// herhaalde aanroepen op hetzelfde bord (tegenstander-analyse) de dure
// kruiswoord-/ankeranalyse niet elke keer opnieuw doen.
function genHorizontal(board, trie, rackArr, report, pre, variant) {
  const { size, tiles, bonus } = board;
  const { values, bingo } = resolveVariant(variant);
  const { allow, base } = pre ? pre.cross : crossChecks(board, trie, values);
  const anchors = pre ? pre.anchors : findAnchors(board);

  const rack = {};
  for (const ch of rackArr) rack[ch] = (rack[ch] ?? 0) + 1;

  function record(row, endCol, word, marks) {
    const startCol = endCol - word.length + 1;
    let placedCount = 0, wordScore = 0, wordMult = 1, crossTotal = 0;
    for (let k = 0; k < word.length; k++) {
      const i = row * size + startCol + k;
      if (!marks[k]) { wordScore += tileValue(tiles[i], values); continue; }
      placedCount++;
      const val = marks[k].blank ? 0 : values[word[k]];
      const [lm, wm] = MULT[bonus[i] || ''];
      wordScore += val * lm;
      wordMult *= wm;
      if (allow[i]) crossTotal += (base[i] + val * lm) * wm; // kruiswoord door dit vak
    }
    if (placedCount === 0 || word.length < 2) return;
    let score = wordScore * wordMult + crossTotal;
    if (placedCount === 7) score += bingo;
    report({ row, col: startCol, word, score, marks: [...marks] });
  }

  // Breid vanaf `col` naar rechts uit; `placedAny` = al minstens één nieuwe steen gelegd.
  function extendRight(row, col, node, word, marks, placedAny) {
    const atEdge = col >= size;
    const i = row * size + col;
    const cellEmpty = !atEdge && !tiles[i];
    if (node[END] && placedAny && word.length >= 2 && (atEdge || cellEmpty))
      record(row, col - 1, word, marks);
    if (atEdge) return;
    if (cellEmpty) {
      const allowed = allow[i]; // null = geen verticale buren, alles mag
      for (const ch in node) {
        if (ch === END) continue;
        if (allowed && !allowed.has(ch)) continue;
        if (rack[ch] > 0) {
          rack[ch]--;
          marks.push({ blank: false });
          extendRight(row, col + 1, node[ch], word + ch, marks, true);
          marks.pop();
          rack[ch]++;
        }
        if (rack['?'] > 0) {
          rack['?']--;
          marks.push({ blank: true });
          extendRight(row, col + 1, node[ch], word + ch, marks, true);
          marks.pop();
          rack['?']++;
        }
      }
    } else {
      const ch = tiles[i].letter;
      if (node[ch]) {
        marks.push(null);
        extendRight(row, col + 1, node[ch], word + ch, marks, placedAny);
        marks.pop();
      }
    }
  }

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const i = row * size + col;
      if (!anchors.has(i) || tiles[i]) continue;

      if (col > 0 && tiles[row * size + col - 1]) {
        // Geval 1: direct links liggen stenen -> vast voorvoegsel door de trie lopen.
        let start = col;
        while (start > 0 && tiles[row * size + start - 1]) start--;
        let node = trie;
        const word = [], marks = [];
        for (let c = start; c < col && node; c++) {
          const ch = tiles[row * size + c].letter;
          node = node[ch];
          word.push(ch);
          marks.push(null);
        }
        if (node) extendRight(row, col, node, word.join(''), marks, false);
        continue;
      }

      // Geval 2: lege cellen links -> zelf een voorvoegsel leggen. Het prefix mag
      // alleen over aaneengesloten lege niet-anker cellen (anker-overlap zou
      // dubbele generatie geven; niet-anker betekent ook: geen cross-checks nodig).
      let maxLeft = 0;
      for (let c = col - 1; c >= 0; c--) {
        const j = row * size + c;
        if (tiles[j] || anchors.has(j)) break;
        maxLeft++;
      }
      maxLeft = Math.min(maxLeft, rackArr.length - 1);

      const growPrefix = (node, word, marks, left) => {
        extendRight(row, col, node, word, [...marks], false);
        if (left <= 0) return;
        for (const ch in node) {
          if (ch === END) continue;
          if (rack[ch] > 0) {
            rack[ch]--;
            growPrefix(node[ch], word + ch, [...marks, { blank: false }], left - 1);
            rack[ch]++;
          }
          if (rack['?'] > 0) {
            rack['?']--;
            growPrefix(node[ch], word + ch, [...marks, { blank: true }], left - 1);
            rack['?']++;
          }
        }
      };
      growPrefix(trie, '', [], maxLeft);
    }
  }
}

// Publieke API: geldige zetten, gesorteerd op score (hoog -> laag); standaard de top 30 — UI en
// server geven `limit: Infinity`.
export function findMoves(board, rackStr, trie, { limit = 30, variant } = {}) {
  const v = resolveVariant(variant);
  const rackArr = [...rackStr.toLowerCase()].filter((ch) => ch === '?' || v.values[ch]);
  if (rackArr.length === 0) return [];
  const best = new Map();

  const collect = (dir) => (m) => {
    const startCol = m.col;
    const placed = [];
    for (let k = 0; k < m.word.length; k++) {
      if (!m.marks[k]) continue;
      const r = dir === 'h' ? m.row : startCol + k;
      const c = dir === 'h' ? startCol + k : m.row;
      placed.push({ row: r, col: c, letter: m.word[k], blank: m.marks[k].blank });
    }
    const move = dir === 'h'
      ? { dir, row: m.row, col: startCol, word: m.word, score: m.score, placed }
      : { dir, row: startCol, col: m.row, word: m.word, score: m.score, placed };
    const key = `${move.dir},${move.row},${move.col},${move.word}`;
    const prev = best.get(key);
    if (!prev || move.score > prev.score) best.set(key, move);
  };

  genHorizontal(board, trie, rackArr, collect('h'), undefined, v);
  genHorizontal(transpose(board), trie, rackArr, collect('v'), undefined, v);

  // Op een leeg bord genereren beide passen dezelfde zet door het midden;
  // ontdubbel op de daadwerkelijk gelegde stenen.
  const seen = new Set();
  const out = [];
  const sorted = [...best.values()].sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
  for (const m of sorted) {
    const contentKey = m.placed
      .map((p) => `${p.row},${p.col},${p.letter},${p.blank ? 1 : 0}`)
      .sort()
      .join(';');
    if (seen.has(contentKey)) continue;
    seen.add(contentKey);
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

// ---- Tegenstander-analyse -------------------------------------------------

// Resterende pot: de verdeling van de 104 stenen minus bordstenen (blanco's
// tellen als '?') minus de eigen rackletters. Dit is óók de pot na het spelen
// van een zet uit dat rack: stenen verhuizen dan van rack naar bord.
// Blanco-inferentie: liggen er van een letter méér exemplaren dan de verdeling
// heeft, dan zijn dat ongemarkeerde blanco's van de tegenstander (de speler
// kan niet altijd achterhalen welke tegenstander-steen een blanco was) — het
// surplus gaat van de blanco-voorraad af. Letters op 0 worden weggelaten; bij
// invoer die ook dan nog inconsistent is, stopt de blanco-telling op 0.
export function remainingPool(board, rackStr = '', variant) {
  const pool = { ...resolveVariant(variant).counts };
  let surplus = 0;
  const take = (ch) => {
    if (pool[ch] == null) return;
    if (pool[ch] > 0) pool[ch]--;
    else if (ch !== '?') surplus++;
  };
  for (const t of board.tiles) if (t) take(t.blank ? '?' : t.letter);
  for (const ch of (rackStr || '').toLowerCase()) take(ch);
  pool['?'] = Math.max(0, pool['?'] - surplus);
  for (const ch in pool) if (pool[ch] <= 0) delete pool[ch];
  return pool;
}

// Stenen die de tegenstander gegarandeerd op zijn rack heeft. De pot (= zak +
// rack tegenstander) telt `total` stenen; daarvan houdt de tegenstander er
// min(rackSize, total) vast, de rest zit in de zak. Elke letter die vaker in
// de pot zit dan er zakstenen zijn, ligt dus minstens (aantal − zak)× op zijn
// rack — is de zak leeg, dan is de hele pot zijn rack. De UI dupliceert deze
// afleiding in index.html (renderOppRack) — gelijk houden.
export function certainOpponentTiles(pool, rackSize = 7) {
  const total = Object.values(pool).reduce((a, b) => a + b, 0);
  const oppSize = Math.min(rackSize, total);
  const bag = total - oppSize;
  const certain = {};
  for (const ch in pool) if (pool[ch] > bag) certain[ch] = pool[ch] - bag;
  return { certain, oppSize, bag };
}

// Aantal verschillende rack-multisets van k stenen uit de pot (exact, via DP
// over de letterplafonds). findMoves hangt alleen af van de lettertelling van
// het rack, dus dit is de echte zoekruimte — veel kleiner dan C(n, k) over
// individuele stenen.
export function countDistinctRacks(pool, k = 7) {
  const caps = Object.values(pool);
  k = Math.min(k, caps.reduce((a, b) => a + b, 0));
  let dp = Array(k + 1).fill(0);
  dp[0] = 1;
  for (const cap of caps) {
    const next = Array(k + 1).fill(0);
    for (let s = 0; s <= k; s++) {
      if (!dp[s]) continue;
      for (let t = 0; t <= cap && s + t <= k; t++) next[s + t] += dp[s];
    }
    dp = next;
  }
  return dp[k];
}

// Genereer elke mogelijke rack-multiset (als gesorteerde string) van k stenen
// uit de pot. Bij minder dan k stenen in de pot: één rack met alles wat er
// nog is. Het aantal opbrengsten is precies countDistinctRacks(pool, k).
export function* distinctRacks(pool, k = 7) {
  const letters = Object.keys(pool).sort();
  const suffix = Array(letters.length + 1).fill(0);
  for (let i = letters.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + pool[letters[i]];
  k = Math.min(k, suffix[0]);
  function* gen(i, need, acc) {
    if (need === 0) { yield acc; return; }
    const ch = letters[i]; // suffix[i] >= need > 0 garandeert i < letters.length
    for (let take = Math.min(pool[ch], need); take >= 0; take--) {
      if (suffix[i + 1] < need - take) break; // rest van de pot te klein
      yield* gen(i + 1, need - take, acc + ch.repeat(take));
    }
  }
  yield* gen(0, k, '');
}

// Bereid een bord eenmalig voor en geef een functie terug die per rack het
// aantal geldige zetten telt: exact het aantal dat findMoves (limit ∞) zou
// teruggeven, met dezelfde dubbele ontdubbeling — beste variant per
// (richting, positie, woord) en daarna uniek op de gelegde stenen — maar
// zonder de zetten zelf op te bouwen of te sorteren.
export function makeMoveCounter(board, trie, variant) {
  const v = resolveVariant(variant);
  const tb = transpose(board);
  const pre = {
    h: { cross: crossChecks(board, trie, v.values), anchors: findAnchors(board) },
    v: { cross: crossChecks(tb, trie, v.values), anchors: findAnchors(tb) },
  };
  return function countMoves(rackStr) {
    const rackArr = [...rackStr.toLowerCase()].filter((ch) => ch === '?' || v.values[ch]);
    if (rackArr.length === 0) return 0;
    const best = new Map(); // (dir,rij,kolom,woord) -> {score, content}
    const collect = (dir) => (m) => {
      const row = dir === 'h' ? m.row : m.col;
      const col = dir === 'h' ? m.col : m.row;
      const key = `${dir},${row},${col},${m.word}`;
      const prev = best.get(key);
      if (prev && prev.score >= m.score) return; // zelfde tie-break als findMoves: eerste wint
      const parts = [];
      for (let k = 0; k < m.word.length; k++) {
        if (!m.marks[k]) continue;
        const r = dir === 'h' ? m.row : m.col + k;
        const c = dir === 'h' ? m.col + k : m.row;
        parts.push(`${r},${c},${m.word[k]},${m.marks[k].blank ? 1 : 0}`);
      }
      best.set(key, { score: m.score, content: parts.sort().join(';') });
    };
    genHorizontal(board, trie, rackArr, collect('h'), pre.h, v);
    genHorizontal(tb, trie, rackArr, collect('v'), pre.v, v);
    const contents = new Set();
    for (const v of best.values()) contents.add(v.content);
    return contents.size;
  };
}

// Score van een al bekende zet, zonder validatie of trie. `placed` zijn de
// nieuw gelegde stenen ({row, col, letter, blank}); `board` is de stand vóór
// de zet (de placed-vakken zijn dus leeg). Telt elk gevormd woord van ≥2
// letters (hoofdwoord + kruiswoorden) met letter-/woordbonussen alleen op de
// nieuwe stenen, plus de bingo-premie bij 7 nieuwe stenen — dezelfde regels
// als de score in genHorizontal. De UI gebruikt dit om handmatig ingevoerde
// (tegenstander-)zetten van punten te voorzien voor het paneel "Stand".
export function scoreMove(board, placed, variant) {
  const { values, bingo } = resolveVariant(variant);
  const { size } = board;
  const at = new Map();
  for (const p of placed) at.set(p.row * size + p.col, p);
  const tile = (r, c) => (r < 0 || c < 0 || r >= size || c >= size)
    ? null
    : (at.get(r * size + c) ?? board.tiles[r * size + c]);
  let total = 0;
  const seen = new Set(); // (richting, startcel) — elk woord één keer tellen
  for (const p of placed) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      let r = p.row, c = p.col;
      while (tile(r - dr, c - dc)) { r -= dr; c -= dc; }
      const key = `${dr},${r * size + c}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let len = 0, wordScore = 0, wordMult = 1;
      for (let t; (t = tile(r, c)); r += dr, c += dc) {
        len++;
        const i = r * size + c;
        if (at.has(i)) {
          const [lm, wm] = MULT[board.bonus[i] || ''];
          wordScore += (t.blank ? 0 : values[t.letter] ?? 0) * lm;
          wordMult *= wm;
        } else {
          wordScore += tileValue(t, values);
        }
      }
      if (len >= 2) total += wordScore * wordMult;
    }
  }
  if (placed.length === 7) total += bingo;
  return total;
}

// Pas een zet toe: geeft een nieuw bord en de verbruikte rackletters ('?' voor blanco).
export function applyMove(board, move) {
  const next = { ...board, tiles: [...board.tiles] };
  const used = [];
  for (const p of move.placed) {
    next.tiles[p.row * board.size + p.col] = { letter: p.letter, blank: p.blank };
    used.push(p.blank ? '?' : p.letter);
  }
  return { board: next, used };
}
