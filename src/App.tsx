import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChessComGame } from './chesscom/api'
import { AppearanceContext, applyTheme, loadAppearance, saveAppearance, type Appearance } from './ui/appearance'
import { AppearanceSheet } from './ui/AppearanceSheet'
import { ReviewScreen } from './ui/ReviewScreen'
import { StartScreen } from './ui/StartScreen'

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

export default function App() {
  const [username, setUsername] = useState(() => remembered('username', ''))
  const [depth, setDepth] = useState(() => Number(remembered('depth', '16')))
  const [game, setGame] = useState<ChessComGame | null>(null)
  const [appearance, setAppearanceState] = useState<Appearance>(loadAppearance)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => applyTheme(appearance.theme), [appearance.theme])
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

  return (
    <AppearanceContext.Provider value={ctx}>
      {game ? (
        <ReviewScreen game={game} username={username} depth={depth} onBack={() => setGame(null)} />
      ) : (
        <StartScreen
          username={username}
          depth={depth}
          onUsername={(u) => {
            setUsername(u)
            remember('username', u)
          }}
          onDepth={(d) => {
            setDepth(d)
            remember('depth', String(d))
          }}
          onOpen={setGame}
        />
      )}
      {settingsOpen && <AppearanceSheet onClose={closeSettings} />}
    </AppearanceContext.Provider>
  )
}
