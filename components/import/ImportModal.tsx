'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import type { IDBPDatabase } from 'idb'
import { useLiquidGlass } from '@/lib/glass/use-liquid-glass'
import { Z_INDEX } from '@/lib/constants'
import type { ImportSource, ImportedBookmark, ParseResult, FolderAssignment } from '@/lib/import/types'
import { executeImport, type ImportProgress as ImportProgressData } from '@/lib/import/batch-import'
import { SourceSelector } from './SourceSelector'
import { FileUploader } from './FileUploader'
import { ImportPreview } from './ImportPreview'
import { ImportProgress } from './ImportProgress'
import styles from './ImportModal.module.css'

type Step = 'source' | 'upload' | 'preview' | 'progress'

/** Step index for indicator dots */
const STEP_ORDER: Step[] = ['source', 'upload', 'preview']

/** Header title per step */
const STEP_TITLES: Record<Step, string> = {
  source: '\u30A4\u30F3\u30DD\u30FC\u30C8',
  upload: '\u30D5\u30A1\u30A4\u30EB\u9078\u629E',
  preview: '\u30D7\u30EC\u30D3\u30E5\u30FC',
  progress: '\u30A4\u30F3\u30DD\u30FC\u30C8\u4E2D',
}

/** Props for ImportModal */
type ImportModalProps = {
  /** Whether the modal is open */
  isOpen: boolean
  /** Called to close the modal */
  onClose: () => void
  /** IndexedDB database instance */
  db: IDBPDatabase<unknown> | null
  /** Called after import completes successfully */
  onImportComplete: (savedCount: number) => void
}

/**
 * 3-step import modal: source selection -> file upload -> preview & execute.
 * Uses GSAP for open/close and step transition animations.
 * Applies liquid glass effect to the modal container.
 */
