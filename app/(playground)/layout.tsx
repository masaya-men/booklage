import type { Metadata } from 'next'
import type { ReactElement, ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Playground · Booklage',
  robots: { index: false, follow: false },
}

export default function PlaygroundLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return <>{children}</>
}
