// Browser-store (de site, zonder server): de spellen in localStorage, de
// woordenlijst van OpenTaal op een vastgepinde commit, in de browser
// gefilterd en in Cache Storage bewaard. Zelfde interface en antwoordvormen
// als store-server.mjs: createStore(deps) geeft state, newGame, select, save,
// removeWord en loadWords.
//
// Geen imports: de solver-module (emptyBoard, standardBonus, filterWords) en
// de opslag, cache, fetch en crypto komen als deps binnen. index.html geeft de
// echte mee, de tests nepversies (test/store-browser.test.mjs).
// Ontwerp: log-files/notes/pages-tool-plan-04-11-2026.md, secties 1 en 2.
//
// Alle bertblookers-sites delen één origin (en dus één localStorage van zo'n
// 5 MiB), daarom het voorvoegsel op elke sleutel en de woordenlijst in Cache
// Storage in plaats van localStorage.

export const PREFIX = 'wordfeud-solver:';
const META = PREFIX + 'meta';          // {currentId}
const GAME = PREFIX + 'game:';         // + id → het spel
const REMOVED = PREFIX + 'removed';    // de eigen schrappingen van de bezoeker
export const CACHE_NAME = 'wordfeud-solver';

// OpenTaal's wordlist.txt op één commit (de inhoud achter een commit-URL
// verandert nooit), met de SHA-256 van het bestand. Vastgelegd in stap 2 van
// het plan (de Build log in de plan-notitie).
export const WORDLIST = {
  commit: 'b250510dda431785f962019167d1415198ff3905',
  sha256: '12e5fb5e3c73840b583b30016926d1f63a75e9bf1652a3a6634b2ba7c49ad7be',
};
export const wordlistUrls = (commit) => [
  `https://raw.githubusercontent.com/OpenTaal/opentaal-wordlist/${commit}/wordlist.txt`,
  `https://cdn.jsdelivr.net/gh/OpenTaal/opentaal-wordlist@${commit}/wordlist.txt`,
];

// Opslag in het geheugen: de terugval als localStorage niet bruikbaar is
// (spellen blijven dan alleen tot het herladen bewaard).
export function memoryStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: (k) => { m.delete(String(k)); },
  };
}

function usable(s) {
  try {
    const k = PREFIX + 'probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return true;
  } catch { return false; }
}

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    if (s && usable(s)) return s;
  } catch { /* geblokkeerd: geheugen hieronder */ }
  return null;
}

const isQuota = (e) => !!e && (e.name === 'QuotaExceededError'
  || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);

const validId = (id) => typeof id === 'string' && /^[a-z0-9-]+$/.test(id);

