export type AdviceKind =
  | 'raise-effort'
  | 'raise-model'
  | 'lower-effort'
  | 'cheaper-model'
  | 'cheaper-helpers'

export type Advice = {
  id: string
  kind: AdviceKind
  text: string
  command?: string
}

declare module 'claude-code' {
  interface PluginState {
    'cost-coach': { tip: Advice | null; hiddenId: string | null }
  }
}
