'use client'

import { useCallback, useRef, useState } from 'react'
import type { ImportSource, ParseResult } from '@/lib/import/types'
import { parseBrowserBookmarks } from '@/lib/import/parse-browser-bookmarks'
import { parseYoutubeTakeout } from '@/lib/import/parse-youtube-takeout'
import { parseTiktokData } from '@/lib/import/parse-tiktok-data'
import { parseRedditExport } from '@/lib/import/parse-reddit-export'
import { parseTwitterExport } from '@/lib/import/parse-twitter-export'
import { parseInstagramExport } from '@/lib/import/parse-instagram-export'
import { parseUrlList } from '@/lib/import/parse-url-list'
import styles from './FileUploader.module.css'

/** Accepted file extensions per source */
const ACCEPT_MAP: Record<Exclude<ImportSource, 'url-list'>, string> = {
  browser: '.html,.htm',
  youtube: '.csv',
  tiktok: '.json',
  reddit: '.csv',
  twitter: '.csv,.json,.txt',
  instagram: '.csv,.json,.txt',
}

/** Export guide steps per platform */
const GUIDE_MAP: Record<ImportSource, string[]> = {
  browser: [
    '\u30D6\u30E9\u30A6\u30B6\u306E\u8A2D\u5B9A\u3092\u958B\u304F',
    '\u300C\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF\u300D\u2192\u300C\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u300D',
    '\u4FDD\u5B58\u3055\u308C\u305FHTML\u30D5\u30A1\u30A4\u30EB\u3092\u3053\u3053\u306B\u30C9\u30ED\u30C3\u30D7',
  ],
  youtube: [
    'Google Takeout\uFF08takeout.google.com\uFF09\u3092\u958B\u304F',
    'YouTube \u2192 \u300C\u5C65\u6B74\u300D\u307E\u305F\u306F\u300C\u518D\u751F\u30EA\u30B9\u30C8\u300D\u3092\u9078\u629E',
    '\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u3057\u305FCSV\u30D5\u30A1\u30A4\u30EB\u3092\u3053\u3053\u306B\u30C9\u30ED\u30C3\u30D7',
  ],
  tiktok: [
    'TikTok\u30A2\u30D7\u30EA\u306E\u8A2D\u5B9A \u2192 \u300C\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC\u300D',
    '\u300C\u30C7\u30FC\u30BF\u306E\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u30EA\u30AF\u30A8\u30B9\u30C8\u300D',
    '\u53D7\u3051\u53D6\u3063\u305FJSON\u30D5\u30A1\u30A4\u30EB\u3092\u3053\u3053\u306B\u30C9\u30ED\u30C3\u30D7',
  ],
  reddit: [
    'reddit.com/settings/data-request \u3092\u958B\u304F',
    'GDPR\u30C7\u30FC\u30BF\u30EA\u30AF\u30A8\u30B9\u30C8\u3092\u9001\u4FE1',
    '\u53D7\u3051\u53D6\u3063\u305FCSV\u30D5\u30A1\u30A4\u30EB\u3092\u3053\u3053\u306B\u30C9\u30ED\u30C3\u30D7',
  ],
  twitter: [
    'twitter.com/settings/download_data \u3092\u958B\u304F',
    '\u300C\u30C7\u30FC\u30BF\u306E\u30A2\u30FC\u30AB\u30A4\u30D6\u3092\u30EA\u30AF\u30A8\u30B9\u30C8\u300D',
    '\u53D7\u3051\u53D6\u3063\u305FCSV/JSON\u30D5\u30A1\u30A4\u30EB\u3092\u3053\u3053\u306B\u30C9\u30ED\u30C3\u30D7',
  ],
  instagram: [
    'instagram.com \u306E\u8A2D\u5B9A \u2192 \u300C\u30D7\u30E9\u30A4\u30D0\u30B7\u30FC\u3068\u30BB\u30AD\u30E5\u30EA\u30C6\u30A3\u300D',
    '\u300C\u30C7\u30FC\u30BF\u306E\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u300D\u3092\u30EA\u30AF\u30A8\u30B9\u30C8',
    '\u53D7\u3051\u53D6\u3063\u305FCSV/JSON\u30D5\u30A1\u30A4\u30EB\u3092\u3053\u3053\u306B\u30C9\u30ED\u30C3\u30D7',
  ],
  'url-list': [],
}

/** Format file size for display */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Props for FileUploader */
type FileUploaderProps = {
  /** Selected import source */
  source: ImportSource
  /** Called after successful file parsing */
  onParsed: (result: ParseResult) => void
  /** Called when user wants to go back to source selection */
  onBack: () => void
}

/**
 * Step 2: File upload via drag & drop, file picker, or URL list textarea.
 * Reads the file content, calls the appropriate parser, and passes the result up.
 */
