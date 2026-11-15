import { countWords } from '../utils'
import { Modal } from './Modal'

interface ProsePolishModalProps {
  before: string
  after: string
  polishing: boolean
  onApply: () => void
  onClose: () => void
}

export function ProsePolishModal({
  before,
  after,
  polishing,
  onApply,
  onClose,
}: ProsePolishModalProps) {
  return (
    <Modal
      title="文笔精修"
      subtitle="只改文笔，不改剧情；应用前会自动创建快照"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {polishing ? '取消精修' : '取消'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onApply}
            disabled={polishing || !after.trim()}
          >
            应用精修稿
          </button>
        </>
      }
    >
      {polishing ? (
        <div className="prose-polish-loading">
          <span className="typing-cursor" />
          正在精修文笔，保留剧情和人物状态… 可以点「取消精修」立即退出。
        </div>
      ) : (
        <div className="prose-polish-grid">
          <section>
            <div className="prose-polish-head">
              <strong>原文</strong>
              <small>{countWords(before)} 字</small>
            </div>
            <div className="prose-polish-text">{before}</div>
          </section>
          <section>
            <div className="prose-polish-head">
              <strong>精修后</strong>
              <small>{countWords(after)} 字</small>
            </div>
            <div className="prose-polish-text polished">{after}</div>
          </section>
        </div>
      )}
    </Modal>
  )
}