export function createStore({
  solver,
  storage,
  caches,
  fetch,
  crypto,
  wordlist = WORDLIST,
  now = Date.now,
} = {}) {
  if (!solver) throw new Error('store-browser: solver ontbreekt');
  const store0 = storage ?? defaultStorage();
  const persistent = !!store0;
  const st = store0 ?? memoryStorage();
  const fetchFn = fetch ?? ((...a) => globalThis.fetch(...a));
  const cryptoObj = crypto ?? globalThis.crypto;
  const cachesObj = caches === undefined ? (() => { try { return globalThis.caches; } catch { return null; } })() : caches;

  const read = (k) => {
    try {
      const v = st.getItem(k);
      return v === null ? null : JSON.parse(v);
    } catch { return null; }
  };
  const write = (k, v) => {
    try { st.setItem(k, JSON.stringify(v)); } catch (e) {
      throw new Error(isQuota(e) ? 'opslag vol' : 'opslag: ' + ((e && e.message) || e));
    }
  };
  const readGame = (id) => (validId(id) ? read(GAME + id) : null);
  const readRemoved = () => {
    const r = read(REMOVED);
    return Array.isArray(r) ? r.filter((w) => typeof w === 'string') : [];
  };

  // De spellenlijst uit een scan van de sleutels met het voorvoegsel: geen
  // index die bijgehouden moet worden. Sleutels van andere sites en kapotte
  // waarden tellen niet mee.
  function listGames() {
    const keys = [];
    try { for (let i = 0; i < st.length; i++) keys.push(st.key(i)); } catch { /* lege lijst */ }
    return keys
      .filter((k) => typeof k === 'string' && k.startsWith(GAME))
      .map((k) => read(k))
      .filter((g) => g && validId(g.id))
      .map((g) => ({ id: g.id, name: g.name, created: g.created, updated: g.updated }))
      .sort((a, b) => b.created - a.created);
  }

  const answer = (game) => ({ currentId: game.id, games: listGames(), game });

  async function newGame(name, { layout } = {}) {
    const t = now();
    const id = 'g' + t.toString(36) + Math.random().toString(36).slice(2, 6);
    const board = solver.emptyBoard(15);
    board.bonus = layout === 'empty' ? Array(225).fill('') : solver.standardBonus(15);
    const g = {
      id,
      name: name || `Spel ${new Date(t).toLocaleDateString('nl-NL')}`,
      created: t,
      updated: t,
      variant: 'wordfeud', // 'wordfeud' | 'scrabble' (letterset + bingo; zie solver.mjs)
      board,
      rack: '',
    };
    write(GAME + id, g);
    write(META, { currentId: id });
    return answer(g);
  }

  async function openCache() {
    try { return cachesObj ? await cachesObj.open(CACHE_NAME) : null; } catch { return null; }
  }

  async function sha256Hex(buf) {
    const d = await cryptoObj.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // De ruwe OpenTaal-lijst: elke bron op volgorde, alleen met het juiste
  // controlegetal. ignoreBOM houdt een eventuele BOM, net als Node's
  // readFileSync, zodat site en dev-lijst gelijk filteren.
  async function fetchVerified() {
    let last = 'geen bron';
    for (const url of wordlist.urls ?? wordlistUrls(wordlist.commit)) {
      try {
        const r = await fetchFn(url);
        if (!r.ok) { last = `HTTP ${r.status}`; continue; }
        const buf = await r.arrayBuffer();
        if ((await sha256Hex(buf)) !== wordlist.sha256) { last = 'controlegetal klopt niet'; continue; }
        return new TextDecoder('utf-8', { ignoreBOM: true }).decode(buf);
      } catch (e) { last = String((e && e.message) || e); }
    }
    throw new Error(`woordenlijst niet te laden (${last})`);
  }

  return {
    kind: 'browser',
    persistent,

    async state() {
      const meta = read(META);
      const game = meta && readGame(meta.currentId);
      return game ? answer(game) : newGame();
    },

    newGame,

    async select(id) {
      const game = readGame(String(id));
      if (!game) throw new Error('spel niet gevonden');
      write(META, { currentId: game.id });
      return answer(game);
    },

    // Zelfde merge als de server: history en onbekende velden overleven.
    async save(g) {
      if (!g || !g.id) throw new Error('game ontbreekt');
      const old = readGame(String(g.id));
      if (!old) throw new Error('spel niet gevonden');
      const merged = { ...old, ...g, id: old.id, created: old.created, updated: now() };
      write(GAME + old.id, merged);
      return { ok: true, updated: merged.updated };
    },

    // De eigen schrappingen van de bezoeker; loadWords past ze toe. De UI
    // stuurt het woord daarnaast naar elke worker ({type: 'remove-word'}).
    async removeWord(word) {
      const w = String(word || '').toLowerCase();
      if (!/^[a-z]{2,15}$/.test(w)) throw new Error('ongeldig woord: ' + w);
      const list = readRemoved();
      if (list.includes(w)) return { ok: true, removed: false };
      list.push(w);
      list.sort();
      write(REMOVED, list);
      return { ok: true, removed: true };
    },

    // De gefilterde lijst als tekst (één woord per regel), zonder de eigen
    // schrappingen. Eerst Cache Storage; anders downloaden, controleren,
    // filteren en bewaren. Zonder Cache Storage (sommige privévensters)
    // downloadt hij elk bezoek opnieuw.
    async loadWords() {
      if (!wordlist.commit || !wordlist.sha256) throw new Error('geen vastgepinde woordenlijst');
      const key = `./words-${wordlist.commit}.txt`;
      const cache = await openCache();
      let text = null;
      if (cache) {
        try {
          const r = await cache.match(key);
          if (r) { const t = await r.text(); if (t) text = t; }
        } catch { /* cache onbruikbaar: downloaden */ }
      }
      if (text === null) {
        text = solver.filterWords(await fetchVerified()).words.join('\n');
        if (cache) {
          try {
            await cache.put(key, new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } }));
          } catch { /* niet bewaard: volgende keer opnieuw */ }
        }
      }
      const removed = new Set(readRemoved());
      return removed.size ? text.split('\n').filter((w) => !removed.has(w)).join('\n') : text;
    },
  };
}
