import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PipStack } from './PipStack'

const cards = [
  { id: '1', title: 'Card 1', thumbnail: '', favicon: '' },
  { id: '2', title: 'Card 2', thumbnail: '', favicon: '' },
  { id: '3', title: 'Card 3', thumbnail: '', favicon: '' },
]

describe('PipStack', () => {
  it('renders up to 5 cards in stack order (latest first)', () => {
    render(<PipStack cards={cards} onCardClick={() => {}} />)
    const stack = screen.getByTestId('pip-stack')
    const items = stack.querySelectorAll('[data-card-id]')
    expect(items).toHaveLength(3)
    expect(items[0].getAttribute('data-card-id')).toBe('1')
  })

  it('caps at 5 cards even when more provided', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i}`, title: `t${i}`, thumbnail: '', favicon: '',
    }))
    render(<PipStack cards={many} onCardClick={() => {}} />)
    expect(screen.getByTestId('pip-stack').querySelectorAll('[data-card-id]')).toHaveLength(5)
  })

  it('calls onCardClick with cardId when a card is clicked', () => {
    const onCardClick = vi.fn()
    render(<PipStack cards={cards} onCardClick={onCardClick} />)
    fireEvent.click(screen.getByTestId('pip-card-2'))
    expect(onCardClick).toHaveBeenCalledWith('2')
  })

  it('applies hover state to the hovered card', () => {
    render(<PipStack cards={cards} onCardClick={() => {}} />)
    const card2 = screen.getByTestId('pip-card-2')
    fireEvent.mouseEnter(card2)
    expect(screen.getByTestId('pip-stack').getAttribute('data-hovered-id')).toBe('2')
  })
})
