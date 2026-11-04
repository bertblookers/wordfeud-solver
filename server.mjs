// Wordfeud-solver server — dependency-vrij.
// Serveert public/ + JSON-API en bewaart spellen in data/games/.
// Gebruik: node server.mjs   (poort 6789, alleen loopback)
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { buildTrie, findMoves, removeWord, emptyBoard } from './solver.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 6789);
const HOST = process.env.HOST || '127.0.0.1';

const GAMES_DIR = join(root, 'data', 'games');
const META = join(root, 'data', 'meta.json');
mkdirSync(GAMES_DIR, { recursive: true });

// ---- woordenlijst + trie (eenmalig bij boot) ----
console.log('woordenlijst laden…');
const t0 = Date.now();
const WORDS_FILE = join(root, 'data', 'words.txt');
const REMOVED_FILE = join(root, 'data', 'removed.txt');
const wordSet = new Set(readFileSync(WORDS_FILE, 'utf8').split('\n').filter(Boolean));
const trie = buildTrie(wordSet);
console.log(`${wordSet.size} woorden, trie gebouwd in ${Date.now() - t0} ms`);

// Woord definitief schrappen (niet geaccepteerd door Wordfeud zelf):
// uit de trie, uit words.txt, en gelogd in removed.txt zodat het bij een
// her-filtering van de bronlijst weg blijft (zie tools/filter-wordlist.mjs).
function deleteWord(word) {
  if (!/^[a-z]{2,15}$/.test(word)) throw new Error('ongeldig woord: ' + word);
  if (!wordSet.has(word)) return false;
  wordSet.delete(word);
  removeWord(trie, word);
  writeFileSync(WORDS_FILE, [...wordSet].sort().join('\n') + '\n');
  const removed = existsSync(REMOVED_FILE)
    ? new Set(readFileSync(REMOVED_FILE, 'utf8').split('\n').filter(Boolean))
    : new Set();
  removed.add(word);
  writeFileSync(REMOVED_FILE, [...removed].sort().join('\n') + '\n');
  return true;
}

// ---- standaard bonuslayouts (bewerkbaar in de UI) ----
// Kwart t/m middenrij/kolom; wordt in beide richtingen gespiegeld.
const BONUS_QUARTERS = {
  wordfeud: [
    [0, 0, 'tl'], [0, 4, 'tw'], [0, 7, 'dl'],
    [1, 1, 'dl'], [1, 5, 'tl'],
    [2, 2, 'dw'], [2, 6, 'dl'],
    [3, 3, 'tl'], [3, 7, 'dw'],
    [4, 0, 'tw'], [4, 4, 'dw'], [4, 6, 'dl'],
    [5, 1, 'tl'], [5, 5, 'tl'],
    [6, 2, 'dl'], [6, 4, 'dl'],
    [7, 0, 'dl'], [7, 3, 'dw'],
  ],
  // Officieel Scrabble-bord (vaste indeling; middenvak = dubbele woordwaarde).
  scrabble: [
    [0, 0, 'tw'], [0, 3, 'dl'], [0, 7, 'tw'],
    [1, 1, 'dw'], [1, 5, 'tl'],
    [2, 2, 'dw'], [2, 6, 'dl'],
    [3, 0, 'dl'], [3, 3, 'dw'], [3, 7, 'dl'],
    [4, 4, 'dw'],
    [5, 1, 'tl'], [5, 5, 'tl'],
    [6, 2, 'dl'], [6, 6, 'dl'],
    [7, 0, 'tw'], [7, 3, 'dl'], [7, 7, 'dw'],
  ],
};
export function standardBonus(size = 15, variant = 'wordfeud') {
  const b = Array(size * size).fill('');
  const q = BONUS_QUARTERS[variant] ?? BONUS_QUARTERS.wordfeud;
  for (const [r, c, v] of q)
    for (const rr of new Set([r, size - 1 - r]))
      for (const cc of new Set([c, size - 1 - c]))
        b[rr * size + cc] = v;
  return b;
}

// ---- opslag ----
function readMeta() {
  try { return JSON.parse(readFileSync(META, 'utf8')); } catch { return { currentId: null }; }
}
function writeMeta(m) { writeFileSync(META, JSON.stringify(m)); }

function gamePath(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('ongeldig id');
  return join(GAMES_DIR, id + '.json');
}
function readGame(id) { return JSON.parse(readFileSync(gamePath(id), 'utf8')); }
function writeGame(g) { writeFileSync(gamePath(g.id), JSON.stringify(g)); }

