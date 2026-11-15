import type { Chapter } from '../types'
import { Modal } from './Modal'

interface PersonalAddressReviewProps {
  chapters: Chapter[]
  onApply: (chapterId: string) => void
  onReject: (chapterId: string) => void
  onRestore: (chapterId: string) => void
  onClose: () => void
}

function addressIssues(chapter: Chapter): string[] {
  return (chapter.qualityIssues ?? []).filter(
    (issue) => issue.startsWith('称呼') || issue.startsWith('关系称呼'),
  )
}

export function PersonalAddressReview({
  chapters,
  onApply,
  onReject,
  onRestore,
  onClose,
}: PersonalAddressReviewProps) {
  const rows = chapters.filter(
    (chapter) =>
      (chapter.addressFixes?.length ?? 0) > 0 ||
      (chapter.addressSuggestions?.length ?? 0) > 0 ||
      addressIssues(chapter).length > 0,
  )

  return (
    <Modal
      title="称呼检查"
      subtitle="旁白称呼先给出修改建议；应用后可以恢复原文。对话中的称呼只提示，不自动改写。"
      onClose={onClose}
      size="lg"
      footer={
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          关闭
        </button>
      }
    >
      {rows.length === 0 ? (
        <p className="personal-details-empty">还没有称呼修改或待确认项。</p>
      ) : (
        <div className="personal-address-review">
          {rows.map((chapter, index) => {
            const chapterNumber =
              chapters.findIndex((item) => item.id === chapter.id) + 1 || index + 1
            return (
              <section key={chapter.id}>
                <strong>
                  第 {chapterNumber} 章 · {chapter.title}
                </strong>
                {chapter.addressSuggestions?.length ? (
                  <div>
                    <span>旁白称呼建议</span>
                    <ul>
                      {chapter.addressSuggestions.map((suggestion) => (
                        <li key={`${suggestion.from}-${suggestion.to}`}>
                          {suggestion.from} → {suggestion.to} ×{suggestion.count}
                        </li>
                      ))}
                    </ul>
                    <div className="personal-address-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => onApply(chapter.id)}
                      >
                        应用修改
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onReject(chapter.id)}
                      >
                        忽略
                      </button>
                    </div>
                  </div>
                ) : null}
                {chapter.addressFixes?.length ? (
                  <div>
                    <span>已应用旁白统一</span>
                    <ul>
                      {chapter.addressFixes.map((fix) => (
                        <li key={fix}>{fix}</li>
                      ))}
                    </ul>
                    <div className="personal-address-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => onRestore(chapter.id)}
                        disabled={!chapter.addressOriginalContent}
                      >
                        恢复原文
                      </button>
                    </div>
                  </div>
                ) : null}
                {addressIssues(chapter).length ? (
                  <div>
                    <span>待确认</span>
                    <ul>
                      {addressIssues(chapter).map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
