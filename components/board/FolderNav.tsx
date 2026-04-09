'use client'

import { useRef, useState } from 'react'
import type { FolderRecord } from '@/lib/storage/indexeddb'
import styles from './FolderNav.module.css'

/** Props for the FolderNav component */
type FolderNavProps = {
  /** All available folders */
  folders: FolderRecord[]
  /** Currently selected folder ID (null when none selected) */
  currentFolderId: string | null
  /** Called when a folder is clicked */
  onSelectFolder: (folder: FolderRecord) => void
  /** Called when a new folder is created via the inline input */
  onAddFolder: (name: string, color: string) => void
}

/**
 * Glassmorphism folder navigation panel fixed to the left side.
 *
 * - Displays folder list with colored dots.
 * - Highlights the active folder.
 * - Provides an inline input to create new folders.
 */
export function FolderNav({
  folders,
  currentFolderId,
  onSelectFolder,
  onAddFolder,
}: FolderNavProps): React.ReactElement {
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  /** Submit the new folder name */
  const handleSubmit = (): void => {
    const trimmed = newName.trim()
    if (trimmed.length > 0) {
      onAddFolder(trimmed, '') // color handled by parent
    }
    setNewName('')
    setIsAdding(false)
  }

  /** Handle Enter key in the input */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'Escape') {
      setNewName('')
      setIsAdding(false)
    }
  }

  return (
    <nav className={styles.panel}>
      {folders.map((folder) => {
        const isActive = folder.id === currentFolderId
        return (
          <button
            key={folder.id}
            className={isActive ? styles.folderButtonActive : styles.folderButton}
            onClick={() => onSelectFolder(folder)}
            type="button"
          >
            <span
              className={styles.colorDot}
              style={{ backgroundColor: folder.color }}
            />
            <span className={styles.folderName}>{folder.name}</span>
          </button>
        )
      })}

      {isAdding ? (
        <input
          ref={inputRef}
          className={styles.newFolderInput}
          type="text"
          placeholder="フォルダ名を入力..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSubmit}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />
      ) : (
        <button
          className={styles.addButton}
          onClick={() => setIsAdding(true)}
          type="button"
        >
          <span className={styles.addIcon}>+</span>
          新しいフォルダ
        </button>
      )}
    </nav>
  )
}
