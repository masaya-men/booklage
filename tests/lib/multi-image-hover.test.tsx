import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ImageCard } from '@/components/board/cards/ImageCard'
import type { BoardItem } from '@/lib/storage/use-board-data'

const baseItem: BoardItem = {
  bookmarkId: 'b1',
  cardId: 'c1',
  title: 'Test',
  description: '',
  thumbnail: 'https://example.com/0.jpg',
  url: 'https://x.com/u/status/1',
  aspectRatio: 1,
  gridIndex: 0,
  orderIndex: 0,
  cardWidth: 240,
  customCardWidth: false,
  isRead: false,
  isDeleted: false,
  tags: [],
  displayMode: null,
  photos: [
    'https://example.com/0.jpg',
    'https://example.com/1.jpg',
    'https://example.com/2.jpg',
    'https://example.com/3.jpg',
  ],
}

describe('ImageCard — multi-image hover swap', () => {
  it('shows photos[0] initially', () => {
    render(<ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />)
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/0.jpg')
  })

  it('swaps to photos[N-1] when pointerX is at the right edge', () => {
    const { container } = render(
      <ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    // pointerX = 235 → ratio = 235/240 ≈ 0.98 → floor(0.98 * 4) = 3
    fireEvent.pointerMove(card, { clientX: 235, clientY: 100 })
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/3.jpg')
  })

  it('swaps to photos[1] at ~30% across', () => {
    const { container } = render(
      <ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerMove(card, { clientX: 72, clientY: 100 })
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/1.jpg')
  })

  it('reverts to photos[0] on pointer leave', () => {
    const { container } = render(
      <ImageCard item={baseItem} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)

    fireEvent.pointerMove(card, { clientX: 200, clientY: 100 })
    let img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).not.toBe('https://example.com/0.jpg')

    fireEvent.pointerLeave(card)
    img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/0.jpg')
  })

  it('does NOT swap for single-photo items', () => {
    const single: BoardItem = { ...baseItem, photos: ['https://example.com/only.jpg'], thumbnail: 'https://example.com/only.jpg' }
    const { container } = render(
      <ImageCard item={single} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)
    fireEvent.pointerMove(card, { clientX: 200, clientY: 100 })
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/only.jpg')
  })

  it('does NOT swap when photos is undefined', () => {
    const noPhotos: BoardItem = { ...baseItem, photos: undefined }
    const { container } = render(
      <ImageCard item={noPhotos} displayMode="visual" cardWidth={240} cardHeight={240} />,
    )
    const card = container.firstChild as HTMLElement
    card.getBoundingClientRect = (): DOMRect => ({
      left: 0, top: 0, right: 240, bottom: 240,
      width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect)
    fireEvent.pointerMove(card, { clientX: 200, clientY: 100 })
    const img = screen.getByRole('img', { hidden: true })
    expect(img.getAttribute('src')).toBe('https://example.com/0.jpg')
  })
})
