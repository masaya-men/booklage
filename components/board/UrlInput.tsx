'use client'

import { useState, useCallback } from 'react'
import { isValidUrl } from '@/lib/utils/url'
import styles from './UrlInput.module.css'

/** Props for the UrlInput component */
type UrlInputProps = {
  /** Called when the user submits a valid URL */
  onSubmit: (url: string) => void
  /** Whether the input should be disabled (e.g. while saving) */
  disabled?: boolean
}

/**
 * Fixed pill-shaped URL input bar with glassmorphism styling.
 * Validates the URL before allowing submission.
 */
export function UrlInput({ onSubmit, disabled = false }: UrlInputProps): React.ReactElement {
  const [value, setValue] = useState('')
  const isValid = isValidUrl(value.trim())

  const handleSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      const trimmed = value.trim()
      if (!isValidUrl(trimmed)) return
      onSubmit(trimmed)
      setValue('')
    },
    [value, onSubmit],
  )

  return (
    <form className={styles.wrapper} onSubmit={handleSubmit}>
      <input
        className={styles.input}
        type="url"
        placeholder="URLを貼り付けて保存..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />
      <button
        className={styles.submitBtn}
        type="submit"
        disabled={disabled || !isValid}
      >
        保存
      </button>
    </form>
  )
}
