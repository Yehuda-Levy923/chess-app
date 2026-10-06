import { describe, expect, it } from 'vitest'
import { allowsFork, allowsMate, coachNote, hangs, missedMate, missedWin } from './notes'

describe('coach note detectors', () => {
  it('spots a piece left to be taken', () => {
    expect(hangs('4k3/8/4p3/3Q4/8/8/8/4K3 b - - 0 1', 'w')).toBe('Leaves the queen on d5 to be won.')
  })

  it('ignores a pawn that is defended', () => {
    expect(hangs('4k3/8/4p3/3P4/2P5/8/8/4K3 b - - 0 1', 'w')).toBeNull()
  })

  it('spots an allowed knight fork', () => {
    expect(allowsFork('4k3/8/8/8/3n4/8/8/R3K3 b - - 0 1', 'd4c2', 'w')).toBe(
      'Allows Nc2+, a knight fork on the rook and king.',
    )
  })

  it('does not call a single attack a fork', () => {
    expect(allowsFork('4k3/8/8/8/3n4/8/8/4K3 b - - 0 1', 'd4c2', 'w')).toBeNull()
  })

  it('spots a missed mate', () => {
    expect(missedMate({ kind: 'mate', mate: 2 }, { kind: 'cp', cp: 300 }, 'w', 'Qh7+')).toBe(
      'Missed mate in 2, starting with Qh7+.',
    )
    expect(missedMate({ kind: 'mate', mate: 2 }, { kind: 'mate', mate: 3 }, 'w', 'Qh7+')).toBeNull()
  })

  it('reads mate scores from the right side', () => {
    expect(allowsMate({ kind: 'mate', mate: -3 }, 'b')).toBe('Allows mate in 3.')
    expect(allowsMate({ kind: 'mate', mate: 3 }, 'b')).toBeNull()
  })

  it('spots a missed winning capture', () => {
    expect(missedWin('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', 'd1d5', 'Rxd5')).toBe('Missed Rxd5, which wins the queen.')
  })

  it('does not call an even trade a missed win', () => {
    expect(missedWin('4k3/8/4p3/3q4/8/8/8/3QK3 w - - 0 1', 'd1d5', 'Qxd5')).toBeNull()
  })
})

describe('coachNote', () => {
  it('says nothing about ordinary good moves', () => {
    expect(
      coachNote({
        label: 'good',
        color: 'w',
        fenBefore: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
        fenAfter: '4k3/8/8/8/8/8/3K4/8 b - - 1 1',
        bestUci: 'e1e2',
        scoreBest: { kind: 'cp', cp: 0 },
        scoreAfter: { kind: 'cp', cp: 0 },
        scoreSecond: null,
        replyUci: null,
        opening: null,
      }),
    ).toBeNull()
  })

  it('names the opening on book moves', () => {
    expect(
      coachNote({
        label: 'book',
        color: 'b',
        fenBefore: '',
        fenAfter: '',
        bestUci: null,
        scoreBest: null,
        scoreAfter: { kind: 'cp', cp: 0 },
        scoreSecond: null,
        replyUci: null,
        opening: 'French Defense',
      }),
    ).toBe('Book move. French Defense.')
  })
})
