# Data & attribution

The AGPL-3.0 code license covers this repository's code. The solver ships
no outside data.

## The word list

The solver plays with the Dutch word list of
[OpenTaal](https://github.com/OpenTaal/opentaal-wordlist), offered under the
BSD 3-Clause License or Creative Commons Attribution 3.0 Unported (CC BY
3.0), at your choice. This repository does not include it: `run.bat`, or the
commands in the README, download it from OpenTaal's repository into the
local `data/` folder, together with the filtered list made from it. If you
pass the list on, keep OpenTaal's `LICENSE.txt` with it, as that licence
asks.

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
