@echo off
rem Wordfeud-solver: start de server en open de UI in de browser.
cd /d "%~dp0"

rem Een verse clone heeft nog geen data\ (curl -o maakt geen mappen aan).
if not exist data mkdir data
if not exist data\wordlist.txt (
  echo data\wordlist.txt ontbreekt - downloaden van OpenTaal...
  curl -sL -o data\wordlist.txt https://raw.githubusercontent.com/OpenTaal/opentaal-wordlist/master/wordlist.txt || exit /b 1
)
if not exist data\words.txt (
  echo Gefilterde woordenlijst maken...
  node tools\filter-wordlist.mjs || exit /b 1
)

start "" http://127.0.0.1:6789/
node server.mjs
