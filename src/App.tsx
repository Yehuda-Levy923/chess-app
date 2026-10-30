import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ChessComGame } from './chesscom/api'
import { AppearanceContext, applyTheme, loadAppearance, saveAppearance, type Appearance } from './ui/appearance'
import { AppearanceSheet } from './ui/AppearanceSheet'
import { GamesScreen } from './ui/GamesScreen'
import { CloudProvider } from './ui/cloud'
import { HistoryProvider, useHistory } from './ui/history'
import { HomeScreen } from './ui/HomeScreen'
import { InsightsScreen } from './ui/InsightsScreen'
import { notForBoard } from './ui/keys'
import { PageBoundary } from './ui/PageBoundary'
import { PageVisible } from './ui/pageVisible'
import { AnalysisScreen } from './ui/AnalysisScreen'
import type { LocalGame } from './ui/localGame'
import { PlayScreen } from './ui/PlayScreen'
import { PracticeScreen, type PracticeFocus } from './ui/PracticeScreen'
import { ReviewScreen } from './ui/ReviewScreen'
import { Sidebar, type View } from './ui/Sidebar'
import { setSoundEnabled } from './ui/sound'

// Per-viewer conveniences only; the app works without them.
function remembered(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

const LOWEST_DEPTH = 16

const VIEWS: View[] = ['home', 'games', 'practice', 'insights', 'play', 'analysis']
/** Pages that work before a chess.com username is set */
const OPEN_VIEWS: View[] = ['home', 'play', 'analysis']

export default function App() {
  const [username, setUsername] = useState(() => remembered('username', ''))
  // Settings offer 16, 18 and 20; an older saved choice below that (12 was once offered) reads as 16.
  const [depth, setDepth] = useState(() => Math.max(LOWEST_DEPTH, Number(remembered('depth', '16')) || LOWEST_DEPTH))
  const [appearance, setAppearanceState] = useState<Appearance>(loadAppearance)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => applyTheme(appearance.theme), [appearance.theme])
  useEffect(() => setSoundEnabled(appearance.sound), [appearance.sound])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  const ctx = useMemo(
    () => ({
      appearance,
      setAppearance: (a: Appearance) => {
        setAppearanceState(a)
        saveAppearance(a)
      },
      openSettings: () => setSettingsOpen(true),
    }),
    [appearance],
  )

  const onUsername = useCallback((u: string) => {
    setUsername(u)
    remember('username', u)
  }, [])

  return (
    <AppearanceContext.Provider value={ctx}>
      <HistoryProvider username={username}>
        <div className="firelight" aria-hidden />
        <CloudProvider username={username}>
          <Shell key={username} username={username} depth={depth} onUsername={onUsername} onSettings={() => setSettingsOpen(true)} />
          {settingsOpen && (
            <AppearanceSheet
              onClose={closeSettings}
              account={{
                username,
                depth,
                onUsername,
                onDepth: (d) => {
                  setDepth(d)
                  remember('depth', String(d))
                },
              }}
            />
          )}
        </CloudProvider>
      </HistoryProvider>
    </AppearanceContext.Provider>
  )
}

type ShellProps = { username: string; depth: number; onUsername: (u: string) => void; onSettings: () => void }

/**
 * The sidebar and its pages. Each page stays mounted once visited (hidden when
 * another is showing), so going back finds it as you left it. A review takes
 * the whole window and returns to whichever page opened it.
 */
