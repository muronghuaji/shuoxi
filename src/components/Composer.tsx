import { useEffect, useState } from 'react'
import type { Genre } from '../types'
import { QUICK_GENRES } from '../genres'
import { STYLE_PRESETS } from '../styleProfile'
import type { StorySeedRequest } from '../storySeed'
import { IconArrowRight } from './Icons'

const EXAMPLE =
  '雨夜，旧书店。林夏推门进来，发现柜台后坐着三年前失踪的姐姐，她手里捏着一张泛黄的寻人启事。'
const DRAFT_KEY = 'shuoxi.homeSeedDraft.v1'
const WORD_PRESETS = [100000, 300000, 500000, 1000000]

interface ComposerProps {
  apiReady: boolean
  onStart: (request: StorySeedRequest) => void
}

interface SavedDraft {
  premise: string
  genres: Genre[]
  targetWords: number
  stylePresetId: string
}

function readDraft(): SavedDraft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return { premise: '', genres: [], targetWords: 300000, stylePresetId: '' }
    const value = JSON.parse(raw) as Partial<SavedDraft>
    return {
      premise: typeof value.premise === 'string' ? value.premise.slice(0, 300) : '',
      genres: Array.isArray(value.genres) ? value.genres.filter((genre) => QUICK_GENRES.includes(genre)) : [],
      targetWords: WORD_PRESETS.includes(Number(value.targetWords)) ? Number(value.targetWords) : 300000,
      stylePresetId: typeof value.stylePresetId === 'string' ? value.stylePresetId : '',
    }
  } catch {
    return { premise: '', genres: [], targetWords: 300000, stylePresetId: '' }
  }
}

export function Composer({ apiReady, onStart }: ComposerProps) {
  const [initial] = useState(readDraft)
  const [premise, setPremise] = useState(initial.premise)
  const [genres, setGenres] = useState<Genre[]>(initial.genres)
  const [targetWords, setTargetWords] = useState(initial.targetWords)
  const [stylePresetId, setStylePresetId] = useState(initial.stylePresetId)
  const canStart = premise.trim().length > 0

  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ premise, genres, targetWords, stylePresetId }),
      )
    } catch {
      // 本地存储不可用时不影响起戏。
    }
  }, [premise, genres, targetWords, stylePresetId])

  const toggleGenre = (genre: Genre) => {
    setGenres((prev) =>
      prev.includes(genre) ? prev.filter((item) => item !== genre) : [...prev, genre],
    )
  }

  const start = () => {
    if (!canStart) return
    onStart({
      premise: premise.trim(),
      genres,
      targetWords,
      stylePresetId: stylePresetId || undefined,
    })
  }

  return (
    <div className="composer">
      <textarea
        className="composer-input"
        value={premise}
        onChange={(event) => setPremise(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            start()
          }
        }}
        rows={3}
        maxLength={300}
        placeholder={EXAMPLE}
        aria-label="写一句起戏"
      />
      <div className="composer-bar">
        <div className="chip-row" role="group" aria-label="题材，可多选">
          <span className="chip-row-label">题材</span>
          {QUICK_GENRES.map((item) => (
            <button
              key={item}
              type="button"
              className={`chip ${genres.includes(item) ? 'chip-active' : ''}`}
              aria-pressed={genres.includes(item)}
              title="可多选，更多题材可在下一步选择"
              onClick={() => toggleGenre(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="composer-actions">
          <span className="kbd-hint">
            <kbd>Ctrl</kbd>
            <span>+</span>
            <kbd>Enter</kbd>
          </span>
          <button type="button" className="btn btn-primary" disabled={!canStart} onClick={start}>
            {apiReady ? '生成故事草案' : '下一步：设置作品'}
            <IconArrowRight size={16} />
          </button>
        </div>
      </div>
      <div className="composer-options">
        <label>
          <span>篇幅</span>
          <select
            className="input select"
            value={targetWords}
            onChange={(event) => setTargetWords(Number(event.target.value))}
          >
            {WORD_PRESETS.map((words) => (
              <option key={words} value={words}>
                {words / 10000} 万字
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>风格</span>
          <select
            className="input select"
            value={stylePresetId}
            onChange={(event) => setStylePresetId(event.target.value)}
          >
            <option value="">暂不指定</option>
            {STYLE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <span className="composer-next-hint">
          {apiReady ? '先预览故事草案，再补作品设置' : '先记下这句话，再补作品设置'}
        </span>
      </div>
    </div>
  )
}
