'use client'

/**
 * DraggableCard — simple positioned wrapper.
 * GSAP Draggable is managed by board-client.tsx (not here)
 * because React component useEffect lifecycle breaks GSAP.
 */
type DraggableCardProps = {
  children: React.ReactNode
  cardId: string
  x: number
  y: number
  draggable?: boolean
}

export function DraggableCard({
  children,
  cardId,
  x,
  y,
  draggable = true,
}: DraggableCardProps): React.ReactElement {
  return (
    <div
      data-card-wrapper={cardId}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        cursor: draggable ? 'grab' : 'default',
      }}
    >
      {children}
    </div>
  )
}
