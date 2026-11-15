import { Modal } from './Modal'

interface SupportModalProps {
  onClose: () => void
  onDelete: () => void
}

export function SupportModal({ onClose, onDelete }: SupportModalProps) {
  const remove = () => {
    if (
      !window.confirm(
        '永久删除主页的「支持」入口？\n\n删除后不会在应用里再显示；如果以后想恢复，需要清理本地设置或重新安装。',
      )
    ) {
      return
    }
    onDelete()
    onClose()
  }

  return (
    <Modal
      title="支持说戏"
      subtitle="如果这个工具帮到了你，可以请作者喝杯茶。"
      size="md"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          关闭
        </button>
      }
    >
      <div className="support-modal">
        <p className="support-lead">
          说戏是本地优先的独立项目。你的支持会用于继续维护长篇稳定性、写作质量和桌面端发布。
        </p>
        <div className="support-qr-grid">
          <figure>
            <img src="/support/wechat.webp" alt="微信收款二维码" />
            <figcaption>微信</figcaption>
          </figure>
          <figure>
            <img src="/support/alipay.jpg" alt="支付宝收款二维码" />
            <figcaption>支付宝</figcaption>
          </figure>
        </div>
        <p className="support-note">
          请确认收款码属于你正在支持的项目。打赏不附带任何功能解锁、内容承诺或退款义务。
        </p>
        <div className="support-delete-row">
          <button type="button" className="btn btn-danger-ghost btn-sm" onClick={remove}>
            删除支持入口
          </button>
          <small>删除后永久不再显示；不会删除作品或设置。</small>
        </div>
      </div>
    </Modal>
  )
}