function listGames() {
  return readdirSync(GAMES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const g = JSON.parse(readFileSync(join(GAMES_DIR, f), 'utf8'));
        return { id: g.id, name: g.name, created: g.created, updated: g.updated };
      } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => b.created - a.created);
}

function newGame(name) {
  const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const board = emptyBoard(15);
  board.bonus = standardBonus(15);
  const g = {
    id,
    name: name || `Spel ${new Date().toLocaleDateString('nl-NL')}`,
    created: Date.now(),
    updated: Date.now(),
    variant: 'wordfeud', // 'wordfeud' | 'scrabble' (letterset + bingo; zie solver.mjs)
    board,
    rack: '',
  };
  writeGame(g);
  writeMeta({ currentId: id });
  return g;
}

function currentState() {
  const meta = readMeta();
  let game = null;
  if (meta.currentId && existsSync(gamePath(meta.currentId))) game = readGame(meta.currentId);
  if (!game) game = newGame();
  return { currentId: game.id, games: listGames(), game };
}

// ---- validatie van binnenkomende borden ----
function checkBoard(b) {
  if (!b || b.size !== 15) throw new Error('bord: size moet 15 zijn');
  if (!Array.isArray(b.bonus) || b.bonus.length !== 225) throw new Error('bord: bonus 225 velden');
  if (!Array.isArray(b.tiles) || b.tiles.length !== 225) throw new Error('bord: tiles 225 velden');
  for (const v of b.bonus) if (!['', 'dl', 'tl', 'dw', 'tw'].includes(v)) throw new Error('bord: onbekende bonus ' + v);
  for (const t of b.tiles) {
    if (t === null) continue;
    if (typeof t.letter !== 'string' || !/^[a-z]$/.test(t.letter)) throw new Error('bord: ongeldige letter');
    t.blank = !!t.blank;
  }
  return b;
}

// ---- http ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 2e6) throw new Error('body te groot');
  }
  return data ? JSON.parse(data) : {};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const body = req.method === 'POST' ? await readBody(req) : {};
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/state':
          return json(res, 200, currentState());
        case 'POST /api/new': {
          const g = newGame(body.name);
          if (body.layout === 'empty') { g.board.bonus = Array(225).fill(''); writeGame(g); }
          return json(res, 200, { currentId: g.id, games: listGames(), game: g });
        }
        case 'POST /api/select': {
          const g = readGame(String(body.id));
          writeMeta({ currentId: g.id });
          return json(res, 200, { currentId: g.id, games: listGames(), game: g });
        }
        case 'POST /api/save': {
          const g = body.game;
          if (!g || !g.id) throw new Error('game ontbreekt');
          checkBoard(g.board);
          if (g.variant != null && !['wordfeud', 'scrabble'].includes(g.variant))
            throw new Error('onbekende variant ' + g.variant);
          const old = readGame(String(g.id)); // moet bestaan
          const merged = { ...old, ...g, id: old.id, created: old.created, updated: Date.now() };
          writeGame(merged);
          return json(res, 200, { ok: true, updated: merged.updated });
        }
        case 'POST /api/remove-word': {
          const word = String(body.word || '').toLowerCase();
          const removed = deleteWord(word);
          return json(res, 200, { ok: true, removed, count: wordSet.size });
        }
        case 'GET /api/standard-bonus':
          return json(res, 200, { bonus: standardBonus(15, url.searchParams.get('variant') || 'wordfeud') });
        case 'GET /api/words': {
          // De (gecureerde) woordenlijst voor de client-side worker, die er
          // zijn eigen trie mee bouwt. Respecteert schrappingen via wordSet.
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
          return res.end([...wordSet].join('\n'));
        }
        case 'POST /api/solve': {
          const board = checkBoard(body.board);
          const rack = String(body.rack || '');
          const t = Date.now();
          const moves = findMoves(board, rack, trie, { limit: Number(body.limit) || Infinity });
          return json(res, 200, { moves, ms: Date.now() - t });
        }
        default:
          return json(res, 404, { error: 'onbekend endpoint' });
      }
    }

    // De pure solver leeft in de repo-root (gedeeld met tests/server); serveer
    // hem apart zodat de browser-worker hem als ES-module kan importeren.
    if (url.pathname === '/solver.mjs') {
      res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      return res.end(readFileSync(join(root, 'solver.mjs')));
    }

    // statisch uit public/
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    if (p.includes('..')) return json(res, 400, { error: 'nee' });
    const file = join(root, 'public', p);
    if (!existsSync(file)) return json(res, 404, { error: 'niet gevonden' });
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  } catch (e) {
    json(res, 400, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Wordfeud-solver op http://${HOST}:${PORT}`);
});
