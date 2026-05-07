import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TopHeader } from './TopHeader'

describe('TopHeader', () => {
  it('renders nav / instrument / actions slots in order with dividers', () => {
    const { getByTestId, container } = render(
      <TopHeader
        nav={<span data-testid="slot-nav">N</span>}
        instrument={<span data-testid="slot-instrument">I</span>}
        actions={<span data-testid="slot-actions">A</span>}
      />,
    )
    expect(getByTestId('board-top-header')).toBeTruthy()
    expect(getByTestId('slot-nav')).toBeTruthy()
    expect(getByTestId('slot-instrument')).toBeTruthy()
    expect(getByTestId('slot-actions')).toBeTruthy()

    const groups = container.querySelectorAll('[data-group]')
    expect(groups).toHaveLength(3)
    expect((groups[0] as HTMLElement).dataset.group).toBe('nav')
    expect((groups[1] as HTMLElement).dataset.group).toBe('instrument')
    expect((groups[2] as HTMLElement).dataset.group).toBe('actions')
  })

  it('accepts null in any slot without crashing', () => {
    const { getByTestId } = render(
      <TopHeader nav={null} instrument={null} actions={null} />,
    )
    expect(getByTestId('board-top-header')).toBeTruthy()
  })
})
