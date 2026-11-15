import { describe, expect, it } from 'vitest'
import {
  facilityPeopleCount,
  facilityPresetsFor,
  factionFacilityTotals,
  normalizeFacilities,
} from './factionFacilities'

describe('faction facilities', () => {
  it('adapts presets to faction type', () => {
    const sect = facilityPresetsFor('修仙宗门').map((item) => item.name)
    const merchant = facilityPresetsFor('商会').map((item) => item.name)
    const court = facilityPresetsFor('王朝').map((item) => item.name)
    expect(sect).toContain('藏书阁')
    expect(merchant).toContain('拍卖行')
    expect(court).toContain('国库')
    expect(sect).not.toEqual(merchant)
  })

  it('normalizes generated facility data and keeps legacy peaks out', () => {
    const facilities = normalizeFacilities([
      {
        name: '炼丹房',
        type: '丹房',
        keeper: '药老',
        description: '炼丹',
        effect: '产丹',
        counts: { elder: 1, main: 2, inner: 10, outer: 20, menial: 5 },
        resources: ['回春丹', '寒铁'],
      },
      { name: '', type: '空' },
      null,
    ])
    expect(facilities).toHaveLength(1)
    expect(facilities[0].name).toBe('炼丹房')
    expect(facilities[0].keeper).toBe('药老')
    expect(facilityPeopleCount(facilities[0])).toBe(38)
    expect(facilities[0].resourceNames).toEqual(['回春丹', '寒铁'])
    expect(normalizeFacilities(facilities)[0].resourceNames).toEqual(['回春丹', '寒铁'])
  })

  it('aggregates faction totals from facilities', () => {
    const facilities = normalizeFacilities([
      { name: '主峰', counts: { elder: 2, main: 3, inner: 20, outer: 40, menial: 10 } },
      { name: '丹房', counts: { elder: 1, main: 1, inner: 5, outer: 5, menial: 2 } },
    ])
    expect(factionFacilityTotals(facilities)).toEqual({
      elder: 3,
      main: 4,
      inner: 25,
      outer: 45,
      menial: 12,
    })
  })
})
