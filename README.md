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

## Insights and opening tree

**Insights** (button on the start screen) loads a player's whole chess.com history once and caches it month by month in IndexedDB. Most of it needs no engine, so it covers every game:

- results by opponent rating
- how games ended
- the phase they ended in
- openings and how long you stayed in book
- castling
- moves by piece
- clock use
- results by weekday and hour

The Engine tab needs Stockfish, so it only covers reviewed games, whether reviewed in the app or imported from the workflow below. It shows:

- accuracy over time, by move number and by piece
- the mix of move labels
- tactics found or missed
- accuracy by time left on the clock
- accuracy by opening
- accuracy by opponent rating
- accuracy after a win, a loss or a losing streak in the same sitting

It reads a small summary saved with each review (`src/review/summary.ts`), not the full reviews, so ten thousand reviewed games stay light enough to load.

chess.com's API reports ratings *after* each game, so a win always shows a higher number. Comparing those directly makes beaten opponents look weaker than they were. `withPreGameRatings` in `src/insights/facts.ts` recovers the ratings going into each game.

The **opening tree** shows every move order you've played as White or Black, with results from your side, out to move 15. Like the book, it matches by move order, so transpositions stay on separate branches.

## Reviewing every game on GitHub

Reviewing thousands of games in the browser would take days, so the "Review games" workflow (`.github/workflows/review.yml`) does it on GitHub's runners. It uses native Stockfish 19, the same version and settings as the app (depth 16, MultiPV 2, 128 MB hash, one thread per engine), and runs one engine per CPU. `scripts/ci-review.mjs` runs the app's own review code through Vite, so a review made there is the same as one made in the app.

- **Full history:** start the workflow by hand from the Actions tab. It splits the games across parallel jobs (16 by default). The `limit` input caps games per job, for a test run.
- **New games:** a daily scheduled run reviews games from the last three days.

The results are kept as workflow artifacts for 90 days. To bring them into the app:

```
npm run pull-reviews
```

That downloads every run not downloaded before into `ci-reviews/` (gitignored), using the GitHub CLI. Then open Insights and import them. Import only works under `npm run dev`, which serves that folder.

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
- Piece sets, from lila:
  - cburnett (Colin M.L. Burnett) and merida (Armando Hernandez Marroquin), GPLv2+
  - fantasy (Maurizio Monge), MIT
  - california (Jerry S.), maestro and staunty (sadsnake1), CC BY-NC-SA 4.0
- Board textures (wood4, maple, marble, blue-marble), from lila: the lila authors and pirouetti, AGPL-3.0
- The default board and piece set are loaded from chess.com's image servers and are chess.com's property. They are only suitable for personal, private use, so replace them before this is ever made public.
