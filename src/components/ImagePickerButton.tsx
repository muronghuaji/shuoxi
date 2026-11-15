import { useRef, useState } from 'react'

interface ImagePickerButtonProps {
  label: string
  title?: string
  className?: string
  disabled?: boolean
  onPick: (file: File) => Promise<void> | void
  onError?: (message: string) => void
}

export function ImagePickerButton({
  label,
  title,
  className = 'btn btn-ghost btn-sm',
  disabled,
  onPick,
  onError,
}: ImagePickerButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button
        type="button"
        className={className}
        title={title}
        disabled={disabled || busy}
        onClick={(event) => {
          event.stopPropagation()
          inputRef.current?.click()
        }}
      >
        {busy ? '处理中…' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        hidden
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          event.stopPropagation()
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          setBusy(true)
          Promise.resolve(onPick(file))
            .catch((error: unknown) => {
              onError?.(error instanceof Error ? error.message : '图片处理失败')
            })
            .finally(() => setBusy(false))
        }}
      />
    </>
  )
}
