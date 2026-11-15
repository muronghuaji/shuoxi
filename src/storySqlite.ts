import initSqlJs, { type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import type {
  ApiConfig,
  Chapter,
  StoryMemoryData,
  Work,
  WorkDetail,
} from './types'
import { dispatchStorageError, readDatabase, writeDatabase } from './indexedDb'
import {
  buildStorySearchDocuments,
  tokenizeStoryText,
  type RetrievedMemory,
} from './storyRetrieval'
import { hasEmbeddingModel, requestEmbeddings, cosineSimilarity } from './semantic'

const STORY_SQLITE_KEY = 'shuoxi.storySqlite.v2'
const STORY_SQLITE_SCHEMA_VERSION = 2
const PERSIST_DEBOUNCE_MS = 1500

interface StorySqliteState {
  db: Database | null
  ready: Promise<Database | null> | null
  lastSavedAt: number
}

const state: StorySqliteState = { db: null, ready: null, lastSavedAt: 0 }
let lastSavedData: PrimaryStoryData | null = null
let saveQueue: Promise<void> = Promise.resolve()
let persistTimer: number | null = null
let persistInFlight: Promise<void> | null = null

function ensureSchemaVersion(db: Database): void {
  const result = db.exec('PRAGMA user_version')
  const version = Number(result[0]?.values[0]?.[0] ?? 0)
  ensureSchema(db)
  if (version > STORY_SQLITE_SCHEMA_VERSION) {
    throw new Error(`故事库版本 ${version} 高于当前应用支持的 ${STORY_SQLITE_SCHEMA_VERSION}`)
  }
  if (version < STORY_SQLITE_SCHEMA_VERSION) {
    db.run(`PRAGMA user_version = ${STORY_SQLITE_SCHEMA_VERSION}`)
  }
}

function ensureSchema(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS story_works (
      work_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS story_docs (
      work_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      chapter_id TEXT,
      chapter_number INTEGER,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 1,
      vector TEXT,
      PRIMARY KEY (work_id, doc_id)
    );
    CREATE INDEX IF NOT EXISTS story_docs_work ON story_docs(work_id);
    CREATE INDEX IF NOT EXISTS story_docs_chapter ON story_docs(work_id, chapter_number);
    CREATE TABLE IF NOT EXISTS story_terms (
      work_id TEXT NOT NULL,
      doc_id TEXT NOT NULL,
      term TEXT NOT NULL,
      weight REAL NOT NULL,
      PRIMARY KEY (work_id, doc_id, term)
    );
    CREATE INDEX IF NOT EXISTS story_terms_lookup ON story_terms(work_id, term);
    CREATE TABLE IF NOT EXISTS story_facts (
      work_id TEXT NOT NULL,
      fact_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      field TEXT NOT NULL,
      value TEXT NOT NULL,
      chapter_number INTEGER,
      status TEXT NOT NULL,
      PRIMARY KEY (work_id, fact_id)
    );
    CREATE TABLE IF NOT EXISTS story_promises (
      work_id TEXT NOT NULL,
      promise_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      due_chapter INTEGER,
      priority TEXT NOT NULL,
      PRIMARY KEY (work_id, promise_id)
    );
    CREATE TABLE IF NOT EXISTS story_knowledge (
      work_id TEXT NOT NULL,
      entry_id TEXT NOT NULL,
      character_id TEXT NOT NULL,
      topic TEXT NOT NULL,
      state TEXT NOT NULL,
      chapter_number INTEGER,
      PRIMARY KEY (work_id, entry_id)
    );
    CREATE TABLE IF NOT EXISTS story_volumes (
      work_id TEXT NOT NULL,
      volume_id TEXT NOT NULL,
      start_index INTEGER NOT NULL,
      end_index INTEGER NOT NULL,
      summary TEXT NOT NULL,
      PRIMARY KEY (work_id, volume_id)
    );
    CREATE TABLE IF NOT EXISTS app_works (
      work_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      position INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_chapters (
      work_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (work_id, chapter_id)
    );
    CREATE TABLE IF NOT EXISTS app_details (
      work_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
}

async function persistDatabaseNow(): Promise<void> {
  const db = state.db
  if (!db) return
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer)
    persistTimer = null
  }
  if (persistInFlight) return persistInFlight
  const bytes = db.export()
  state.lastSavedAt = Date.now()
  persistInFlight = writeDatabase(STORY_SQLITE_KEY, bytes)
    .catch((error) => {
      dispatchStorageError('shuoxi.storySqlite.persist', error)
      throw error
    })
    .finally(() => {
      persistInFlight = null
    })
  return persistInFlight
}

function schedulePersistDatabase(): void {
  if (persistTimer !== null) window.clearTimeout(persistTimer)
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    void persistDatabaseNow().catch(() => {
      // 保存状态由 useSqliteStoryStore 统一呈现；这里不再重复弹窗。
    })
  }, PERSIST_DEBOUNCE_MS)
}

