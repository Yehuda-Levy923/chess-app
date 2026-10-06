import { describe, expect, it } from 'vitest'
import { classify, type MoveFacts } from './classify'

const facts = (over: Partial<MoveFacts>): MoveFacts => ({
  isBest: false,
  wpBefore: 50,
  wpAfter: 50,
  wpSecond: null,
  inBook: false,
  sacrifice: 0,
  isRecapture: false,
  legalMoves: 30,
  opponentLoss: null,
  ...over,
})

describe('classify', () => {
  it('uses the expected-points cutoffs for ordinary moves', () => {
    expect(classify(facts({ isBest: true }))).toBe('best')
    expect(classify(facts({ wpAfter: 48 }))).toBe('excellent')
    expect(classify(facts({ wpAfter: 46 }))).toBe('good')
    expect(classify(facts({ wpAfter: 42 }))).toBe('inaccuracy')
    expect(classify(facts({ wpAfter: 35 }))).toBe('mistake')
    expect(classify(facts({ wpAfter: 25 }))).toBe('blunder')
  })

  it('puts boundary values in the better bucket', () => {
    expect(classify(facts({ wpAfter: 48 }))).toBe('excellent')
    expect(classify(facts({ wpAfter: 45 }))).toBe('good')
    expect(classify(facts({ wpAfter: 40 }))).toBe('inaccuracy')
    expect(classify(facts({ wpAfter: 30 }))).toBe('mistake')
  })

  it('labels book moves before anything else', () => {
    expect(classify(facts({ inBook: true, wpAfter: 20 }))).toBe('book')
  })

  it('calls a sound sacrifice brilliant', () => {
    expect(classify(facts({ isBest: true, sacrifice: 3, wpAfter: 55 }))).toBe('brilliant')
  })

  it('does not call a sacrifice brilliant when already winning or when it loses', () => {
    expect(classify(facts({ isBest: true, sacrifice: 3, wpBefore: 95, wpAfter: 95 }))).toBe('best')
    expect(classify(facts({ wpBefore: 40, wpAfter: 39, sacrifice: 3 }))).toBe('excellent')
    expect(classify(facts({ wpAfter: 30, sacrifice: 5 }))).toBe('mistake')
  })

  it('calls the only good move great', () => {
    expect(classify(facts({ isBest: true, wpBefore: 50, wpAfter: 50, wpSecond: 30 }))).toBe('great')
  })

  it('does not call forced or recapturing only-moves great', () => {
    expect(classify(facts({ isBest: true, wpSecond: 30, isRecapture: true }))).toBe('best')
    expect(classify(facts({ isBest: true, wpSecond: 30, legalMoves: 1 }))).toBe('best')
  })

  it('calls failing to punish a mistake a miss', () => {
    expect(classify(facts({ wpBefore: 70, wpAfter: 58, opponentLoss: 0.2 }))).toBe('miss')
  })

  it('keeps a plain inaccuracy when the opponent had not erred', () => {
    expect(classify(facts({ wpBefore: 70, wpAfter: 62, opponentLoss: 0.01 }))).toBe('inaccuracy')
  })

  it('keeps blunder over miss', () => {
    expect(classify(facts({ wpBefore: 80, wpAfter: 30, opponentLoss: 0.3 }))).toBe('blunder')
  })
})
