# Copying

Any file in this project that does not state otherwise and is not listed below
is copyright (c) 2026 Yehuda Levy.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version. It has to be: the accuracy formulas in `src/review/accuracy.ts`
are ported from [lila](https://github.com/lichess-org/lila) and
[scalachess](https://github.com/lichess-org/scalachess), which are AGPLv3+.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU Affero General Public License for more details.

See the LICENSE file for a copy of the GNU Affero General Public License.

## Exceptions

The piece sets and board textures are copied from lila, which credits them as
follows.

Files | Author(s) | License
--- | --- | ---
public/pieces/cburnett | [Colin M.L. Burnett](https://en.wikipedia.org/wiki/User:Cburnett) | [GPLv2+](https://www.gnu.org/licenses/gpl-2.0.txt)
public/pieces/merida | Armando Hernandez Marroquin | [GPLv2+](https://www.gnu.org/licenses/gpl-2.0.txt)
public/pieces/fantasy | [Maurizio Monge](https://github.com/maurimo/chess-art) | MIT, below
public/pieces/california | [Jerry S.](https://sites.google.com/view/jerrychess/home) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/pieces/maestro | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/pieces/staunty | sadsnake1 | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
public/boards | the lila authors and [pirouetti](https://lichess.org/@/pirouetti) | AGPLv3+
src/openings/data | [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)

The CC BY-NC-SA sets may not be used commercially.

Stockfish (GPLv3) is not part of this repository: `npm install` fetches it from
the `stockfish` package, and the review workflow downloads the official release.

The default board (Burled Wood) and piece set (Lolz) are chess.com's. They are
not in this repository; the app loads them from chess.com's servers.

### MIT License (public/pieces/fantasy)

Copyright (c) Maurizio Monge

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
