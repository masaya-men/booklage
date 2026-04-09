import { APP_NAME } from '@/lib/constants'

export default function Home(): React.ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 'var(--space-4)',
      }}
    >
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-3xl)',
          fontWeight: 'var(--weight-bold)',
          background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary))',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {APP_NAME}
      </h1>
      <p
        style={{
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--text-lg)',
        }}
      >
        Bookmark × Collage
      </p>
    </div>
  )
}
