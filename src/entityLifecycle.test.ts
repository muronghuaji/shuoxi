import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import { applyLifecycleFromChapter } from './entityLifecycle'
import { effectiveLifecycle } from './components/LifecycleTags'

describe('entity lifecycle from chapter text', () => {
  it('marks entities appearing in the chapter as online', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      { id: 'c1', name: '陆照雪', role: '', identity: '', personality: '', goal: '' },
      { id: 'c2', name: '沈玄清', role: '', identity: '', personality: '', goal: '' },
    ]
    detail.factions = [
      { id: 'f1', name: '太虚剑宗', type: '宗门', leader: '', goal: '', description: '' },
    ]
    detail.items = [
      { id: 'i1', name: '照雪剑', categoryId: 'cat', grade: 1, description: '' },
    ]
    const result = applyLifecycleFromChapter(detail, '陆照雪握着照雪剑，站在太虚剑宗门前。')
    expect(result.characters.find((item) => item.id === 'c1')?.lifecycle).toBe('已上线')
    expect(result.characters.find((item) => item.id === 'c2')?.lifecycle).toBe('未上线')
    expect(result.factions[0].lifecycle).toBe('已上线')
    expect(result.items?.[0].lifecycle).toBe('已上线')
    expect(effectiveLifecycle(undefined)).toBe('未上线')
  })

  it('marks death, dissolution and revival', () => {
    const detail = createEmptyDetail()
    detail.characters = [
      { id: 'c1', name: '陆照雪', role: '', identity: '', personality: '', goal: '' },
      { id: 'c2', name: '沈玄清', role: '', identity: '', personality: '', goal: '' },
    ]
    detail.factions = [
      { id: 'f1', name: '太虚剑宗', type: '宗门', leader: '', goal: '', description: '' },
    ]
    const dead = applyLifecycleFromChapter(
      { ...detail, characters: detail.characters.map((item) => ({ ...item, lifecycle: '已上线' as const })) },
      '陆照雪已经身亡。',
    )
    expect(dead.characters[0].lifecycle).toBe('已下线')
    const revived = applyLifecycleFromChapter(
      dead,
      '陆照雪复活归来，重新出现在太虚剑宗。',
    )
    expect(revived.characters[0].lifecycle).toBe('已上线')
    const dissolved = applyLifecycleFromChapter(detail, '太虚剑宗覆灭，旧部离散。')
    expect(dissolved.factions[0].lifecycle).toBe('已下线')
  })
})
