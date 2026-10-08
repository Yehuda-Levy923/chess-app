import { useMemo, type CSSProperties } from 'react'
import { Chessboard, defaultArrowOptions, type Arrow, type PieceDropHandlerArgs, type PieceRenderObject } from 'react-chessboard'
import type { Label } from '../review/types'
import { boardById, PIECE_CODES, pieceSetById, useAppearance, type PieceSetDef } from './appearance'
import { Badge } from './Badge'
import { usePageVisible } from './pageVisible'
import './GameBoard.css'

type Props = {
  fen: string
  orientation?: 'white' | 'black'
  arrows?: Arrow[]
  /** Squares tinted as the last move */
  lastMove?: [string, string] | null
  /** Classification mark pinned to a square, the way chess.com shows the move just played */
  mark?: { square: string; label: Label } | null
  check?: string | null
  /** A square ringed as a hint, e.g. the piece to move in a puzzle */
  hint?: string | null
  allowDragging?: boolean
  onPieceDrop?: (args: PieceDropHandlerArgs) => boolean
  /** Small boards (thumbnails, previews) skip coordinates and animation */
  small?: boolean
}

const pieceCache = new Map<string, PieceRenderObject>()

function piecesFor(set: PieceSetDef): PieceRenderObject {
  const hit = pieceCache.get(set.id)
  if (hit) return hit
  const pieces: PieceRenderObject = {}
  for (const code of PIECE_CODES) {
    pieces[code] = (props) => (
      <img
        src={set.src(code)}
        alt=""
        draggable={false}
        crossOrigin={set.crossOrigin ? 'anonymous' : undefined}
        style={{ width: '100%', height: '100%', display: 'block', ...props?.svgStyle }}
      />
    )
  }
  pieceCache.set(set.id, pieces)
  return pieces
}

export function GameBoard({ fen, orientation = 'white', arrows = [], lastMove, mark, check, hint, allowDragging = false, onPieceDrop, small = false }: Props) {
  const { appearance } = useAppearance()
  const board = boardById(appearance.board)
  const pieces = useMemo(() => piecesFor(pieceSetById(appearance.pieces)), [appearance.pieces])

  const squareStyles: Record<string, CSSProperties> = {}
  if (lastMove) for (const sq of lastMove) squareStyles[sq] = { background: 'var(--last-move)' }
  if (hint) squareStyles[hint] = { ...squareStyles[hint], boxShadow: 'inset 0 0 0 4px var(--hint, rgb(232 116 46 / 0.9))' }
  if (check) squareStyles[check] = { ...squareStyles[check], boxShadow: 'inset 0 0 0 3px var(--check)', background: 'var(--check-fill)' }

  const visible = usePageVisible()

  const showCoords = appearance.coordinates && !small
  const coord: CSSProperties = { fontSize: 'max(10px, 2cqw)', fontWeight: 600 }

  return (
    <div className={`gameboard ${small ? 'small' : ''}`} style={{ background: board.dark }}>
      {board.image && <img className="gameboard-image" src={board.image} alt="" draggable={false} crossOrigin={board.crossOrigin ? 'anonymous' : undefined} />}
      {visible && (
      <Chessboard
        options={{
          position: fen,
          boardOrientation: orientation,
          pieces,
          arrows,
          squareStyles,
          allowDragging,
          // Only the side to move can be picked up.
          canDragPiece: ({ piece }) => piece.pieceType[0] === fen.split(' ')[1],
          allowDrawingArrows: !small,
          onPieceDrop,
          showNotation: showCoords,
          showAnimations: !small,
          animationDurationInMs: 160,
          lightSquareStyle: { backgroundColor: board.image ? 'transparent' : board.light },
          darkSquareStyle: { backgroundColor: board.image ? 'transparent' : board.dark },
          lightSquareNotationStyle: { ...coord, color: board.dark },
          darkSquareNotationStyle: { ...coord, color: board.light },
          dropSquareStyle: { boxShadow: 'inset 0 0 0 3px rgb(255 255 255 / 0.55)' },
          arrowOptions: { ...defaultArrowOptions, opacity: 0.8, arrowStartOffset: 0.28 },
          squareRenderer: ({ square, children }) => (
            <div style={{ width: '100%', height: '100%', ...squareStyles[square] }}>
              {children}
              {mark && mark.square === square && (
                <span className={`gameboard-mark ${mark.label === 'brilliant' || mark.label === 'great' ? 'celebrate' : ''}`}>
                  <Badge label={mark.label} size={28} />
                </span>
              )}
            </div>
          ),
        }}
      />
      )}
    </div>
  )
}
