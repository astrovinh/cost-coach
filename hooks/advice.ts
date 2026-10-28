import type { Advice } from '../types'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number | undefined

export type TurnStat = {
  output: number
  tools: number
  failed: number
  readOnly: number
}

export type Stats = {
  model: string
  effort: Effort
  turns: TurnStat[]
  helperTurns: number
  helperLargeTurns: number
  contextTokens?: number
}

export type ModelClass = 'large' | 'mid' | 'small' | 'unknown'

// Thresholds, in one place so they are easy to tune.
export const LIMITS = {
  turnsNeeded: 4,
  lightOutput: 600,
  tinyOutput: 300,
  readOnlyShare: 0.8,
  failuresToRaise: 3,
  failureShare: 0.3,
  helperTurns: 4,
  cacheNoteTokens: 80_000,
}

export function classify(model: string): ModelClass {
  const m = model.toLowerCase()
  if (m.includes('opus') || m.includes('fable')) return 'large'
  if (m.includes('sonnet')) return 'mid'
  if (m.includes('haiku')) return 'small'
  return 'unknown'
}

function level(effort: Effort): 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'default' {
  return typeof effort === 'string' ? effort : 'default'
}

function cacheNote(stats: Stats): string {
  const t = stats.contextTokens
  if (t === undefined || t < LIMITS.cacheNoteTokens) return ''
  return ` Context is ${Math.round(t / 1000)}k tokens and a switch re-reads it uncached, so do it after /compact or in a fresh session.`
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export function advise(stats: Stats): Advice | null {
  const turns = stats.turns.slice(-LIMITS.turnsNeeded)
  const cls = classify(stats.model)
  const eff = level(stats.effort)
  const note = cacheNote(stats)

  // Quality guard first: cheap is only good if the work still lands.
  const recentTools = sum(stats.turns.map(t => t.tools))
  const recentFailed = sum(stats.turns.map(t => t.failed))
  if (
    stats.turns.length >= 3 &&
    recentFailed >= LIMITS.failuresToRaise &&
    recentFailed / Math.max(recentTools, 1) >= LIMITS.failureShare
  ) {
    if (eff === 'low' || eff === 'medium') {
      return {
        id: 'raise-effort',
        kind: 'raise-effort',
        command: '/effort high',
        text: `${recentFailed} of the last ${recentTools} tool calls failed at ${eff} effort. Try /effort high: a retry loop costs more than thinking once.${note}`,
      }
    }
    if (cls === 'small' || cls === 'mid') {
      return {
        id: 'raise-model',
        kind: 'raise-model',
        command: '/model opus',
        text: `${recentFailed} of the last ${recentTools} tool calls failed on a smaller model. Try /model opus for this task.${note}`,
      }
    }
  }

  if (turns.length >= LIMITS.turnsNeeded) {
    const allLight = turns.every(t => t.output < LIMITS.lightOutput && t.failed === 0)
    const allTiny = turns.every(t => t.output < LIMITS.tinyOutput && t.failed === 0)
    const tools = sum(turns.map(t => t.tools))
    const readOnly = sum(turns.map(t => t.readOnly))
    const isMostlyReading = tools > 0 && readOnly / tools >= LIMITS.readOnlyShare

    if (allLight) {
      if (eff === 'xhigh' || eff === 'max') {
        return {
          id: 'lower-effort',
          kind: 'lower-effort',
          command: '/effort high',
          text: `Your last ${turns.length} turns were short and clean at ${eff} effort. /effort high gives nearly the same answers for fewer tokens.${note}`,
        }
      }
      if (eff === 'high' && (cls === 'large' || cls === 'mid')) {
        return {
          id: 'lower-effort',
          kind: 'lower-effort',
          command: '/effort medium',
          text: `Your last ${turns.length} turns were short and clean at high effort. /effort medium is enough for this kind of work.${note}`,
        }
      }
      if (cls === 'large' && (eff === 'medium' || eff === 'low' || eff === 'default')) {
        return {
          id: 'cheaper-model',
          kind: 'cheaper-model',
          command: '/model sonnet',
          text: `Light work for ${turns.length} turns in a row on a top model. /model sonnet would do this for much less.${note}`,
        }
      }
      if (cls === 'mid' && allTiny && isMostlyReading) {
        return {
          id: 'cheaper-model',
          kind: 'cheaper-model',
          command: '/model haiku',
          text: `The last ${turns.length} turns were tiny lookups. /model haiku is built for this.${note}`,
        }
      }
    }
  }

  if (stats.helperLargeTurns >= LIMITS.helperTurns) {
    return {
      id: 'cheaper-helpers',
      kind: 'cheaper-helpers',
      text: `${stats.helperLargeTurns} helper runs used a top model. Set model: sonnet or haiku in the helper's agent file (its frontmatter) so only the main chat uses the big one.`,
    }
  }

  return null
}

export function coachText(stats: Stats, tip: Advice | null): string {
  const lines = [
    `Model: ${stats.model || 'unknown'}  Effort: ${level(stats.effort)}`,
    `Turns watched since the last switch: ${stats.turns.length}`,
    tip ? `Tip: ${tip.text}` : 'No tip right now. Settings look right for the work you are doing.',
    '',
    'When I speak up:',
    `- Lower effort: ${LIMITS.turnsNeeded} short, clean turns in a row (under ${LIMITS.lightOutput} output tokens, no failed tools).`,
    '- Cheaper model: the same, but already at medium effort on a top model.',
    `- Raise effort or model: ${LIMITS.failuresToRaise}+ failed tool calls and at least ${LIMITS.failureShare * 100}% failing.`,
    `- Cheaper helpers: ${LIMITS.helperTurns}+ helper runs on a top model.`,
  ]
  return lines.join('\n')
}