export async function flushStoryDatabase(): Promise<void> {
  await persistDatabaseNow()
}

export function initStorySqlite(): Promise<Database | null> {
  if (state.db) return Promise.resolve(state.db)
  if (state.ready) return state.ready
  state.ready = (async () => {
    try {
      const SQL = await initSqlJs({ locateFile: () => wasmUrl })
      let bytes: Uint8Array | undefined
      try {
        bytes = await readDatabase<Uint8Array>(STORY_SQLITE_KEY)
      } catch {
        bytes = undefined
      }
      const db = bytes && bytes.byteLength > 0 ? new SQL.Database(bytes) : new SQL.Database()
      ensureSchemaVersion(db)
      state.db = db
      return db
    } catch (error) {
      dispatchStorageError('shuoxi.storySqlite.init', error)
      state.db = null
      return null
    }
  })()
  return state.ready
}

export function isStorySqliteReady(): boolean {
  return Boolean(state.db)
}

export function getStorySqliteSize(): number {
  return state.db?.export().byteLength ?? 0
}

function clearWork(db: Database, workId: string): void {
  for (const table of [
    'story_docs',
    'story_terms',
    'story_facts',
    'story_promises',
    'story_knowledge',
    'story_volumes',
  ]) {
    db.run(`DELETE FROM ${table} WHERE work_id = ?`, [workId])
  }
  db.run('DELETE FROM story_works WHERE work_id = ?', [workId])
}

function insertRows(
  db: Database,
  sql: string,
  rows: (string | number | null)[][],
): void {
  const statement = db.prepare(sql)
  try {
    for (const row of rows) statement.run(row)
  } finally {
    statement.free()
  }
}

export interface PrimaryStoryData {
  works: Work[]
  chapters: Record<string, Chapter[]>
  details: Record<string, WorkDetail>
}

export async function loadPrimaryStoryData(): Promise<PrimaryStoryData | null> {
  const db = await initStorySqlite()
  if (!db) return null
  try {
    const worksResult = db.exec('SELECT payload FROM app_works ORDER BY position')
    const rows = worksResult[0]?.values ?? []
    if (rows.length === 0) return null
    const works: Work[] = []
    for (const row of rows) {
      const payload = row[0]
      if (typeof payload !== 'string') continue
      try {
        works.push(JSON.parse(payload) as Work)
      } catch {
        // 损坏行跳过，保留其余作品。
      }
    }
    if (works.length === 0) return null
    const chapters: Record<string, Chapter[]> = {}
    const chapterResult = db.exec(
      'SELECT work_id, payload FROM app_chapters ORDER BY work_id, position',
    )
    for (const row of chapterResult[0]?.values ?? []) {
      const workId = String(row[0])
      const payload = row[1]
      if (typeof payload !== 'string') continue
      try {
        chapters[workId] = [...(chapters[workId] ?? []), JSON.parse(payload) as Chapter]
      } catch {
        // 单章损坏不阻塞作品加载。
      }
    }
    const details: Record<string, WorkDetail> = {}
    const detailResult = db.exec('SELECT work_id, payload FROM app_details')
    for (const row of detailResult[0]?.values ?? []) {
      const workId = String(row[0])
      const payload = row[1]
      if (typeof payload !== 'string') continue
      try {
        details[workId] = JSON.parse(payload) as WorkDetail
      } catch {
        // 单本详情损坏不阻塞其他作品。
      }
    }
    const data: PrimaryStoryData = { works, chapters, details }
    lastSavedData = data
    return data
  } catch {
    return null
  }
}

export interface SaveStoryOptions {
  persistNow?: boolean
  forceFull?: boolean
}

