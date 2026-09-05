import {
  atLeastZero,
  averageCents,
  centsToNumber,
  commissionFor,
  numberToCents,
  parseAmountToCents,
  percentOf,
  sumCents,
} from './money'

describe('sumCents', () => {
  it('adds integer cents exactly', () => {
    expect(sumCents([38900, 21400, 13900])).toBe(74200)
    expect(sumCents([])).toBe(0)
    // The classic float trap: 0.1 + 0.2 in dollars. In cents it is exact.
    expect(sumCents([10, 20])).toBe(30)
  })

  it('ignores non-finite entries rather than poisoning the total', () => {
    expect(sumCents([100, Number.NaN, 200])).toBe(300)
  })
})

describe('commissionFor', () => {
  it('matches the spec §77 commission test', () => {
    expect(commissionFor(50_000, 500)).toBe(2500) // $500 at 5% = $25.00
    expect(commissionFor(50_000, 300)).toBe(1500) // $500 at 3% = $15.00
    expect(commissionFor(50_000, 500) + commissionFor(50_000, 300)).toBe(4000) // $40.00
  })

  it('matches the spec §14 example', () => {
    expect(commissionFor(38_900, 500)).toBe(1945) // $389 at 5% = $19.45
  })

  it('rounds half up, deterministically', () => {
    expect(commissionFor(10, 500)).toBe(1) // 0.5c -> 1c
    expect(commissionFor(30, 500)).toBe(2) // 1.5c -> 2c
    expect(commissionFor(9, 500)).toBe(0) // 0.45c -> 0c
    expect(commissionFor(11, 500)).toBe(1) // 0.55c -> 1c
    // Same rate applied twice always lands on the same cent.
    expect(commissionFor(12_345, 325)).toBe(commissionFor(12_345, 325))
    expect(commissionFor(12_345, 325)).toBe(401) // 401.2125c -> 401c
  })

  it('handles zero and negative inputs', () => {
    expect(commissionFor(0, 500)).toBe(0)
    expect(commissionFor(50_000, 0)).toBe(0)
    expect(commissionFor(-10, 500)).toBe(-1) // half away from zero
    expect(commissionFor(Number.NaN, 500)).toBe(0)
  })
})

describe('averageCents', () => {
  it('divides with half-up rounding', () => {
    expect(averageCents(74_200, 3)).toBe(24_733) // $247.33
    expect(averageCents(100, 8)).toBe(13) // 12.5 -> 13
    expect(averageCents(300, 8)).toBe(38) // 37.5 -> 38
  })

  it('is 0 when there is nothing to average (spec §65)', () => {
    expect(averageCents(0, 0)).toBe(0)
    expect(averageCents(50_000, 0)).toBe(0)
    expect(averageCents(50_000, -3)).toBe(0)
  })
})

describe('cent conversion', () => {
  it('converts for display only', () => {
    expect(centsToNumber(38_900)).toBe(389)
    expect(centsToNumber(38_950)).toBe(389.5)
    expect(numberToCents(389.5)).toBe(38_950)
    expect(numberToCents(0.005)).toBe(1) // half up
    expect(numberToCents(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('clamps negatives when asked', () => {
    expect(atLeastZero(-500)).toBe(0)
    expect(atLeastZero(500)).toBe(500)
  })
})

describe('parseAmountToCents', () => {
  it('parses what the numeric keypad produces', () => {
    expect(parseAmountToCents('389')).toBe(38_900)
    expect(parseAmountToCents('389.5')).toBe(38_950)
    expect(parseAmountToCents('389.99')).toBe(38_999)
    expect(parseAmountToCents('0')).toBe(0)
    expect(parseAmountToCents('0.05')).toBe(5)
    expect(parseAmountToCents('389.')).toBe(38_900)
    expect(parseAmountToCents('.5')).toBe(50)
    expect(parseAmountToCents('0389')).toBe(38_900)
  })

  it('tolerates currency noise from pasted values', () => {
    expect(parseAmountToCents('$1,234.56')).toBe(123_456)
    expect(parseAmountToCents('  12 ')).toBe(1200)
    expect(parseAmountToCents('$389')).toBe(38_900)
  })

  it('rounds beyond two decimals rather than failing', () => {
    expect(parseAmountToCents('1234.567')).toBe(123_457)
    expect(parseAmountToCents('1.234')).toBe(123)
    expect(parseAmountToCents('389.995')).toBe(39_000)
  })

  it('rejects junk', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('   ')).toBeNull()
    expect(parseAmountToCents('.')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('12abc')).toBeNull()
    expect(parseAmountToCents('1.2.3')).toBeNull()
    expect(parseAmountToCents('1e5')).toBeNull()
    expect(parseAmountToCents('--5')).toBeNull()
    expect(parseAmountToCents('+')).toBeNull()
  })

  it('keeps an explicit sign', () => {
    expect(parseAmountToCents('-5')).toBe(-500)
    expect(parseAmountToCents('+5')).toBe(500)
  })

  it('never returns a float', () => {
    for (const input of ['1', '1.1', '1.11', '99999.99', '0.01']) {
      const cents = parseAmountToCents(input)
      expect(Number.isInteger(cents)).toBe(true)
    }
  })
})

describe('percentOf', () => {
  it('returns an uncapped fraction (spec §51)', () => {
    expect(percentOf(785_000, 1_000_000)).toBeCloseTo(0.785, 10)
    expect(percentOf(1_240_000, 1_000_000)).toBeCloseTo(1.24, 10)
    expect(percentOf(74_200, 50_000)).toBeCloseTo(1.484, 10)
  })

  it('never divides by zero', () => {
    expect(percentOf(74_200, 0)).toBe(0)
    expect(percentOf(0, 0)).toBe(0)
    expect(percentOf(Number.NaN, 100)).toBe(0)
  })
})