export function FileUploader({ source, onParsed, onBack: _onBack }: FileUploaderProps): React.ReactElement {
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [urlText, setUrlText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /** Parse file content with the appropriate parser */
  const parseFileContent = useCallback(
    (content: string, fileName: string): void => {
      setError(null)
      setIsParsing(true)
      try {
        let result: ParseResult
        switch (source) {
          case 'browser':
            result = parseBrowserBookmarks(content)
            break
          case 'youtube':
            result = parseYoutubeTakeout(content, fileName)
            break
          case 'tiktok':
            result = parseTiktokData(content)
            break
          case 'reddit':
            result = parseRedditExport(content)
            break
          case 'twitter':
            result = parseTwitterExport(content)
            break
          case 'instagram':
            result = parseInstagramExport(content)
            break
          default:
            result = { bookmarks: [], errors: ['\u4E0D\u660E\u306A\u30BD\u30FC\u30B9'] }
        }
        if (result.bookmarks.length === 0 && result.errors.length === 0) {
          setError('\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30D5\u30A1\u30A4\u30EB\u5F62\u5F0F\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002')
          return
        }
        onParsed(result)
      } catch {
        setError('\u30D5\u30A1\u30A4\u30EB\u306E\u8AAD\u307F\u53D6\u308A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u30D5\u30A1\u30A4\u30EB\u5F62\u5F0F\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002')
      } finally {
        setIsParsing(false)
      }
    },
    [source, onParsed],
  )

  /** Read a file and parse its content */
  const handleFile = useCallback(
    (file: File): void => {
      setSelectedFile(file)
      setError(null)
      const reader = new FileReader()
      reader.onload = (): void => {
        const content = reader.result as string
        parseFileContent(content, file.name)
      }
      reader.onerror = (): void => {
        setError('\u30D5\u30A1\u30A4\u30EB\u306E\u8AAD\u307F\u53D6\u308A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002')
      }
      reader.readAsText(file)
    },
    [parseFileContent],
  )

  /** Handle drag events */
  const handleDragOver = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  /** Handle file input change */
  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  /** Handle URL list parsing */
  const handleParseUrlList = useCallback((): void => {
    if (!urlText.trim()) return
    setError(null)
    setIsParsing(true)
    try {
      const result = parseUrlList(urlText)
      if (result.bookmarks.length === 0) {
        setError('URL\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u30021\u884C\u306B1\u3064\u305AURL\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002')
        return
      }
      onParsed(result)
    } catch {
      setError('\u89E3\u6790\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002')
    } finally {
      setIsParsing(false)
    }
  }, [urlText, onParsed])

  /** Remove selected file */
  const handleRemoveFile = useCallback((): void => {
    setSelectedFile(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const guideSteps = GUIDE_MAP[source]

  // ── URL list mode ──
  if (source === 'url-list') {
    return (
      <div className={styles.container}>
        <div className={styles.textareaContainer}>
          <label className={styles.textareaLabel}>
            {'URL\u3092\u8CBC\u308A\u4ED8\u3051\u3066\u304F\u3060\u3055\u3044\uFF081\u884C\u306B1URL\uFF09'}
          </label>
          <textarea
            className={styles.textarea}
            value={urlText}
            onChange={(e) => setUrlText(e.target.value)}
            placeholder={'https://example.com\nhttps://twitter.com/user/status/123\nhttps://youtube.com/watch?v=abc'}
            spellCheck={false}
          />
          <button
            className={styles.parseButton}
            onClick={handleParseUrlList}
            disabled={!urlText.trim() || isParsing}
            type="button"
          >
            {isParsing ? '\u89E3\u6790\u4E2D...' : '\u89E3\u6790\u3059\u308B'}
          </button>
        </div>
        {error && <div className={styles.error}>{error}</div>}
      </div>
    )
  }

  // ── File upload mode ──
  const accept = ACCEPT_MAP[source]

  return (
    <div className={styles.container}>
      {/* Selected file display */}
      {selectedFile ? (
        <div className={styles.selectedFile}>
          <span className={styles.selectedFileName}>{selectedFile.name}</span>
          <span className={styles.selectedFileSize}>{formatFileSize(selectedFile.size)}</span>
          <button
            className={styles.removeFile}
            onClick={handleRemoveFile}
            type="button"
            title={'\u30D5\u30A1\u30A4\u30EB\u3092\u524A\u9664'}
          >
            {'\u2715'}
          </button>
        </div>
      ) : (
        /* Drop zone */
        <div
          className={isDragOver ? styles.dropZoneActive : styles.dropZone}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click()
          }}
        >
          <span className={styles.dropIcon}>{'\u{1F4C1}'}</span>
          <span className={styles.dropText}>
            {'\u30D5\u30A1\u30A4\u30EB\u3092\u30C9\u30E9\u30C3\u30B0\uFF06\u30C9\u30ED\u30C3\u30D7'}
          </span>
          <button className={styles.browseButton} type="button">
            {'\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E'}
          </button>
          <span className={styles.dropAccept}>
            {'\u5BFE\u5FDC\u5F62\u5F0F: '}{accept}
          </span>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileInputChange}
        className={styles.hiddenInput}
      />

      {error && <div className={styles.error}>{error}</div>}

      {/* Export guide accordion */}
      {guideSteps.length > 0 && (
        <div className={styles.guideAccordion}>
          <button
            className={styles.guideToggle}
            onClick={() => setGuideOpen(!guideOpen)}
            type="button"
          >
            <span>{'\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u65B9\u6CD5'}</span>
            <span className={guideOpen ? styles.guideArrowOpen : styles.guideArrow}>
              {'\u25BC'}
            </span>
          </button>
          {guideOpen && (
            <div className={styles.guideContent}>
              <div className={styles.guideSteps}>
                {guideSteps.map((step, i) => (
                  <div key={i} className={styles.guideStep}>
                    <span className={styles.guideStepNumber}>{i + 1}</span>
                    <span>{step}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
