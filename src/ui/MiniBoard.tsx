import { boardById, pieceSetById, useAppearance, type PieceCode } from './appearance'
import './MiniBoard.css'

// A static thumbnail of a position: the chosen board and pieces as plain
// images. A full Chessboard per row would be far too heavy for a list of a
// hundred games.

const FLAT_SQUARES = 'M1 0h1v1H1zM3 0h1v1H3zM5 0h1v1H5zM7 0h1v1H7zM0 1h1v1H0zM2 1h1v1H2zM4 1h1v1H4zM6 1h1v1H6zM1 2h1v1H1zM3 2h1v1H3zM5 2h1v1H5zM7 2h1v1H7zM0 3h1v1H0zM2 3h1v1H2zM4 3h1v1H4zM6 3h1v1H6zM1 4h1v1H1zM3 4h1v1H3zM5 4h1v1H5zM7 4h1v1H7zM0 5h1v1H0zM2 5h1v1H2zM4 5h1v1H4zM6 5h1v1H6zM1 6h1v1H1zM3 6h1v1H3zM5 6h1v1H5zM7 6h1v1H7zM0 7h1v1H0zM2 7h1v1H2zM4 7h1v1H4zM6 7h1v1H6z'

export function MiniBoard({ fen, orientation = 'white' }: { fen: string; orientation?: 'white' | 'black' }) {
  const { appearance } = useAppearance()
  const board = boardById(appearance.board)
  const set = pieceSetById(appearance.pieces)

  const pieces: { code: PieceCode; x: number; y: number }[] = []
  fen
    .split(' ')[0]
    .split('/')
    .forEach((row, rank) => {
      let file = 0
      for (const ch of row) {
        if (/\d/.test(ch)) {
          file += Number(ch)
          continue
        }
        const code = `${ch === ch.toUpperCase() ? 'w' : 'b'}${ch.toUpperCase()}` as PieceCode
        pieces.push(orientation === 'white' ? { code, x: file, y: rank } : { code, x: 7 - file, y: 7 - rank })
        file++
      }
    })

  return (
    <span className="miniboard" aria-hidden>
      {/* Always the flat colours: the texture is invisible at this size, and a
          1,200px board image per row made Chrome hold well over a gigabyte. */}
      <svg className="miniboard-bg" viewBox="0 0 8 8" preserveAspectRatio="none">
        <rect width="8" height="8" fill={board.light} />
        <path d={FLAT_SQUARES} fill={board.dark} />
      </svg>
      {pieces.map((p, i) => (
        <img
          key={i}
          className="miniboard-piece"
          src={set.src(p.code)}
          alt=""
          loading="lazy"
          draggable={false}
          crossOrigin={set.crossOrigin ? 'anonymous' : undefined}
          style={{ left: `${p.x * 12.5}%`, top: `${p.y * 12.5}%` }}
        />
      ))}
    </span>
  )
}
