import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Advice } from '../types'
import { advise, classify, coachText } from './advice'
import type { Effort, Stats, TurnStat } from './advice'

const tip = atom({ plugin: 'cost-coach', key: 'tip' } as const, null)
const hiddenId = atom({ plugin: 'cost-coach', key: 'hiddenId' } as const, null)

const KEEP_TURNS = 6
const KEEP_HELPERS = 10
const TOAST_EVERY_TURNS = 20

export const register: Register = on => {
  const stats: Stats = {
    model: '',
    effort: undefined,
    turns: [],
    helperTurns: 0,
    helperLargeTurns: 0,
  }
  const helperRuns: boolean[] = []
  let current: TurnStat = { output: 0, tools: 0, failed: 0, readOnly: 0 }
  let turnNumber = 0
  const toastedAt = new Map<string, number>()

  const resetWatch = () => {
    stats.turns = []
    helperRuns.length = 0
    stats.helperTurns = 0
    stats.helperLargeTurns = 0
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'coach',
      description: 'Show whether your model and effort fit the work',
    })

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    current = { output: 0, tools: 0, failed: 0, readOnly: 0 }

    return next(e)
  })

  // Watch only: every step passes through unchanged.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      const effort = e.effort as Effort
      const hasSwitched = stats.model !== '' && (stats.model !== e.model || stats.effort !== effort)
      stats.model = e.model
      stats.effort = effort

      // A new model or effort starts a fresh read: old turns say nothing about it.
      if (hasSwitched) {
        resetWatch()
        await update($, tip, () => null)
      }
    }

    return yield* next(e)
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)

    if (e.agentId === undefined) {
      current.tools += 1
      if (ran.isReadOnly === true) current.readOnly += 1
      if (ran.deny === undefined && ran.isError === true) current.failed += 1
    }

    return ran
  })

  on('session.measure', async ($, e, next) => {
    stats.contextTokens = e.context.tokens

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const usage = e.usage

    if (e.agentId !== undefined) {
      const isLarge = usage !== undefined && classify(usage.model) === 'large'
      helperRuns.push(isLarge)
      if (helperRuns.length > KEEP_HELPERS) helperRuns.shift()
      stats.helperTurns = helperRuns.length
      stats.helperLargeTurns = helperRuns.filter(Boolean).length

      return next(e)
    }

    if (usage !== undefined && !e.isAborted) {
      turnNumber += 1
      stats.turns.push({ ...current, output: usage.output_tokens })
      if (stats.turns.length > KEEP_TURNS) stats.turns.shift()
    }

    const advice: Advice | null = advise(stats)
    const previous = await read($, tip)
    await update($, tip, () => advice)

    if (advice !== null && advice.id !== previous?.id) {
      const last = toastedAt.get(advice.id)
      if (last === undefined || turnNumber - last >= TOAST_EVERY_TURNS) {
        toastedAt.set(advice.id, turnNumber)
        $.ui.toast(`Cost tip: ${advice.text}`)
      }
    }

    return next(e)
  })

  on('command.run', { command: 'coach' }, async $ => {
    return { text: coachText(stats, await read($, tip)) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const advice = await read($, tip)
    const isQuiet = e.props.hasSurvey || advice === null || (await read($, hiddenId)) === advice.id

    if (isQuiet) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box>
        <Text dimColor>Cost tip: {advice.text} </Text>
        <Button key="hide" label="Hide" onPress={() => update($, hiddenId, () => advice.id)} />
      </Box>
    )
  })
}
