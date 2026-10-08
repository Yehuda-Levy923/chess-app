// Stroke icons on a 16px grid, drawn in currentColor.

type P = { size?: number }

const Svg = ({ size = 16, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

export const IconFirst = (p: P) => (
  <Svg {...p}>
    <path d="M4 3.5v9M12 3.5L7 8l5 4.5" />
  </Svg>
)
export const IconPrev = (p: P) => (
  <Svg {...p}>
    <path d="M10 3.5L5.5 8l4.5 4.5" />
  </Svg>
)
export const IconNext = (p: P) => (
  <Svg {...p}>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </Svg>
)
export const IconLast = (p: P) => (
  <Svg {...p}>
    <path d="M12 3.5v9M4 3.5L9 8l-5 4.5" />
  </Svg>
)
export const IconFlip = (p: P) => (
  <Svg {...p}>
    <path d="M5 2.5v11M5 13.5L2.5 11M5 13.5L7.5 11M11 13.5v-11M11 2.5L8.5 5M11 2.5L13.5 5" />
  </Svg>
)
export const IconBack = (p: P) => (
  <Svg {...p}>
    <path d="M13 8H3.5M7.5 4L3.5 8l4 4" />
  </Svg>
)
export const IconRetry = (p: P) => (
  <Svg {...p}>
    <path d="M3 8a5 5 0 1 0 1.5-3.55M3 2.5v2.5h2.5" />
  </Svg>
)
export const IconKeyPrev = (p: P) => (
  <Svg {...p}>
    <path d="M9.5 3.5L5 8l4.5 4.5M13 3.5L8.5 8l4.5 4.5" />
  </Svg>
)
export const IconKeyNext = (p: P) => (
  <Svg {...p}>
    <path d="M6.5 3.5L11 8l-4.5 4.5M3 3.5L7.5 8 3 12.5" />
  </Svg>
)
export const IconExternal = (p: P) => (
  <Svg {...p}>
    <path d="M9 3h4v4M13 3L7.5 8.5M11.5 9.5V13H3V4.5h3.5" />
  </Svg>
)
/** Two squares of a board with a sliver of piece, for the appearance settings */
export const IconBoard = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
    <path d="M2.5 8h11M8 2.5v11" />
    <path d="M2.5 2.5h5.5v5.5H2.5zM8 8h5.5v5.5H8z" fill="currentColor" stroke="none" opacity={0.35} />
  </Svg>
)
export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M5 3.5v9l7.5-4.5z" fill="currentColor" stroke="none" />
  </Svg>
)
export const IconHome = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 7.5L8 3l5.5 4.5M4 6.5v6.5h3v-3.5h2V13h3V6.5" />
  </Svg>
)
export const IconGames = (p: P) => (
  <Svg {...p}>
    <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.5" />
    <path d="M9 3.5h4.5M9 6h3" />
    <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.5" />
    <path d="M9 10h4.5M9 12.5h3" />
  </Svg>
)
export const IconTarget = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <circle cx="8" cy="8" r="2.5" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2" />
  </Svg>
)
export const IconChart = (p: P) => (
  <Svg {...p}>
    <path d="M2.5 13.5h11M4.5 11V8M7.5 11V4.5M10.5 11V6.5" />
  </Svg>
)
export const IconSettings = (p: P) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.8 8h1.6M12.6 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
  </Svg>
)