export function ImportModal({
  isOpen,
  onClose,
  db,
  onImportComplete,
}: ImportModalProps): React.ReactElement | null {
  const [step, setStep] = useState<Step>('source')
  const [source, setSource] = useState<ImportSource | null>(null)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [progress, setProgress] = useState<ImportProgressData>({
    phase: 'saving',
    completed: 0,
    total: 0,
  })
  const [savedCount, setSavedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const backdropRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const glass = useLiquidGlass({
    id: 'import-modal',
    strength: 'strong',
    borderRadius: 24,
    fixedSize: false,
  })

  // ── GSAP open/close animation ──
  useEffect(() => {
    if (!backdropRef.current || !modalRef.current) return

    if (isOpen) {
      gsap.to(backdropRef.current, {
        opacity: 1,
        duration: 0.3,
        ease: 'power2.out',
      })
      gsap.fromTo(
        modalRef.current,
        { opacity: 0, scale: 0.92, y: 20 },
        { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'back.out(1.4)', delay: 0.05 },
      )
    }
  }, [isOpen])

  /** Animate close then invoke onClose */
  const handleClose = useCallback((): void => {
    if (!backdropRef.current || !modalRef.current) {
      onClose()
      return
    }
    gsap.to(modalRef.current, {
      opacity: 0,
      scale: 0.92,
      y: 20,
      duration: 0.25,
      ease: 'power2.in',
    })
    gsap.to(backdropRef.current, {
      opacity: 0,
      duration: 0.25,
      ease: 'power2.in',
      onComplete: () => {
        // Reset state for next open
        setStep('source')
        setSource(null)
        setParseResult(null)
        setProgress({ phase: 'saving', completed: 0, total: 0 })
        setSavedCount(0)
        setSkippedCount(0)
        setIsComplete(false)
        onClose()
      },
    })
  }, [onClose])

  // ── Escape key ──
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, handleClose])

  // ── Step transition animation ──
  const animateStepTransition = useCallback(
    (direction: 'forward' | 'back', callback: () => void): void => {
      if (!bodyRef.current) {
        callback()
        return
      }
      const xOut = direction === 'forward' ? -40 : 40
      const xIn = direction === 'forward' ? 40 : -40
      gsap.to(bodyRef.current, {
        opacity: 0,
        x: xOut,
        duration: 0.15,
        ease: 'power2.in',
        onComplete: () => {
          callback()
          gsap.fromTo(
            bodyRef.current,
            { opacity: 0, x: xIn },
            { opacity: 1, x: 0, duration: 0.25, ease: 'power2.out' },
          )
        },
      })
    },
    [],
  )

  // ── Step handlers ──
  const handleSelectSource = useCallback(
    (selectedSource: ImportSource): void => {
      animateStepTransition('forward', () => {
        setSource(selectedSource)
        setStep('upload')
      })
    },
    [animateStepTransition],
  )

  const handleParsed = useCallback(
    (result: ParseResult): void => {
      animateStepTransition('forward', () => {
        setParseResult(result)
        setStep('preview')
      })
    },
    [animateStepTransition],
  )

  const handleExecute = useCallback(
    async (bookmarks: ImportedBookmark[], assignments: FolderAssignment[]): Promise<void> => {
      if (!db) return
      animateStepTransition('forward', () => {
        setStep('progress')
      })

      try {
        const result = await executeImport(
          db,
          bookmarks,
          assignments,
          (p) => setProgress(p),
        )
        setSavedCount(result.saved)
        setSkippedCount(result.skipped)
        setIsComplete(true)
        onImportComplete(result.saved)
      } catch {
        setIsComplete(true)
      }
    },
    [db, animateStepTransition, onImportComplete],
  )

  const handleBack = useCallback((): void => {
    animateStepTransition('back', () => {
      if (step === 'upload') {
        setStep('source')
        setSource(null)
      } else if (step === 'preview') {
        setStep('upload')
        setParseResult(null)
      }
    })
  }, [step, animateStepTransition])

  const handleProgressClose = useCallback((): void => {
    handleClose()
  }, [handleClose])

  if (!isOpen) return null

  const currentStepIndex = STEP_ORDER.indexOf(step)
  const showBack = step === 'upload' || step === 'preview'

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={styles.backdrop}
        style={{ zIndex: Z_INDEX.MODAL_BACKDROP }}
        onClick={handleClose}
        role="presentation"
      />

      {/* Modal */}
      <div
        ref={(el) => {
          modalRef.current = el
          glass.ref(el)
        }}
        className={`${styles.modal} ${glass.className}`}
        style={{ ...glass.style, zIndex: Z_INDEX.IMPORT_MODAL }}
        role="dialog"
        aria-modal="true"
        aria-label={'\u30A4\u30F3\u30DD\u30FC\u30C8'}
      >
        {/* Header */}
        <div className={styles.header}>
          {showBack ? (
            <button
              className={styles.backButton}
              onClick={handleBack}
              type="button"
              title={'\u623B\u308B'}
            >
              {'\u2190'}
            </button>
          ) : (
            <div style={{ width: 32 }} />
          )}
          <span className={styles.headerTitle}>{STEP_TITLES[step]}</span>
          <button
            className={styles.closeButton}
            onClick={handleClose}
            type="button"
            title={'\u9589\u3058\u308B'}
          >
            {'\u2715'}
          </button>
        </div>

        {/* Step indicator (hidden during progress) */}
        {step !== 'progress' && (
          <div className={styles.stepIndicator}>
            {STEP_ORDER.map((s, i) => (
              <Fragment key={s}>
                {i > 0 && <div className={styles.stepLine} />}
                <div
                  className={
                    i < currentStepIndex
                      ? styles.stepDotCompleted
                      : i === currentStepIndex
                        ? styles.stepDotActive
                        : styles.stepDot
                  }
                />
              </Fragment>
            ))}
          </div>
        )}

        {/* Body */}
        <div ref={bodyRef} className={styles.body}>
          <div className={styles.stepContainer}>
            {step === 'source' && <SourceSelector onSelect={handleSelectSource} />}
            {step === 'upload' && source && (
              <FileUploader source={source} onParsed={handleParsed} onBack={handleBack} />
            )}
            {step === 'preview' && parseResult && db && (
              <ImportPreview
                parseResult={parseResult}
                db={db}
                onExecute={handleExecute}
                onBack={handleBack}
              />
            )}
            {step === 'progress' && (
              <ImportProgress
                progress={progress}
                savedCount={savedCount}
                skippedCount={skippedCount}
                isComplete={isComplete}
                onClose={handleProgressClose}
              />
            )}
          </div>
        </div>
      </div>
    </>
  )
}
