import { describe, expect, it } from 'vitest'
import { createZip } from './zip'
import {
  buildSkillMarkdown,
  buildSkillZip,
  parseSkillMarkdown,
  parseSkillPackageZip,
} from './skillPackage'

const encoder = new TextEncoder()

describe('SKILL.md package', () => {
  it('parses frontmatter, body, tools and references', () => {
    const skill = parseSkillMarkdown(
      `---
name: 去肢体动作腔
description: 减少肢体动作
category: 润色
output: rewrite
profile: writing
tools:
  - selection
  - chapter
---

每 3 个自然段最多保留 1 处身体动作。`,
      'fallback',
      [{ name: 'references/反例.md', text: '他皱了皱眉。' }],
    )
    expect(skill.name).toBe('去肢体动作腔')
    expect(skill.category).toBe('润色')
    expect(skill.output).toBe('rewrite')
    expect(skill.tools).toEqual(['selection', 'chapter'])
    expect(skill.instructions).toContain('每 3 个自然段')
    expect(skill.resources?.[0].text).toContain('皱了皱眉')
  })

  it('parses a ZIP skill package with references', async () => {
    const zip = createZip([
      {
        name: 'demo/SKILL.md',
        data: encoder.encode('---\nname: ZIP技能\ndescription: 测试\n---\n\n处理正文。'),
      },
      {
        name: 'demo/references/example.md',
        data: encoder.encode('示例资料'),
      },
    ])
    const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
    const skills = await parseSkillPackageZip(buffer)
    expect(skills).toHaveLength(1)
    expect(skills[0].name).toBe('ZIP技能')
    expect(skills[0].resources?.[0].text).toContain('示例资料')
  })

  it('rejects executable files in ZIP package', async () => {
    const zip = createZip([
      { name: 'bad/SKILL.md', data: encoder.encode('---\nname: 坏技能\n---\n内容') },
      { name: 'bad/run.exe', data: new Uint8Array([1, 2, 3]) },
    ])
    const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
    await expect(parseSkillPackageZip(buffer)).rejects.toThrow(/可执行文件/)
  })

  it('round-trips an exported skill package', async () => {
    const skill = parseSkillMarkdown(
      '---\nname: 导出测试\ndescription: 测试导出\n---\n\n按规则改写。',
    )
    const zip = buildSkillZip(skill)
    expect(buildSkillMarkdown(skill)).toContain('name: 导出测试')
    const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
    const parsed = await parseSkillPackageZip(buffer)
    expect(parsed[0].name).toBe('导出测试')
    expect(parsed[0].instructions).toContain('按规则改写')
  })
})

describe('deflated ZIP skill package', () => {
  it('reads a Windows Compress-Archive ZIP', async () => {
    const base64 =
      'UEsDBBQAAAAIABK3bV0aFgSBlwAAAKMAAAANAAAAZGVtb1xTS0lMTC5tZNPV1eXKS8xNtVJ41j3tWffeZ1u7X6yf+qyr4UXzXq6U1OLkosyCksz8PKA8kszTnlag8qetS7mSE0tS0/OLKoHy25a96NzElV9aUlBaYqVQlFpelFmSylVQlJ+WmQM0H8TNzEvnKsnPzym24lJQ0FUoTs1JTQaZzqULdMaL9dufTdn5tG3my4bOJzvWPpvW/mzOmscNTQBQSwMEFAAACAgAErdtXcHBs/IPAAAADAAAABkAAABkZW1vXHJlZmVyZW5jZXNc56S65L6LLm1ke75k15N93S+2tjybNhMAUEsBAhQAFAAAAAgAErdtXRoWBIGXAAAAowAAAA0AAAAAAAAAAAAAAAAAAAAAAGRlbW9cU0tJTEwubWRQSwECFAAUAAAICAASt21dwcGz8g8AAAAMAAAAGQAAAAAAAAAAAAAAAADCAAAAZGVtb1xyZWZlcmVuY2VzXOekuuS+iy5tZFBLBQYAAAAAAgACAIIAAAAIAQAAAAA='
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const skills = await parseSkillPackageZip(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    )
    expect(skills[0].name).toBe('拖拽测试技能')
    expect(skills[0].resources?.[0].text).toContain('示例资料')
  })
})