function writeFullStoryData(db: Database, data: PrimaryStoryData): void {
  db.run('DELETE FROM app_works')
  db.run('DELETE FROM app_chapters')
  db.run('DELETE FROM app_details')
  const now = Date.now()
  const workRows: (string | number)[][] = data.works.map((work, index) => [
    work.id,
    JSON.stringify(work),
    index,
    now,
  ])
  insertRows(
    db,
    'INSERT OR REPLACE INTO app_works(work_id, payload, position, updated_at) VALUES (?, ?, ?, ?)',
    workRows,
  )
  const chapterRows: (string | number)[][] = []
  for (const work of data.works) {
    const list = data.chapters[work.id] ?? []
    list.forEach((chapter, index) => {
      chapterRows.push([work.id, chapter.id, JSON.stringify(chapter), index])
    })
  }
  insertRows(
    db,
    'INSERT OR REPLACE INTO app_chapters(work_id, chapter_id, payload, position) VALUES (?, ?, ?, ?)',
    chapterRows,
  )
  const detailRows: (string | number)[][] = data.works
    .filter((work) => data.details[work.id])
    .map((work) => [work.id, JSON.stringify(data.details[work.id]), now])
  insertRows(
    db,
    'INSERT OR REPLACE INTO app_details(work_id, payload, updated_at) VALUES (?, ?, ?)',
    detailRows,
  )
}

function writeStoryDelta(db: Database, previous: PrimaryStoryData, data: PrimaryStoryData): void {
  const now = Date.now()
  const oldWorks = new Map(previous.works.map((work) => [work.id, work]))
  const nextWorkIds = new Set(data.works.map((work) => work.id))
  for (const oldWork of previous.works) {
    if (nextWorkIds.has(oldWork.id)) continue
    db.run('DELETE FROM app_works WHERE work_id = ?', [oldWork.id])
    db.run('DELETE FROM app_chapters WHERE work_id = ?', [oldWork.id])
    db.run('DELETE FROM app_details WHERE work_id = ?', [oldWork.id])
  }

  const orderChanged =
    previous.works.map((work) => work.id).join('\u0000') !==
    data.works.map((work) => work.id).join('\u0000')
  data.works.forEach((work, index) => {
    const oldWork = oldWorks.get(work.id)
    if (!oldWork || oldWork !== work || orderChanged) {
      db.run(
        'INSERT OR REPLACE INTO app_works(work_id, payload, position, updated_at) VALUES (?, ?, ?, ?)',
        [work.id, JSON.stringify(work), index, now],
      )
    }

    const oldChapters = (previous.chapters[work.id] ?? []) as Chapter[]
    const nextChapters = data.chapters[work.id] ?? []
    if (oldChapters !== nextChapters) {
      const nextChapterIds = new Set(nextChapters.map((chapter) => chapter.id))
      for (const oldChapter of oldChapters) {
        if (!nextChapterIds.has(oldChapter.id)) {
          db.run('DELETE FROM app_chapters WHERE work_id = ? AND chapter_id = ?', [
            work.id,
            oldChapter.id,
          ])
        }
      }
      const chapterRows: (string | number)[][] = nextChapters.map((chapter, position) => [
        work.id,
        chapter.id,
        JSON.stringify(chapter),
        position,
      ])
      insertRows(
        db,
        'INSERT OR REPLACE INTO app_chapters(work_id, chapter_id, payload, position) VALUES (?, ?, ?, ?)',
        chapterRows,
      )
    }

    const oldDetail = previous.details[work.id]
    const nextDetail = data.details[work.id]
    if (oldDetail !== nextDetail) {
      if (!nextDetail) {
        db.run('DELETE FROM app_details WHERE work_id = ?', [work.id])
      } else {
        db.run(
          'INSERT OR REPLACE INTO app_details(work_id, payload, updated_at) VALUES (?, ?, ?)',
          [work.id, JSON.stringify(nextDetail), now],
        )
      }
    }
  })
}

