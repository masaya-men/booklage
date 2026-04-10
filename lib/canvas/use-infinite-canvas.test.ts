import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { screenToWorld, worldToScreen, clampZoom, useInfiniteCanvas } from './use-infinite-canvas'
import {
  CANVAS_ZOOM_MIN,
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_DEFAULT,
} from '@/lib/constants'

describe('screenToWorld', () => {
  it('converts screen coords to world coords at zoom 1, no pan', () => {
    const result = screenToWorld(100, 200, 0, 0, 1)
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('accounts for pan offset', () => {
    const result = screenToWorld(100, 200, 50, 30, 1)
    expect(result).toEqual({ x: 50, y: 170 })
  })

  it('accounts for zoom', () => {
    const result = screenToWorld(200, 400, 0, 0, 2)
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('accounts for both pan and zoom', () => {
    const result = screenToWorld(200, 400, 100, 50, 2)
    expect(result).toEqual({ x: 50, y: 175 })
  })
})

describe('worldToScreen', () => {
  it('converts world coords to screen coords at zoom 1, no pan', () => {
    const result = worldToScreen(100, 200, 0, 0, 1)
    expect(result).toEqual({ x: 100, y: 200 })
  })

  it('is the inverse of screenToWorld', () => {
    const panX = 60
    const panY = 40
    const zoom = 1.5
    const world = screenToWorld(300, 250, panX, panY, zoom)
    const screen = worldToScreen(world.x, world.y, panX, panY, zoom)
    expect(screen.x).toBeCloseTo(300)
    expect(screen.y).toBeCloseTo(250)
  })
})

describe('clampZoom', () => {
  it('returns value within range', () => {
    expect(clampZoom(1.5)).toBe(1.5)
  })

  it('clamps to minimum', () => {
    expect(clampZoom(0.01)).toBe(CANVAS_ZOOM_MIN)
  })

  it('clamps to maximum', () => {
    expect(clampZoom(10)).toBe(CANVAS_ZOOM_MAX)
  })

  it('handles default zoom', () => {
    expect(clampZoom(CANVAS_ZOOM_DEFAULT)).toBe(CANVAS_ZOOM_DEFAULT)
  })
})

describe('useInfiniteCanvas', () => {
  it('initializes with default state', () => {
    const { result } = renderHook(() => useInfiniteCanvas())
    expect(result.current.state.panX).toBe(0)
    expect(result.current.state.panY).toBe(0)
    expect(result.current.state.zoom).toBe(CANVAS_ZOOM_DEFAULT)
  })

  it('zoomAtPoint zooms toward cursor position', () => {
    const { result } = renderHook(() => useInfiniteCanvas())
    act(() => {
      result.current.zoomAtPoint(1.5, 200, 200)
    })
    expect(result.current.state.zoom).toBe(1.5)
    // Pan adjusts: panX = 200 - 200*1.5 = -100
    expect(result.current.state.panX).toBe(-100)
    expect(result.current.state.panY).toBe(-100)
  })

  it('pan updates offset', () => {
    const { result } = renderHook(() => useInfiniteCanvas())
    act(() => {
      result.current.pan(50, -30)
    })
    expect(result.current.state.panX).toBe(50)
    expect(result.current.state.panY).toBe(-30)
  })

  it('clamps zoom to allowed range', () => {
    const { result } = renderHook(() => useInfiniteCanvas())
    act(() => {
      result.current.zoomAtPoint(999, 0, 0)
    })
    expect(result.current.state.zoom).toBe(CANVAS_ZOOM_MAX)
  })

  it('resetView returns to defaults', () => {
    const { result } = renderHook(() => useInfiniteCanvas())
    act(() => {
      result.current.pan(100, 200)
      result.current.zoomAtPoint(2, 0, 0)
    })
    act(() => {
      result.current.resetView()
    })
    expect(result.current.state.panX).toBe(0)
    expect(result.current.state.panY).toBe(0)
    expect(result.current.state.zoom).toBe(CANVAS_ZOOM_DEFAULT)
  })
})
