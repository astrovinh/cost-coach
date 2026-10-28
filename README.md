# cost-coach

Tells you when to lower effort or switch to a smaller model to save cost, and when to raise it back up so a cheap setting does not cost you quality.

It only watches. It never changes your model or effort for you. When it spots a mismatch it shows one line above the prompt (with a Hide button) and one toast, naming the exact command to run, for example `/effort medium` or `/model sonnet`.

## Install

At the prompt of a terminal session:

```
/plugin install cost-coach --marketplace astrovinh/cost-coach
```

From a shell:

```
claude plugin install cost-coach --marketplace astrovinh/cost-coach
```

Answer `y` to add the marketplace, then pick a scope.

## What it looks at

- Your model and effort on each main-chat turn.
- How much the model wrote per turn, how many tool calls ran, how many failed, how many were read-only.
- How many helper (subagent) runs used a top model.
- How full the context is, because switching model or effort re-reads the context uncached.

## When it speaks

| Signal | Tip |
| --- | --- |
| 4 short, clean turns at xhigh or max | `/effort high` |
| 4 short, clean turns at high | `/effort medium` |
| 4 short, clean turns on a top model at medium or low | `/model sonnet` |
| 4 tiny read-only turns on Sonnet | `/model haiku` |
| 3+ failed tool calls (30%+ of calls) at low or medium | `/effort high` |
| The same on a smaller model | `/model opus` |
| 4+ helper runs on a top model | set `model:` in the helper's agent file |

When you change model or effort, the watch starts over. Run `/coach` any time to see the current model, effort, tip and thresholds. Thresholds live in `LIMITS` in `hooks/advice.ts`.

Based on the effort guidance at https://platform.claude.com/docs/en/build-with-claude/effort. The numbers are a starting point, so tune them to your own work.