async function savePrimaryStoryDataNow(
  data: PrimaryStoryData,
  options: SaveStoryOptions,
): Promise<void> {
  const db = await initStorySqlite()
  if (!db) return
  const previous = lastSavedData
  db.run('BEGIN')
  try {
    if (!previous || options.forceFull) {
      writeFullStoryData(db, data)
    } else {
      writeStoryDelta(db, previous, data)
    }
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
  lastSavedData = data
  if (options.persistNow) {
    await persistDatabaseNow()
  } else {
    schedulePersistDatabase()
  }
}

export function savePrimaryStoryData(
  data: PrimaryStoryData,
  options: SaveStoryOptions = {},
): Promise<void> {
  const run = saveQueue.then(
    () => savePrimaryStoryDataNow(data, options),
    () => savePrimaryStoryDataNow(data, options),
  )
  saveQueue = run.catch(() => undefined)
  return run
}

export interface StorySqliteIndexResult {
  documents: number
  terms: number
  semantic: boolean
  model: string
  sizeBytes: number
}

export async function indexStoryWork(input: {
  workId: string
  title: string
  detail: WorkDetail
  chapters: Chapter[]
  memory: StoryMemoryData
  api: ApiConfig
}): Promise<StorySqliteIndexResult> {
  const db = await initStorySqlite()
  if (!db) throw new Error('SQLite 初始化失败')
  const docs = buildStorySearchDocuments(input.detail, input.chapters, input.memory)
  let termCount = 0
  const embedding = hasEmbeddingModel(input.api)
  const vectors = new Map<string, number[]>()
  if (embedding) {
    try {
      for (let index = 0; index < docs.length; index += 32) {
        const batch = docs.slice(index, index + 32)
        const result = await requestEmbeddings(
          input.api,
          batch.map((doc) => `${doc.title}\n${doc.text}`.slice(0, 3000)),
        )
        if (!result) continue
        result.vectors.forEach((vector, vectorIndex) => {
          const doc = batch[vectorIndex]
          if (doc) vectors.set(doc.id, vector)
        })
      }
    } catch {
      // Embedding 服务不可用时保留关键词索引。
    }
  }

  clearWork(db, input.workId)
  db.run('BEGIN')
  try {
    db.run(
      'INSERT INTO story_works(work_id, title, updated_at, payload) VALUES (?, ?, ?, ?)',
      [
        input.workId,
        input.title,
        Date.now(),
        JSON.stringify({
          detail: input.detail,
          chapters: input.chapters,
          memory: input.memory,
        }),
      ],
    )
    const docRows: (string | number | null)[][] = []
    const termRows: (string | number | null)[][] = []
    for (const doc of docs) {
      const vector = vectors.get(doc.id)
      docRows.push([
        input.workId,
        doc.id,
        doc.kind,
        doc.chapterId ?? null,
        doc.chapterNumber ?? null,
        doc.title,
        doc.text,
        doc.importance,
        vector ? JSON.stringify(vector) : null,
      ])
      const terms = tokenizeStoryText(`${doc.title}\n${doc.text}`)
      const weight = 1 / Math.sqrt(Math.max(1, terms.length))
      for (const term of terms.slice(0, 500)) {
        termRows.push([input.workId, doc.id, term, weight])
      }
    }
    insertRows(
      db,
      'INSERT INTO story_docs(work_id, doc_id, kind, chapter_id, chapter_number, title, text, importance, vector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      docRows,
    )
    insertRows(
      db,
      'INSERT INTO story_terms(work_id, doc_id, term, weight) VALUES (?, ?, ?, ?)',
      termRows,
    )
    termCount = termRows.length
    insertRows(
      db,
      'INSERT INTO story_facts(work_id, fact_id, subject_id, field, value, chapter_number, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      input.memory.facts.slice(0, 3000).map((fact) => [
        input.workId,
        fact.id,
        fact.subjectId,
        fact.field,
        fact.displayValue,
        fact.validFromChapterNumber,
        fact.status,
      ]),
    )
    insertRows(
      db,
      'INSERT INTO story_promises(work_id, promise_id, title, status, due_chapter, priority) VALUES (?, ?, ?, ?, ?, ?)',
      input.memory.promises.slice(0, 1000).map((promise) => [
        input.workId,
        promise.id,
        promise.title,
        promise.status,
        promise.dueChapterNumber ?? null,
        promise.priority,
      ]),
    )
    insertRows(
      db,
      'INSERT INTO story_knowledge(work_id, entry_id, character_id, topic, state, chapter_number) VALUES (?, ?, ?, ?, ?, ?)',
      input.memory.knowledge.slice(0, 5000).map((entry) => [
        input.workId,
        entry.id,
        entry.characterId,
        entry.topic,
        entry.state,
        entry.chapterNumber ?? null,
      ]),
    )
    insertRows(
      db,
      'INSERT INTO story_volumes(work_id, volume_id, start_index, end_index, summary) VALUES (?, ?, ?, ?, ?)',
      input.memory.volumes.map((volume) => [
        input.workId,
        volume.id,
        volume.startIndex,
        volume.endIndex,
        volume.summary,
      ]),
    )
    db.run('COMMIT')
  } catch (error) {
    db.run('ROLLBACK')
    throw error
  }
  await persistDatabaseNow()
  return {
    documents: docs.length,
    terms: termCount,
    semantic: vectors.size > 0,
    model: input.api.embeddingModel?.trim() ?? '',
    sizeBytes: getStorySqliteSize(),
  }
}

function toRetrieved(row: {
  doc_id: string
  kind: string
  chapter_id: string | null
  chapter_number: number | null
  title: string
  text: string
  score: number
}): RetrievedMemory {
  return {
    id: row.doc_id,
    kind: row.kind as RetrievedMemory['kind'],
    chapterId: row.chapter_id ?? undefined,
    chapterNumber: row.chapter_number ?? undefined,
    title: row.title,
    text: row.text,
    score: row.score,
    source: 'SQLite 索引',
  }
}

