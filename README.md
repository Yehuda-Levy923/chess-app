# Chess app

A local game-review tool for chess.com games. Enter a chess.com username and pick a game. Stockfish then analyses every position in your browser and you get a chess.com-style review: accuracy for both sides, move labels from Brilliant to Blunder, an eval graph, coach notes, and a drill that replays your mistakes. There is also a free-play board for any position, with three live engine lines.

Everything runs on your machine. The only network calls go to chess.com's public, read-only API, and, if you use the optional review workflow, to GitHub.

## Running it

```
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` first copies Stockfish's 94 MB network from `node_modules/stockfish` into `public/stockfish/` (gitignored).

Checks: `npx tsc --noEmit -p tsconfig.app.json` and `npm test`.

### On Windows, without a terminal

Double-click **Start Game review.bat**. The first time, it installs Node.js if it's missing (through winget, which asks you to confirm), installs the app's packages and adds a "Game review" shortcut to the Desktop. After that, it or the shortcut opens the app.

### Sending it to a friend

```
npm run share
```

That writes `game-review.zip` from the last commit: code only, none of your reviews or settings, which live in your browser. Your friend unzips it, double-clicks **Start Game review.bat** and enters their own chess.com username. Windows may warn about a file from the internet the first time: More info, then Run anyway.

To have GitHub review their games too, they double-click **Set up GitHub reviews.bat** once. It installs the GitHub CLI if needed and signs them in (a free GitHub account is enough), forks this repo to their account, turns its review workflow on, stores their chess.com username in it as the `CHESS_USERNAME` variable, and writes `github-repo.txt` so the app uses that fork. Running it again brings the fork up to date. Until it has run, the GitHub features stay hidden in a shared copy.

## Insights and opening tree

**Insights** loads a player's whole chess.com history once and caches it month by month in IndexedDB. It covers what chess.com's Insights and Advanced Stats show, where our own data can answer it. These need no engine, so they cover every game:

- results by opponent rating, how games ended, and the phase they ended in
- openings, and how long you stay in book
- clock use
- results by weekday and hour
- **Geography:** your score against each opponent country, on a map. Countries come from each opponent's chess.com profile, one request each the first time, then from the cache.

These need Stockfish, so they cover reviewed games only, whether reviewed in the app or on GitHub:

- **Skills:** what your accuracy in the opening, middlegame and endgame plays like as a rating, per time control. chess.com rates you against players of your rating; with no data on other players, this uses the same accuracy-to-rating model as a review's "Played like".
- **Moves:** move labels, accuracy by move number, pieces, which phase you castled in, and game shapes (in control, comeback, back and forth, let it slip, outplayed, close).
- **Tactics:** mates, forks and pins found, missed, and allowed to the opponent, pieces left hanging, and every brilliant move, filterable by piece and time control.
- **Engine:** accuracy over time, by clock, by opening, by opponent rating, and after a win or a loss.

It reads a small summary saved with each review (`src/review/summary.ts`), not the full reviews, so ten thousand reviewed games stay light enough to load.

chess.com's API reports ratings *after* each game, so a win always shows a higher number. Comparing those directly makes beaten opponents look weaker than they were. `withPreGameRatings` in `src/insights/facts.ts` recovers the ratings going into each game.

The **opening tree** shows every move order you've played as White or Black, with results from your side, out to move 15. Like the book, it matches by move order, so transpositions stay on separate branches.

## Reviewing every game on GitHub

Reviewing thousands of games in the browser would take days, so the "Review games" workflow (`.github/workflows/review.yml`) does it on GitHub's runners. It uses native Stockfish 19, the same version and settings as the app (depth 16, MultiPV 2, 128 MB hash, one thread per engine), and runs one engine per CPU. `scripts/ci-review.mjs` runs the app's own review code through Vite, so a review made there is the same as one made in the app.

- **From the app:** Home lists how many games have no review, with a button that sends exactly those to GitHub. The dev server starts the run through your signed-in GitHub CLI (`github-plugin.ts`), so no token reaches the browser. The computer can be off while it runs.
- **Full history:** start the workflow by hand from the Actions tab. It splits the games across parallel jobs (16 by default). The `limit` input caps games per job, for a test run.
- **New games:** a daily scheduled run reviews games from the last three days.
- **Resummarize:** rebuilds every summary in the current format from earlier runs' reviews, without Stockfish, when the summary gains fields. Started from Insights, Skills.

The results are kept as workflow artifacts for 90 days. Each time the app opens, it downloads finished runs into `ci-reviews/` (gitignored) and imports them. `npm run pull-reviews` does the download by hand.

