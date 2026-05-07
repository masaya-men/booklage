import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CardCornerActions } from './CardCornerActions'

describe('CardCornerActions', () => {
  it('always renders the delete (×) button', () => {
    const { getByTestId } = render(
      <CardCornerActions
        hovered={false}
        hasCustomWidth={false}
        onDelete={() => {}}
        onResetSize={() => {}}
      />,
    )
    expect(getByTestId('card-delete-button')).toBeTruthy()
  })

  it('does NOT render the reset (↺) button when card has no custom width', () => {
    const { queryByTestId } = render(
      <CardCornerActions
        hovered={true}
        hasCustomWidth={false}
        onDelete={() => {}}
        onResetSize={() => {}}
      />,
    )
    expect(queryByTestId('card-reset-size-button')).toBeNull()
  })

  it('renders the reset (↺) button only when hasCustomWidth is true', () => {
    const { getByTestId } = render(
      <CardCornerActions
        hovered={true}
        hasCustomWidth={true}
        onDelete={() => {}}
        onResetSize={() => {}}
      />,
    )
    expect(getByTestId('card-reset-size-button')).toBeTruthy()
  })

  it('fires onDelete when × is clicked', () => {
    const onDelete = vi.fn()
    const { getByTestId } = render(
      <CardCornerActions
        hovered={true}
        hasCustomWidth={false}
        onDelete={onDelete}
        onResetSize={() => {}}
      />,
    )
    fireEvent.click(getByTestId('card-delete-button'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('fires onResetSize when ↺ is clicked', () => {
    const onResetSize = vi.fn()
    const { getByTestId } = render(
      <CardCornerActions
        hovered={true}
        hasCustomWidth={true}
        onDelete={() => {}}
        onResetSize={onResetSize}
      />,
    )
    fireEvent.click(getByTestId('card-reset-size-button'))
    expect(onResetSize).toHaveBeenCalledOnce()
  })

  it('stops pointerdown propagation so the card-parent reorder drag does not engage', () => {
    const parentDown = vi.fn()
    const onDelete = vi.fn()
    const { getByTestId } = render(
      <div onPointerDown={parentDown}>
        <CardCornerActions
          hovered={true}
          hasCustomWidth={true}
          onDelete={onDelete}
          onResetSize={() => {}}
        />
      </div>,
    )
    fireEvent.pointerDown(getByTestId('card-delete-button'), { button: 0, pointerId: 1 })
    expect(parentDown).not.toHaveBeenCalled()
  })

  it('exposes data-visible attribute that mirrors the hovered prop', () => {
    const { getByTestId, rerender } = render(
      <CardCornerActions
        hovered={false}
        hasCustomWidth={true}
        onDelete={() => {}}
        onResetSize={() => {}}
      />,
    )
    expect(getByTestId('card-delete-button').getAttribute('data-visible')).toBe('false')
    rerender(
      <CardCornerActions
        hovered={true}
        hasCustomWidth={true}
        onDelete={() => {}}
        onResetSize={() => {}}
      />,
    )
    expect(getByTestId('card-delete-button').getAttribute('data-visible')).toBe('true')
    expect(getByTestId('card-reset-size-button').getAttribute('data-visible')).toBe('true')
  })
})
