# Sets up GitHub reviews for a copy of the app made with `npm run share`, so
# GitHub reviews your games while your computer is off. Run it through
# "Set up GitHub reviews.bat". Safe to run again: it skips what's done and
# brings the fork up to date with the original.
#
# It: installs the GitHub CLI if needed and signs you in; forks the app's repo
# to your account (free GitHub Actions minutes, since it's public); turns the
# fork's review workflow on; stores your chess.com username in it as the
# CHESS_USERNAME variable; and writes github-repo.txt so the app knows the fork.

# Not 'Stop': Windows PowerShell treats a native command's stderr as a fatal
# error under it, and gh reports ordinary states (not signed in yet) there.
# Every gh call checks its exit code instead.
$ErrorActionPreference = 'Continue'
$upstream = 'Yehuda-Levy923/chess-app'
$root = Split-Path $PSScriptRoot -Parent

function Step([string]$text) { Write-Host "`n$text" -ForegroundColor Yellow }
function Fail([string]$text) { Write-Host "`n$text" -ForegroundColor Red; exit 1 }
# gh writes progress to stderr; only a non-zero exit code is a failure.
function Need-Gh { & gh @args; if ($LASTEXITCODE -ne 0) { throw "gh $($args -join ' ') failed" } }

Step 'Checking for the GitHub CLI'
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host 'Installing it with winget; Windows will ask you to confirm.'
  winget install -e --id GitHub.cli
  $env:Path = "$env:ProgramFiles\GitHub CLI;$env:Path"
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Fail 'Couldn''t install the GitHub CLI. Get it from https://cli.github.com and run this again.' }
}

Step 'Signing in to GitHub'
& gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'A browser window opens; sign in there (make a free GitHub account first if you have none).'
  & gh auth login --web --git-protocol https
  if ($LASTEXITCODE -ne 0) { Fail 'Signing in didn''t finish. Run this again to retry.' }
}
$me = (Need-Gh api user --jq .login).Trim()
Write-Host "Signed in as $me."

$username = Read-Host "`nYour chess.com username"
if (-not ($username -match '^[\w-]{1,40}$')) { Fail 'That doesn''t look like a chess.com username.' }

$name = $upstream.Split('/')[1]
$fork = "$me/$name"
Step "Making your copy of the app on GitHub ($fork)"
& gh repo view $fork --json name *> $null
if ($LASTEXITCODE -ne 0) {
  Need-Gh repo fork $upstream --clone=false --default-branch-only
  # GitHub creates forks in the background.
  for ($i = 0; $i -lt 30; $i++) {
    & gh repo view $fork --json name *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 2
  }
} else {
  Write-Host 'Already there; bringing it up to date with the original.'
  & gh repo sync $fork
}

Step 'Turning on its review workflow'
# Forks start with Actions off and scheduled workflows paused.
& gh api -X PUT "repos/$fork/actions/permissions" -F enabled=true -f allowed_actions=all *> $null
& gh workflow enable review.yml --repo $fork *> $null
$actions = (& gh api "repos/$fork/actions/permissions" --jq .enabled 2> $null)
$state = (& gh api "repos/$fork/actions/workflows/review.yml" --jq .state 2> $null)
if ("$actions".Trim() -ne 'true' -or "$state".Trim() -ne 'active') {
  Fail "GitHub didn't let this script turn Actions on. Open https://github.com/$fork/actions, press the green button to enable workflows, then run this again."
}

Step 'Saving your chess.com username in it'
Need-Gh variable set CHESS_USERNAME --body $username --repo $fork

Set-Content -Path (Join-Path $root 'github-repo.txt') -Value $fork -Encoding ascii
Write-Host "`nDone. Open Game review: Home now has 'Review them on GitHub', and a daily run reviews your new games." -ForegroundColor Green
