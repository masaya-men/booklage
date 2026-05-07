import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { WaveformTrack } from './WaveformTrack'

describe('WaveformTrack', () => {
  it('renders the requested number of bars', () => {
    const { container } = render(<WaveformTrack barCount={20} progress={0.5} />)
    const bars = container.querySelectorAll('[data-bar]')
    expect(bars).toHaveLength(20)
  })

  it('marks bars at-or-before progress as active', () => {
    const { container } = render(<WaveformTrack barCount={10} progress={0.5} />)
    const bars = Array.from(container.querySelectorAll('[data-bar]')) as HTMLElement[]
    expect(bars[0].dataset.active).toBe('true')
    expect(bars[4].dataset.active).toBe('true')
    expect(bars[5].dataset.active).toBe('false')
    expect(bars[9].dataset.active).toBe('false')
  })
})
