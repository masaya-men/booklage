import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { TopHeader } from './TopHeader'

describe('TopHeader', () => {
  it('renders nav / actions slots in order', () => {
    const { getByTestId, container } = render(
      <TopHeader
        nav={<span data-testid="slot-nav">N</span>}
        actions={<span data-testid="slot-actions">A</span>}
      />,
    )
    expect(getByTestId('board-top-header')).toBeTruthy()
    expect(getByTestId('slot-nav')).toBeTruthy()
    expect(getByTestId('slot-actions')).toBeTruthy()

    const groups = container.querySelectorAll('[data-group]')
    expect(groups).toHaveLength(2)
    expect((groups[0] as HTMLElement).dataset.group).toBe('nav')
    expect((groups[1] as HTMLElement).dataset.group).toBe('actions')
  })

  it('accepts null in any slot without crashing', () => {
    const { getByTestId } = render(
      <TopHeader nav={null} actions={null} />,
    )
    expect(getByTestId('board-top-header')).toBeTruthy()
  })
})
