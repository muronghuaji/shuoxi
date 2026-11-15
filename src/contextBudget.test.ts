import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OUTPUT_RESERVE,
  MIN_CONTEXT_BUDGET,
  modelContextWindow,
  resolveEffectiveContextBudget,
} from './contextBudget'

describe('context budget', () => {
  it('uses known model windows and a conservative fallback', () => {
    expect(modelContextWindow({ model: 'deepseek-chat' })).toBe(128000)
    expect(modelContextWindow({ model: 'claude-sonnet-4' })).toBe(200000)
    expect(modelContextWindow({ model: 'gemini-2.5-pro' })).toBe(1000000)
    expect(modelContextWindow({ model: 'unknown-model' })).toBe(128000)
    expect(modelContextWindow({ model: 'unknown-model', contextWindow: 64000 })).toBe(64000)
  })

  it('turns unlimited into model window minus output reserve', () => {
    const plan = resolveEffectiveContextBudget({ contextBudget: 0 }, { model: 'deepseek-chat' })
    expect(plan.unlimited).toBe(true)
    expect(plan.clamped).toBe(false)
    expect(plan.limit).toBe(128000 - DEFAULT_OUTPUT_RESERVE)
  })

  it('keeps a finite budget below the model window', () => {
    const plan = resolveEffectiveContextBudget({ contextBudget: 64000 }, { model: 'deepseek-chat' })
    expect(plan.unlimited).toBe(false)
    expect(plan.limit).toBe(64000)
    expect(plan.clamped).toBe(false)
  })

  it('clamps a budget larger than the model window', () => {
    const plan = resolveEffectiveContextBudget(
      { contextBudget: 128000 },
      { model: 'small-model', contextWindow: 32000 },
    )
    expect(plan.clamped).toBe(true)
    expect(plan.limit).toBe(32000 - DEFAULT_OUTPUT_RESERVE)
  })

  it('never goes below the minimum budget', () => {
    const plan = resolveEffectiveContextBudget(
      { contextBudget: 0 },
      { model: 'tiny-model', contextWindow: 6000 },
    )
    expect(plan.limit).toBeGreaterThanOrEqual(MIN_CONTEXT_BUDGET)
  })
})