The script also runs locally with any UCI engine, e.g. the npm package's build: `node scripts/ci-review.mjs --user <name> --engine node_modules/stockfish/bin/stockfish-19-single.js --limit 2`.

## Calibrating against chess.com

```
node scripts/calibrate-analyse.mjs <username> [shard] [shards]
node scripts/calibrate-fit.mjs [--fit]
```

The first script analyses every game chess.com has an accuracy for, with the app's engine settings, and saves the evaluations to `calibration/` (gitignored). It can be stopped and resumed. The second compares our accuracy with chess.com's:

- `--fit` grid-searches the accuracy constants, holding out a quarter of the games.
- `--cv` does four-fold cross-validation, so every game is held out once.

In dev, saved analyses are reused when you open a game, so calibrated games review instantly.

The game-rating model has its own pair:

```
node scripts/rating-data.mjs   # samples chess.com players across the rating range; resumable
node scripts/rating-fit.mjs    # prints the model JSON to paste into src/review/gameRating.ts
```

## How a review works

1. `src/chesscom` fetches the monthly archives from `api.chess.com/pub` (no key needed; it allows browser CORS).
2. `src/review/analyseGame.ts` runs Stockfish over the start position and every position after a move, keeping the top two lines.
3. `src/review/buildReview.ts` turns those evaluations into the review. Finished reviews are cached in IndexedDB, so reopening a game is instant.

**Engine settings.** One thread, depth 16, and at most 2 s per position. On the i5-1235U this was built on, 8 threads made the WASM build slower, not faster. A sharp middlegame had not reached depth 11 after 45 s on 8 threads, but reached depth 12 in 0.8 s on one. An 80-move game reviews in about 100 s.

**Accuracy** starts from Lichess's published formulas (win percent from centipawns, per-move accuracy, a volatility-weighted plus harmonic mean per game), ported from lila and scalachess. The constants were then refitted to chess.com's accuracy on 80 games chess.com had reviewed. That brought the average gap down from 8.0 to 6.3 points in four-fold cross-validation, with every fold improving. The biggest change is dropping the harmonic mean, which made one blunder sink a whole game's figure. Move labels still use the Lichess win-percent curve, because chess.com doesn't publish per-move labels to fit against.

**Game rating** ("played like") comes in two figures, from `src/review/gameRating.ts`, fitted on 15,546 reviewed games from 216 chess.com players rated 100 to 3,400:

- **Blended:** your rating going in, moved by how far your accuracy was above or below what's typical at that rating.
- **Accuracy-only:** with an 80% range. It's honestly wide, because accuracy barely rises with rating: in bullet it's about 67 at 400 and 73.5 at 2400. Stronger players face stronger opponents in harder games.

**Move labels** follow chess.com's published expected-points cutoffs: Best 0, Excellent up to 0.02, Good up to 0.05, Inaccuracy up to 0.10, Mistake up to 0.20, Blunder above that. Brilliant, Great and Miss are our own rules (a sound sacrifice, the only move that holds, failing to punish a mistake), so they will sometimes disagree with chess.com.

### Known differences from chess.com

- chess.com scales expected points by player rating, and that curve isn't public. Ours ignores rating, so labels drift most in low-rated games.
- Book moves are matched by move order, so a transposition into a named line isn't recognised.
- Accuracy was calibrated on one player's games, which are mostly bullet around 1850. It may track chess.com less closely for very different players or slower time controls.

## Credits

- [Stockfish](https://stockfishchess.org) via [stockfish.js](https://github.com/nmrugg/stockfish.js), GPL-3.0
- [chess.js](https://github.com/jhlywa/chess.js), BSD-2-Clause
- [react-chessboard](https://github.com/Clariity/react-chessboard), MIT
- Opening names: [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings), CC0
- Accuracy formulas: [lichess-org/lila](https://github.com/lichess-org/lila) and [scalachess](https://github.com/lichess-org/scalachess), AGPL-3.0
- Country outlines: [world-atlas](https://github.com/topojson/world-atlas), ISC, from [Natural Earth](https://www.naturalearthdata.com), public domain
- ISO 3166 country codes, from [pycountry](https://github.com/pycountry/pycountry)'s tables
- Piece sets, from lila:
  - cburnett (Colin M.L. Burnett) and merida (Armando Hernandez Marroquin), GPLv2+
  - fantasy (Maurizio Monge), MIT
  - california (Jerry S.), maestro and staunty (sadsnake1), CC BY-NC-SA 4.0
- Board textures (wood4, maple, marble, blue-marble), from lila: the lila authors and pirouetti, AGPL-3.0
- The default board and piece set are loaded from chess.com's image servers and are chess.com's property. They are only suitable for personal, private use, so replace them before this is ever made public.
