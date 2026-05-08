import type { ReactNode } from 'react'

export default function SaveIframeLayout({ children }: { children: ReactNode }): React.ReactElement {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `html, body { background: transparent; margin: 0; padding: 0; overflow: hidden; min-height: 0 !important; }`,
        }}
      />
      {children}
    </>
  )
}
