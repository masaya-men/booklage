type AppLayoutProps = {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps): React.ReactElement {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {children}
    </div>
  )
}