function Shell({ username, depth, onUsername, onSettings }: ShellProps) {
  const { facts } = useHistory()
  const [view, setViewState] = useState<View>(() => {
    const v = remembered('view', 'home') as View
    return VIEWS.includes(v) ? v : 'home'
  })
  const [visited, setVisited] = useState<Set<View>>(() => new Set([view]))
  const [game, setGame] = useState<ChessComGame | null>(null)
  // Set when the review is of a game from the play page or the analysis board.
  const [local, setLocal] = useState<LocalGame | null>(null)
  // The move to open a review on, when it was opened from a specific moment.
  const [startPly, setStartPly] = useState<number | null>(null)
  const [practiceFocus, setPracticeFocus] = useState<PracticeFocus | null>(null)
  // A finished game sent to the analysis board, or a position sent from it to play.
  const [analysisSeed, setAnalysisSeed] = useState<{ pgn: string; key: number } | null>(null)
  const [playSeed, setPlaySeed] = useState<{ fen: string; key: number } | null>(null)

  const setView = useCallback((v: View) => {
    setViewState(v)
    setVisited((s) => (s.has(v) ? s : new Set(s).add(v)))
    remember('view', v)
  }, [])

  const openGame = useCallback((g: ChessComGame, ply?: number) => {
    setStartPly(ply ?? null)
    setLocal(null)
    setGame(g)
    remember('lastGame', g.uuid)
  }, [])

  const openLocal = useCallback((l: LocalGame, ply?: number) => {
    setStartPly(ply ?? null)
    setLocal(l)
    setGame(l.game)
  }, [])

  const practise = useCallback(
    (focus: PracticeFocus | null) => {
      setPracticeFocus(focus)
      setView('practice')
    },
    [setView],
  )

  // 1 to 4 switch pages, when nothing is being typed and no review or sheet is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (game || notForBoard(e) || document.querySelector('.sheet')) return
      const i = Number(e.key) - 1
      if (!(i >= 0 && i < VIEWS.length)) return
      e.preventDefault()
      setView(VIEWS[i])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game, setView])

  // The sidebar's rating: the latest game's, in that game's time control.
  const latest = facts?.find((f) => f.rated) ?? null
  const rating = latest ? { value: latest.myRating, timeClass: latest.timeClass } : null

  const page = (v: View, node: ReactNode) =>
    visited.has(v) && (
      <div key={v} hidden={view !== v}>
        <PageVisible.Provider value={view === v && !game}>
          <PageBoundary name={v[0].toUpperCase() + v.slice(1)}>{node}</PageBoundary>
        </PageVisible.Provider>
      </div>
    )

  return (
    <>
      {game && (
        <PageBoundary key={`${game.uuid}:${startPly ?? ''}`} name="Review">
          <ReviewScreen game={game} local={local} username={username} depth={depth} startPly={startPly} onBack={() => setGame(null)} />
        </PageBoundary>
      )}
      <div className="shell" hidden={!!game}>
        <Sidebar view={view} onView={setView} username={username} rating={username ? rating : null} onSettings={onSettings} />
        <div className="shell-main">
          {page('home', <HomeScreen username={username} onUsername={onUsername} onOpen={openGame} onView={setView} onPractice={practise} depth={depth} />)}
          {username && page('games', <GamesScreen username={username} onOpen={openGame} />)}
          {username && page('practice', <PracticeScreen username={username} focus={practiceFocus} onClearFocus={() => setPracticeFocus(null)} onOpen={openGame} />)}
          {username && page('insights', <InsightsScreen username={username} onOpen={openGame} />)}
          {page(
            'play',
            <PlayScreen
              username={username}
              depth={depth}
              seed={playSeed}
              onReview={openLocal}
              onAnalyse={(pgn) => {
                setAnalysisSeed({ pgn, key: Date.now() })
                setView('analysis')
              }}
            />,
          )}
          {page(
            'analysis',
            <AnalysisScreen
              seed={analysisSeed}
              onReview={openLocal}
              onPlayFrom={(fen) => {
                setPlaySeed({ fen, key: Date.now() })
                setView('play')
              }}
            />,
          )}
          {!username && !OPEN_VIEWS.includes(view) && <HomeScreen username="" onUsername={onUsername} onOpen={openGame} onView={setView} onPractice={practise} depth={depth} />}
        </div>
      </div>
    </>
  )
}
