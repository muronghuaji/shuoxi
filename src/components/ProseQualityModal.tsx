import { useMemo } from 'react'
import { analyzeProseQuality } from '../proseQuality'
import { Modal } from './Modal'

interface ProseQualityModalProps {
  content: string
  chapterTitle: string
  onClose: () => void
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function ProseQualityModal({ content, chapterTitle, onClose }: ProseQualityModalProps) {
  const report = useMemo(() => analyzeProseQuality(content), [content])
  const scoreTone = report.score >= 80 ? 'good' : report.score >= 60 ? 'warn' : 'bad'

  return (
    <Modal
      title="文本质感检查"
      subtitle={`${chapterTitle || '当前章节'} · 本地分析，不调用 AI`}
      size="lg"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          完成
        </button>
      }
    >
      <div className="prose-quality">
        <div className={`prose-quality-score ${scoreTone}`}>
          <strong>{report.score}</strong>
          <span>质感分</span>
          <small>仅作写作提示，不是自动评分标准</small>
        </div>

        <div className="prose-quality-metrics">
          <div>
            <span>字数 / 句数</span>
            <strong>
              {report.chars} / {report.sentences}
            </strong>
          </div>
          <div>
            <span>平均句长</span>
            <strong>{report.averageSentenceLength} 字</strong>
          </div>
          <div>
            <span>对白占比</span>
            <strong>{percent(report.dialogueRatio)}</strong>
          </div>
          <div>
            <span>平均段长</span>
            <strong>{report.averageParagraphLength} 字</strong>
          </div>
          <div>
            <span>35 字以上长句</span>
            <strong>{percent(report.longSentenceRatio)}</strong>
          </div>
          <div>
            <span>段落数</span>
            <strong>{report.paragraphs}</strong>
          </div>
        </div>

        {report.issues.length > 0 ? (
          <section className="prose-quality-section">
            <h3>建议</h3>
            <div className="prose-quality-issues">
              {report.issues.map((issue) => (
                <article key={issue.title} className={`prose-quality-issue ${issue.level}`}>
                  <strong>{issue.title}</strong>
                  <p>{issue.detail}</p>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <p className="prose-quality-ok">没有发现明显问题。这个检查只覆盖局部语言指标，不评价剧情好坏。</p>
        )}

        <div className="prose-quality-lists">
          <section>
            <h3>抽象情绪</h3>
            {report.abstractEmotion.length ? (
              <p>{report.abstractEmotion.map((item) => `${item.word}×${item.count}`).join('、')}</p>
            ) : (
              <small>未命中</small>
            )}
          </section>
          <section>
            <h3>过滤词</h3>
            {report.filterWords.length ? (
              <p>{report.filterWords.map((item) => `${item.word}×${item.count}`).join('、')}</p>
            ) : (
              <small>未命中</small>
            )}
          </section>
          <section>
            <h3>重复分句</h3>
            {report.repeatedClauses.length ? (
              <p>{report.repeatedClauses.map((item) => `${item.text}×${item.count}`).join('；')}</p>
            ) : (
              <small>未命中</small>
            )}
          </section>
        </div>
      </div>
    </Modal>
  )
}
