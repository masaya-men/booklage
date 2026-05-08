import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PipCard } from './PipCard'

describe('PipCard', () => {
  it('renders a thumbnail image when image prop is provided', () => {
    render(<PipCard id="bm1" thumbnail="https://example.com/og.png" favicon="" title="t" />)
    const card = screen.getByTestId('pip-card-bm1')
    const img = card.querySelector('img[data-role="thumbnail"]')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('https://example.com/og.png')
  })

  it('renders favicon-only fallback when thumbnail is empty', () => {
    render(<PipCard id="bm2" thumbnail="" favicon="https://example.com/favicon.ico" title="t" />)
    const card = screen.getByTestId('pip-card-bm2')
    expect(card.querySelector('img[data-role="thumbnail"]')).toBeNull()
    const fav = card.querySelector('img[data-role="favicon-fallback"]')
    expect(fav).toBeTruthy()
    expect(fav?.getAttribute('src')).toBe('https://example.com/favicon.ico')
  })

  it('renders generic placeholder when both thumbnail and favicon are empty', () => {
    render(<PipCard id="bm3" thumbnail="" favicon="" title="t" />)
    const card = screen.getByTestId('pip-card-bm3')
    expect(card.querySelector('img')).toBeNull()
    expect(card.querySelector('[data-role="generic-placeholder"]')).toBeTruthy()
  })
})
