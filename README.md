# Wordfeud solver

**Use it: <https://bertblookers.github.io/wordfeud-solver/>** (*a work in
progress*)

A web app that recreates a Wordfeud game (or a game of Dutch Scrabble on a
real board) and lists the best-scoring moves, using the
[OpenTaal](https://github.com/OpenTaal/opentaal-wordlist) Dutch word list.
The interface is in Dutch.

It runs entirely in your browser: no account, no install, no server of its
own. Your games and the words you remove are saved in your browser's own
storage on your device and never leave it. The page sends no analytics; the
only download beyond the page itself is the word list.

## What it does

- **Board.** Set the bonus squares (`DL`, `TL`, `DW`, `TW`) one square at a
  time, or start from the standard Wordfeud or Scrabble layout. Type the
  letters on the board (on a phone, tap a square to open the keyboard); `*`
  marks a tile as a blank.
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
  icon removes it from your copy of the list; your removals are kept in your
  browser.
- Games are saved as you go. "Nieuw spel" starts a new game; older games
  stay in the list.

## The word list

- Source: the [OpenTaal word list](https://github.com/OpenTaal/opentaal-wordlist),
  offered under the BSD 3-Clause License or CC BY 3.0. It is not in this
  repository: on your first visit, your browser downloads OpenTaal's
  `wordlist.txt` from OpenTaal's own repository, at one fixed commit
  (`b250510dda431785f962019167d1415198ff3905`), and checks its SHA-256
  before using it. If that download fails or doesn't match, it takes the
  same file at the same commit from jsDelivr.
- The page then filters it: it drops words with a capital letter
  (abbreviations, names), takes the accents off (`café` becomes `cafe`, as
  Wordfeud does), keeps `a` to `z` only and lengths 2 to 15, and leaves out
  doubles. The filtered list stays in your browser's cache, so a later visit
  doesn't download it again.
- OpenTaal is not Wordfeud's own word list, so now and then a word differs:
  accepted here but not in Wordfeud, or the other way round.

## How it works

- `index.html`: the whole interface in one file, plain JavaScript.
- `solver.mjs`: the move generator, pure and without I/O: a trie and
  anchor squares with cross-checks (Appel and Jacobson's method), scoring,
  blanks, the tile sets of both variants, the opponent analysis and the word
  list filter.
- `solver.worker.mjs`: a Web Worker that builds its own trie and runs the
  search, and the "Tegen" and "Zelf" columns, outside the page's main
  thread.
- `store-browser.mjs`: the saved games and removed words in your browser's
  storage, and the word list loader.

## Data & attribution

See [ATTRIBUTION.md](ATTRIBUTION.md).

## License

The code is licensed under the GNU Affero General Public License v3.0; see
[LICENSE](LICENSE). SPDX: `AGPL-3.0-only`.