export function queryLexicalStoryIndex(input: {
  workId: string
  query: string
  currentChapterNumber: number
  limit?: number
}): RetrievedMemory[] {
  const db = state.db
  if (!db) return []
  const terms = tokenizeStoryText(input.query).slice(0, 60)
  if (terms.length === 0) return []
  const placeholders = terms.map(() => '?').join(', ')
  const sql = `
    SELECT docs.doc_id, docs.kind, docs.chapter_id, docs.chapter_number, docs.title, docs.text,
           SUM(terms.weight) AS score
    FROM story_terms terms
    JOIN story_docs docs ON docs.work_id = terms.work_id AND docs.doc_id = terms.doc_id
    WHERE terms.work_id = ?
      AND terms.term IN (${placeholders})
      AND (docs.chapter_number IS NULL OR docs.chapter_number <= ?)
    GROUP BY docs.work_id, docs.doc_id
    ORDER BY score DESC
    LIMIT ?
  `
  const statement = db.prepare(sql)
  try {
    statement.bind([input.workId, ...terms, input.currentChapterNumber, input.limit ?? 12])
    const rows: RetrievedMemory[] = []
    while (statement.step()) {
      const row = statement.getAsObject() as Record<string, unknown>
      rows.push(
        toRetrieved({
          doc_id: String(row.doc_id),
          kind: String(row.kind),
          chapter_id: row.chapter_id ? String(row.chapter_id) : null,
          chapter_number: row.chapter_number ? Number(row.chapter_number) : null,
          title: String(row.title),
          text: String(row.text),
          score: Number(row.score ?? 0),
        }),
      )
    }
    return rows
  } finally {
    statement.free()
  }
}

export async function querySemanticStoryIndex(input: {
  workId: string
  query: string
  currentChapterNumber: number
  api: ApiConfig
  limit?: number
}): Promise<RetrievedMemory[]> {
  const db = await initStorySqlite()
  if (!db || !hasEmbeddingModel(input.api)) return []
  const result = await requestEmbeddings(input.api, [input.query])
  if (!result || result.vectors.length === 0) return []
  const queryVector = result.vectors[0]
  const statement = db.prepare(
    'SELECT doc_id, kind, chapter_id, chapter_number, title, text, vector FROM story_docs WHERE work_id = ? AND vector IS NOT NULL AND (chapter_number IS NULL OR chapter_number <= ?)',
  )
  const hits: (RetrievedMemory & { similarity: number })[] = []
  try {
    statement.bind([input.workId, input.currentChapterNumber])
    while (statement.step()) {
      const row = statement.getAsObject() as Record<string, unknown>
      let vector: number[] = []
      try {
        vector = JSON.parse(String(row.vector)) as number[]
      } catch {
        continue
      }
      const similarity = cosineSimilarity(queryVector, vector)
      if (similarity <= 0) continue
      hits.push({
        ...toRetrieved({
          doc_id: String(row.doc_id),
          kind: String(row.kind),
          chapter_id: row.chapter_id ? String(row.chapter_id) : null,
          chapter_number: row.chapter_number ? Number(row.chapter_number) : null,
          title: String(row.title),
          text: String(row.text),
          score: similarity,
        }),
        similarity,
      })
    }
  } finally {
    statement.free()
  }
  return hits
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, input.limit ?? 10)
}

export async function getStorySqliteStatus(workId: string): Promise<{
  ready: boolean
  documents: number
  terms: number
  vectors: number
  sizeBytes: number
  indexedAt: number | null
}> {
  const db = await initStorySqlite()
  if (!db) return { ready: false, documents: 0, terms: 0, vectors: 0, sizeBytes: 0, indexedAt: null }
  const count = (sql: string) => {
    const result = db.exec(sql, [workId])
    return Number(result[0]?.values[0]?.[0] ?? 0)
  }
  return {
    ready: true,
    documents: count('SELECT COUNT(*) FROM story_docs WHERE work_id = ?'),
    terms: count('SELECT COUNT(*) FROM story_terms WHERE work_id = ?'),
    vectors: count('SELECT COUNT(*) FROM story_docs WHERE work_id = ? AND vector IS NOT NULL'),
    sizeBytes: getStorySqliteSize(),
    indexedAt:
      Number(
        db.exec('SELECT updated_at FROM story_works WHERE work_id = ?', [workId])[0]?.values[0]?.[0] ??
          0,
      ) || null,
  }
}

export async function exportStorySqlite(): Promise<Uint8Array | null> {
  const db = await initStorySqlite()
  return db ? db.export() : null
}
