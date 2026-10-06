// Copies the Stockfish worker and its 94 MB network out of node_modules into
// public/, where the dev server can serve them. Kept out of git; runs before dev.
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const src = join('node_modules', 'stockfish', 'bin')
const dest = join('public', 'stockfish')
mkdirSync(dest, { recursive: true })

for (const name of ['stockfish-19.js', 'stockfish-19.wasm']) {
  const from = join(src, name)
  const to = join(dest, name)
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue
  copyFileSync(from, to)
  console.log(`copied ${name}`)
}
