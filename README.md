# Chess app

A local game-review tool for chess.com games. Enter a chess.com username and pick a game. Stockfish then analyses every position in your browser and you get a chess.com-style review: accuracy for both sides, move labels from Brilliant to Blunder, an eval graph, coach notes, and a drill that replays your mistakes. There is also a free-play board for any position, with three live engine lines.

Everything runs on your machine. The only network calls go to chess.com's public, read-only API.

## Running it

```
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` first copies Stockfish's 94 MB network from `node_modules/stockfish` into `public/stockfish/` (gitignored).

Checks: `npx tsc --noEmit -p tsconfig.app.json` and `npm test`.

## How a review works

1. `src/chesscom` fetches the monthly archives from `api.chess.com/pub` (no key needed; it allows browser CORS).
2. `src/review/analyseGame.ts` runs Stockfish over the start position and every position after a move, keeping the top two lines.
3. `src/review/buildReview.ts` turns those evaluations into the review. Finished reviews are cached in IndexedDB, so reopening a game is instant.

**Engine settings.** One thread, depth 16, and at most 2 s per position. On the i5-1235U this was built on, 8 threads made the WASM build slower, not faster. A sharp middlegame had not reached depth 11 after 45 s on 8 threads, but reached depth 12 in 0.8 s on one. An 80-move game reviews in about 100 s.

**Accuracy** uses Lichess's published formulas (win percent from centipawns, per-move accuracy, and a volatility-weighted plus harmonic mean per game), ported from lila and scalachess.

**Move labels** follow chess.com's published expected-points cutoffs: Best 0, Excellent up to 0.02, Good up to 0.05, Inaccuracy up to 0.10, Mistake up to 0.20, Blunder above that. Brilliant, Great and Miss are our own rules (a sound sacrifice, the only move that holds, failing to punish a mistake), so they will sometimes disagree with chess.com.

### Known differences from chess.com

- chess.com scales expected points by player rating, and that curve isn't public. Ours ignores rating, so labels drift most in low-rated games.
- Book moves are matched by move order, so a transposition into a named line isn't recognised.
- Our accuracy hasn't been calibrated against chess.com's on a real sample yet. Games that were reviewed on chess.com show both numbers in the game list, along with the average gap.

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
