import { describe, expect, it } from 'vitest'
import { createEmptyDetail } from './data'
import {
  applyNarrationAddressFixes,
  auditDialogueAddressPermissions,
  buildCharacterAddressBook,
  harmonizeNarrationAddresses,
} from './characterAddress'
import type { WorkDetail } from './types'

function detail(): WorkDetail {
  return {
    ...createEmptyDetail(),
    characters: [
      {
        id: 'c1',
        name: '沈砚',
        role: '主角',
        identity: '校对员',
        personality: '',
        goal: '查清姐姐失踪',
        profile: {
          aliases: ['小沈', '沈小姐', '阿七'],
        },
      },
    ],
  } as unknown as WorkDetail
}

describe('character address harmony', () => {
  it('builds aliases from the character profile', () => {
    expect(buildCharacterAddressBook(detail())[0]).toMatchObject({
      name: '沈砚',
      aliases: ['小沈', '沈小姐', '阿七'],
    })
  })

  it('unifies surname-like aliases only in narration, not dialogue', () => {
    const result = harmonizeNarrationAddresses({
      text: '小沈推开门。\n他说：“小沈，快走。”\n沈小姐抬头。',
      detail: detail(),
    })
    expect(result.fixes.length).toBeGreaterThan(0)
    expect(result.text).toContain('沈砚推开门')
    expect(result.text).toContain('“小沈，快走。”')
    expect(result.text).toContain('沈砚抬头')
  })

  it('reports aliases that cannot be safely auto-replaced', () => {
    const result = harmonizeNarrationAddresses({
      text: '阿七站在门外。',
      detail: detail(),
    })
    expect(result.fixes).toHaveLength(0)
    expect(result.unresolved.some((item) => item.includes('阿七'))).toBe(true)
  })

  it('hides future identity names until the reveal chapter', () => {
    const workDetail = {
      ...createEmptyDetail(),
      characters: [
        {
          id: 'c1',
          name: '阿七',
          role: '神秘人',
          identity: '神秘人',
          personality: '',
          goal: '',
          addressTimeline: [
            { id: 'p1', label: '公开身份', name: '阿七', fromChapterIndex: 0 },
            { id: 'p2', label: '真实身份', name: '沈澜', fromChapterIndex: 5 },
          ],
        },
      ],
    } as unknown as WorkDetail

    const before = harmonizeNarrationAddresses({
      text: '沈澜站在门外。',
      detail: workDetail,
      chapterIndex: 2,
    })
    expect(before.unresolved.some((item) => item.includes('身份未揭露'))).toBe(true)

    const after = harmonizeNarrationAddresses({
      text: '沈澜站在门外。',
      detail: workDetail,
      chapterIndex: 5,
    })
    expect(after.unresolved.some((item) => item.includes('身份未揭露'))).toBe(false)
  })

  it('applies approved fixes only outside dialogue', () => {
    const text = '小沈推开门。\n他说：“小沈，快走。”'
    const result = applyNarrationAddressFixes(text, [{ from: '小沈', to: '沈砚' }])
    expect(result).toContain('沈砚推开门')
    expect(result).toContain('“小沈，快走。”')
  })

  it('checks dialogue address permissions against relation notes', () => {
    const workDetail = {
      ...createEmptyDetail(),
      characters: [
        {
          id: 'c1',
          name: '高振海',
          role: '站长',
          identity: '站长',
          personality: '',
          goal: '',
          profile: {
            relationNotes: [
              {
                characterId: 'c2',
                address: '沈砚',
                addressFormal: '沈小姐',
                addressIntimate: '',
                addressAngry: '',
              },
            ],
          },
        },
        {
          id: 'c2',
          name: '沈砚',
          role: '主角',
          identity: '校对员',
          personality: '',
          goal: '',
        },
        {
          id: 'c3',
          name: '陈默',
          role: '同事',
          identity: '同事',
          personality: '',
          goal: '',
        },
      ],
    } as unknown as WorkDetail

    const allowed = auditDialogueAddressPermissions({
      text: '高振海说：“沈小姐，到了。”',
      detail: workDetail,
    })
    expect(allowed).toHaveLength(0)

    const warned = auditDialogueAddressPermissions({
      text: '陈默说：“沈小姐，到了。”',
      detail: workDetail,
    })
    expect(warned.some((item) => item.includes('陈默') && item.includes('沈小姐'))).toBe(true)
  })
})
