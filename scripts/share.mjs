// Packs the app into game-review.zip to send to someone who wants to run it
// for their own games. It's the committed code only (git archive), so none
// of your data goes with it: reviews, the game cache and settings live in
// your browser, and ci-reviews/ and calibration/ aren't committed.
//
//   npm run share
//
// They unzip it and double-click "Start Game review.bat".
import { execFileSync } from 'node:child_process'
import { statSync } from 'node:fs'

const OUT = 'game-review.zip'
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()
if (dirty) console.log('Uncommitted changes are left out; the zip has the last commit.')
execFileSync('git', ['archive', '--format=zip', '--prefix=game-review/', '-o', OUT, 'HEAD'])
console.log(`${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB). Unzip it and double-click "Start Game review.bat".`)
