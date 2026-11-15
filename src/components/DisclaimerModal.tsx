import { Modal } from './Modal'

interface DisclaimerModalProps {
  onClose: () => void
}

export function DisclaimerModal({ onClose }: DisclaimerModalProps) {
  return (
    <Modal
      title="免责声明"
      subtitle="使用说戏前请阅读"
      size="md"
      onClose={onClose}
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          我知道了
        </button>
      }
    >
      <div className="disclaimer-content">
        <p>
          说戏仅提供本地写作与 AI 辅助工具，不主动生成、发布或传播任何内容。软件本身不判断你的题材、
          设定和剧情是否适合发布。
        </p>
        <p>
          你应自行确保输入、生成、导出和传播的内容符合所在地法律法规、平台规范和第三方权利。
          不得利用本软件制作、传播违法、侵权、虚假、淫秽、暴力、歧视或危害他人的内容。
        </p>
        <p>
          AI 输出可能不准确、不完整或包含与设定冲突的内容，请在发布前自行审核。因使用本软件产生的
          内容、决策和后果由使用者自行承担。
        </p>
        <p>
          作品、设定和 API Key 默认保存在本机；请自行做好备份，并妥善保管模型服务商账号和密钥。
        </p>
      </div>
    </Modal>
  )
}
