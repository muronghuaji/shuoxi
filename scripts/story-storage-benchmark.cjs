const fs = require('node:fs')
const path = require('node:path')
const initSqlJs = require('sql.js')

const ROOT = path.join(__dirname, '..')
const REPORT = path.join(ROOT, 'storage-benchmark-1m.json')

function now() {
  return performance.now()
}

function measure(label, fn) {
  const start = now()
  const result = fn()
  return { label, ms: Math.round((now() - start) * 10) / 10, result }
}

async function main() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(ROOT, 'node_modules', 'sql.js', 'dist', file),
  })
  const db = new SQL.Database()
  db.run(`
    CREATE TABLE app_works (work_id TEXT PRIMARY KEY, payload TEXT NOT NULL, position INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE app_chapters (work_id TEXT NOT NULL, chapter_id TEXT NOT NULL, payload TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (work_id, chapter_id));
    CREATE TABLE app_details (work_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
  `)

  const chapterCount = 400
  const targetChars = 1_000_000
  const chapterLength = Math.ceil(targetChars / chapterCount)
  const sentence = '雨落在旧港的石板路上，灯影被风推得很慢。'
  const chapters = Array.from({ length: chapterCount }, (_, index) => ({
    id: `ch-${index + 1}`,
    title: `第 ${index + 1} 章`,
    content: (sentence.repeat(Math.ceil(chapterLength / sentence.length) + 1)).slice(0, chapterLength),
    updatedAt: Date.now(),
  }))
  const work = {
    id: 'w-bench',
    title: '百万字压力测试',
    synopsis: '合成数据，不使用真实模型。',
    genres: ['悬疑'],
    status: '连载中',
    chapters: chapterCount,
    words: chapters.reduce((sum, chapter) => sum + chapter.content.length, 0),
  }
  const detail = {
    worldview: '雾港。'.repeat(200),
    style: { tone: ['克制'], pace: '中', dialogue: '中', description: '克制' },
    characters: Array.from({ length: 60 }, (_, index) => ({
      id: `c-${index}`,
      name: `角色${index}`,
      identity: '合成角色',
      personality: '测试',
    })),
    items: Array.from({ length: 100 }, (_, index) => ({ id: `i-${index}`, name: `物品${index}` })),
  }

  const fullInsert = measure('full_insert', () => {
    db.run('BEGIN')
    db.run('INSERT INTO app_works(work_id,payload,position,updated_at) VALUES (?,?,?,?)', [
      work.id,
      JSON.stringify(work),
      0,
      Date.now(),
    ])
    const statement = db.prepare(
      'INSERT INTO app_chapters(work_id,chapter_id,payload,position) VALUES (?,?,?,?)',
    )
    chapters.forEach((chapter, index) => {
      statement.run([work.id, chapter.id, JSON.stringify(chapter), index])
    })
    statement.free()
    db.run('INSERT INTO app_details(work_id,payload,updated_at) VALUES (?,?,?)', [
      work.id,
      JSON.stringify(detail),
      Date.now(),
    ])
    db.run('COMMIT')
    return chapters.length
  })

  const delta = measure('delta_update_one_chapter', () => {
    const changed = chapters[Math.floor(chapterCount / 2)]
    db.run('BEGIN')
    db.run('INSERT OR REPLACE INTO app_chapters(work_id,chapter_id,payload,position) VALUES (?,?,?,?)', [
      work.id,
      changed.id,
      JSON.stringify({ ...changed, content: `${changed.content}新` }),
      Math.floor(chapterCount / 2),
    ])
    db.run('COMMIT')
  })

  const exported = measure('export_database', () => db.export())
  const serialized = measure('serialize_all_data', () => ({
    works: JSON.stringify(work),
    chapters: JSON.stringify(chapters),
    details: JSON.stringify(detail),
  }))
  const parsed = measure('parse_all_data', () => ({
    works: JSON.parse(serialized.result.works),
    chapters: JSON.parse(serialized.result.chapters),
    details: JSON.parse(serialized.result.details),
  }))
  const loaded = measure('load_exported_database', () => {
    const next = new SQL.Database(exported.result)
    const result = next.exec('SELECT COUNT(*) FROM app_chapters')
    next.close()
    return result[0]?.values[0]?.[0]
  })

  const report = {
    generatedAt: new Date().toISOString(),
    note: '合成数据基准，不包含真实模型生成，也不代表 50 章真实长篇验收。',
    chapters: chapterCount,
    targetChars,
    actualChars: chapters.reduce((sum, chapter) => sum + chapter.content.length, 0),
    fullInsertMs: fullInsert.ms,
    deltaUpdateMs: delta.ms,
    exportMs: exported.ms,
    serializeMs: serialized.ms,
    parseMs: parsed.ms,
    loadExportedMs: loaded.ms,
    databaseBytes: exported.result.byteLength,
    serializedBytes:
      serialized.result.works.length +
      serialized.result.chapters.length +
      serialized.result.details.length,
    loadedChapterCount: loaded.result,
  }
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(report, null, 2))
  db.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
