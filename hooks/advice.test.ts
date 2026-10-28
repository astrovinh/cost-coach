import { expect, test } from 'claude-code/testing'

import { advise, classify } from './advice'
import type { Stats, TurnStat } from './advice'

const light: TurnStat = { output: 200, tools: 3, failed: 0, readOnly: 3 }
const heavy: TurnStat = { output: 4000, tools: 6, failed: 0, readOnly: 1 }
const broken: TurnStat = { output: 500, tools: 4, failed: 2, readOnly: 1 }

const stats = (over: Partial<Stats>): Stats => ({
  model: 'claude-opus-5-5',
  effort: 'high',
  turns: [light, light, light, light],
  helperTurns: 0,
  helperLargeTurns: 0,
  ...over,
})

test('classifies models by family', () => {
  expect(classify('claude-opus-5-5')).toBe('large')
  expect(classify('claude-fable-5-1')).toBe('large')
  expect(classify('claude-sonnet-5-5')).toBe('mid')
  expect(classify('claude-haiku-5-5')).toBe('small')
  expect(classify('mystery')).toBe('unknown')
})

test('short clean turns at max effort say lower to high', () => {
  expect(advise(stats({ effort: 'max' }))?.command).toBe('/effort high')
})

test('short clean turns at high effort say medium', () => {
  expect(advise(stats({}))?.command).toBe('/effort medium')
})

test('short clean turns at medium on a top model say sonnet', () => {
  expect(advise(stats({ effort: 'medium' }))?.command).toBe('/model sonnet')
})

test('tiny read-only turns on sonnet say haiku', () => {
  const tiny: TurnStat = { output: 100, tools: 2, failed: 0, readOnly: 2 }
  const s = stats({ model: 'claude-sonnet-5-5', effort: 'medium', turns: [tiny, tiny, tiny, tiny] })
  expect(advise(s)?.command).toBe('/model haiku')
})

test('heavy work gets no cost tip', () => {
  expect(advise(stats({ effort: 'max', turns: [heavy, heavy, heavy, heavy] }))).toBeNull()
})

test('one heavy turn among light ones blocks a downgrade', () => {
  expect(advise(stats({ effort: 'max', turns: [light, light, heavy, light] }))).toBeNull()
})

test('too few turns says nothing', () => {
  expect(advise(stats({ effort: 'max', turns: [light, light] }))).toBeNull()
})

test('failures at low effort say raise effort, even when turns are short', () => {
  const s = stats({ effort: 'low', turns: [broken, broken, broken, light] })
  expect(advise(s)?.kind).toBe('raise-effort')
})

test('failures on a smaller model say raise the model', () => {
  const s = stats({ model: 'claude-haiku-5-5', effort: 'high', turns: [broken, broken, broken, light] })
  expect(advise(s)?.command).toBe('/model opus')
})

test('a failing turn blocks a cheaper-model tip', () => {
  const s = stats({ effort: 'medium', turns: [light, light, light, broken] })
  expect(advise(s)?.kind).not.toBe('cheaper-model')
})

test('helper runs on a top model say set the helper model', () => {
  const s = stats({ turns: [heavy], helperLargeTurns: 5, helperTurns: 5 })
  expect(advise(s)?.kind).toBe('cheaper-helpers')
})

test('a big context adds the cache warning', () => {
  const s = stats({ effort: 'max', contextTokens: 200_000 })
  expect(advise(s)?.text).toContain('re-reads it uncached')
  expect(advise(stats({ effort: 'max', contextTokens: 10_000 }))?.text).not.toContain('uncached')
})

test('an occasional failed call (under the bar) does not raise anything', () => {
  const s = stats({ effort: 'low', turns: [broken, light, light, light] })
  expect(advise(s)?.kind).not.toBe('raise-effort')
})
