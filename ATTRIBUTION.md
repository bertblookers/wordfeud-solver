# Data & attribution

The AGPL-3.0 code license (`AGPL-3.0-only`) covers this repository's code.
This repository and the site hold no outside data.

## The word list

The solver plays with the Dutch word list ("Nederlandse woordenlijst") of
[OpenTaal](https://github.com/OpenTaal/opentaal-wordlist), Copyright (c)
2020, OpenTaal, offered under the
[Revised BSD License](https://opensource.org/licenses/BSD-3-Clause) (3-clause)
and/or [Creative Commons Attribution 3.0 Unported](https://creativecommons.org/licenses/by/3.0/)
(CC BY 3.0), at the user's choice. Its source, as OpenTaal names it:
<https://github.com/OpenTaal/opentaal-wordlist>.

- **Not hosted here.** Neither this repository nor the site contains the
  list. Each visitor's browser downloads OpenTaal's `wordlist.txt` from
  OpenTaal's own repository, at commit
  [`b250510dda431785f962019167d1415198ff3905`](https://github.com/OpenTaal/opentaal-wordlist/tree/b250510dda431785f962019167d1415198ff3905)
  (through jsDelivr if GitHub fails), checks its SHA-256
  (`12e5fb5e3c73840b583b30016926d1f63a75e9bf1652a3a6634b2ba7c49ad7be`), and
  keeps the filtered result in its own cache.
- **Changed: filtered.** The page filters the list before use: words with a
  capital letter are dropped, accents are taken off (`café` becomes `cafe`),
  only the letters `a` to `z` are kept, words of 2 to 15 letters, and doubles
  are left out. Words a visitor removes with the bin icon are left out for
  that visitor only, in their own browser.
- The licences' full texts, the creator history and the disclaimer are in
  OpenTaal's [`LICENSE.txt`](https://github.com/OpenTaal/opentaal-wordlist/blob/b250510dda431785f962019167d1415198ff3905/LICENSE.txt).
  If you pass the list on, keep that file with it, as OpenTaal asks.
- OpenTaal does not endorse this tool.

## The method

The move generator follows the anchor-square and cross-check method of
A. W. Appel and G. J. Jacobson, "The World's Fastest Scrabble Program",
*Communications of the ACM* 31(5), 1988.

## Tile sets

The letter values and tile counts are those of Wordfeud's Dutch tile set and
of the Dutch Scrabble set.

## Not affiliated

This is an unofficial tool, not affiliated with or endorsed by the makers of
Wordfeud or Scrabble. Wordfeud and Scrabble are trademarks of their owners.
