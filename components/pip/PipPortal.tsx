'use client'

import { createPortal } from 'react-dom'
import type { ReactElement, ReactNode } from 'react'

export interface PipPortalProps {
  readonly pipWindow: Window | null
  readonly children: ReactNode
}

export function PipPortal({ pipWindow, children }: PipPortalProps): ReactElement | null {
  if (!pipWindow || pipWindow.closed) return null
  return createPortal(children, pipWindow.document.body)
}
