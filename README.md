# Wordfeud solver

A local web app that recreates a Wordfeud game (or a game of Dutch
Scrabble on a real board) and lists the best-scoring moves, using the
[OpenTaal](https://github.com/OpenTaal/opentaal-wordlist) Dutch word list.
The interface is in Dutch.

It runs on your own computer: a small Node.js server with no dependencies,
bound to `127.0.0.1`, so nothing is open to the network. Your games and the
word list stay in a local `data/` folder, which git ignores.

## Requirements

- [Node.js](https://nodejs.org/) 22 or later.
- `curl`, to download the word list (built into Windows 10 and later, macOS
  and most Linux systems).

## Start

On Windows, run `run.bat`. On its first start it downloads the word list,
filters it, then starts the server and opens the page in your browser.

On other systems, or by hand:

```
mkdir -p data
curl -L -o data/wordlist.txt https://raw.githubusercontent.com/OpenTaal/opentaal-wordlist/master/wordlist.txt
node tools/filter-wordlist.mjs
node server.mjs
```

Then open <http://127.0.0.1:6789/>. The `PORT` and `HOST` environment
variables change the port and the address. Keep `HOST` at `127.0.0.1`: the
server saves games and edits the word list for anyone who can reach it, with
no login.

## What it does

- **Board.** Set the bonus squares (`DL`, `TL`, `DW`, `TW`) one square at a
  time, or start from the standard Wordfeud or Scrabble layout. Type the
  letters on the board; `*` marks a tile as a blank.
- **Rack** ("Jouw letters"): up to 7 letters, `?` for a blank.
- **Best moves** ("Beste zetten"): every legal move with its score and
  position. Click one to preview it on the board; "Zet spelen" plays it.
  The "Open" column counts the empty squares next to a tile after the move,
  where a reply can start. Two optional columns: "Tegen" (the most replies
  the opponent could have, over every rack they could hold; a lower bound
  when it runs out of time) and "Zelf" (how many moves you could play next
  turn, from lowest to highest over the tiles you might draw).
- **Tiles.** "Resterende letters" shows how many of each tile are not yet
  in sight; "Stenen van de tegenstander" shows the tiles the opponent must
  hold.
- **Score** ("Stand"): both players' totals and a log of the moves, scored
  by the game's rules (cross words, bonuses on new tiles only, the bingo
  bonus).
- **Variants** ("Instellingen"): Wordfeud (104 tiles, bingo +40) or the Dutch
  Scrabble set (102 tiles, bingo +50), set per game.
- **Word list curation.** When Wordfeud rejects a suggested word, the bin
  icon removes it from `data/words.txt` and logs it in `data/removed.txt`,
  so it stays out when the list is filtered again.
- Games are saved as you go, in `data/games/`. "Nieuw spel" starts a new
  game; older games stay in the list.

## The word list

- Source: the [OpenTaal word list](https://github.com/OpenTaal/opentaal-wordlist),
  offered under the BSD 3-Clause License or CC BY 3.0. It is not included in
  this repository: `run.bat`, or the commands above, download it to
  `data/wordlist.txt`.
- `node tools/filter-wordlist.mjs` writes `data/words.txt`: it drops words
  with a capital letter (abbreviations, names), takes the accents off
  (`café` becomes `cafe`, as Wordfeud does), keeps `a` to `z` only and
  lengths 2 to 15, and leaves out the words in `data/removed.txt`.
- OpenTaal is not Wordfeud's own word list, so now and then a word differs:
  accepted here but not in Wordfeud, or the other way round.

## How it works

- `solver.mjs`: the move generator, pure and without I/O: a trie and
  anchor squares with cross-checks (Appel and Jacobson's method), scoring,
  blanks, the tile sets of both variants and the opponent analysis.
- `server.mjs`: a dependency-free HTTP server for the page, a JSON API and
  the saved games.
- `public/index.html`: the whole interface in one file, plain JavaScript.
- `public/solver.worker.mjs`: a Web Worker that builds its own trie in the
  browser and runs the search, and the "Tegen" and "Zelf" columns, outside
  the page's main thread.

## Data & attribution

See [ATTRIBUTION.md](ATTRIBUTION.md).

## License

The code is licensed under the GNU Affero General Public License v3.0; see
[LICENSE](LICENSE). SPDX: `AGPL-3.0-only`.
