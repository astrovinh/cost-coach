import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'cost-coach',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 3,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

// turn.step streams: nothing runs until the stream is read to its end.
const step = async ($: { turn: { step: (i: any) => any } }, turnId: string) => {
  const stream = $.turn.step({
    turnId,
    index: 0,
    model: 'claude-opus-5-5',
    effort: 'max',
    messageCount: 2,
  })
  for await (const _chunk of stream) {
    // drain
  }
  await stream.result
}

const turn = (n: number, output: number) => ({
  answer: 'ok',
  durationMs: 1000,
  isAborted: false,
  turnId: `t${n}`,
  reason: 'answer' as const,
  usage: {
    model: 'claude-opus-5-5',
    input_tokens: 1000,
    output_tokens: output,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
})

test('four short turns at max effort show the band', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('command.register', () => ({ value: { command: 'coach' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => e)
  on('turn.complete', () => ({ text: 'ok' }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  for (let n = 0; n < 4; n += 1) {
    await step($, `t${n}`)
    await $.turn.complete(turn(n, 200))
  }

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const line = await ui.find({ type: 'Text', text: /Cost tip/ })
  expect(line?.text).toContain('/effort high')
  await ui.unmount()
})

test('no tip before enough turns', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })
  on('command.register', () => ({ value: { command: 'coach' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: 'ok' }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage: null }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await step($, 't0')
  await $.turn.complete(turn(0, 200))

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Cost tip/ })).toBeUndefined()
  await ui.unmount()
})
