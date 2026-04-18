'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import type { RefCallback } from 'react'
import { createSphereRenderer, type SphereRenderer, type CardPlacement } from './sphere-renderer'
import { applyRotation, wrapUv, calculateInertia } from './sphere-interaction'
import { getVisibleCards, type SphereCard, type VisibleSphereCard } from './sphere-culling'

export interface SphereCanvasControls {
  containerRef: RefCallback<HTMLElement>
  cameraU: number
  cameraV: number
  zoom: number
  visibleCards: VisibleSphereCard[]
  placeCard: (placement: CardPlacement) => void
  removeCard: (id: string) => void
  updateRadius: (cardCount: number) => void
  isRotating: boolean
}

export function useSphereCanvas(
  cards: ReadonlyArray<SphereCard>,
): SphereCanvasControls {
  const rendererRef = useRef<SphereRenderer | null>(null)
  const containerElRef = useRef<HTMLElement | null>(null)
  const animFrameRef = useRef<number>(0)

  const [cameraU, setCameraU] = useState(0.5)
  const [cameraV, setCameraV] = useState(0.5)
  const [zoom, setZoom] = useState(1.0)
  const [isRotating, setIsRotating] = useState(false)
  const [visibleCards, setVisibleCards] = useState<VisibleSphereCard[]>([])

  const isDraggingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const dragHistoryRef = useRef<Array<{ u: number; v: number; time: number }>>([])
  const cameraRef = useRef({ u: 0.5, v: 0.5 })
  const zoomRef = useRef(1.0)

  useEffect(() => {
    const visible = getVisibleCards(cards, cameraU, cameraV, zoom)
    setVisibleCards(visible)
  }, [cards, cameraU, cameraV, zoom])

  useEffect(() => {
    let inertiaU = 0
    let inertiaV = 0
    const FRICTION = 0.95

    function animate(): void {
      animFrameRef.current = requestAnimationFrame(animate)

      if (!isDraggingRef.current && (Math.abs(inertiaU) > 0.00001 || Math.abs(inertiaV) > 0.00001)) {
        const wrapped = wrapUv(cameraRef.current.u + inertiaU * 16, cameraRef.current.v + inertiaV * 16)
        cameraRef.current = wrapped
        setCameraU(wrapped.u)
        setCameraV(wrapped.v)
        rendererRef.current?.setCameraDirection(wrapped.u, wrapped.v)
        inertiaU *= FRICTION
        inertiaV *= FRICTION
        setIsRotating(true)
      } else if (!isDraggingRef.current) {
        setIsRotating(false)
      }

      rendererRef.current?.render()
    }

    animate()

    const el = containerElRef.current
    if (!el) {
      return () => cancelAnimationFrame(animFrameRef.current)
    }

    const handlePointerDown = (e: PointerEvent): void => {
      if (e.button === 0 || e.button === 1) {
        isDraggingRef.current = true
        lastPointerRef.current = { x: e.clientX, y: e.clientY }
        dragHistoryRef.current = [{ u: cameraRef.current.u, v: cameraRef.current.v, time: performance.now() }]
        inertiaU = 0
        inertiaV = 0
        setIsRotating(true)
        el.setPointerCapture(e.pointerId)
      }
    }

    const handlePointerMove = (e: PointerEvent): void => {
      if (!isDraggingRef.current || !rendererRef.current) return
      const dx = e.clientX - lastPointerRef.current.x
      const dy = e.clientY - lastPointerRef.current.y
      lastPointerRef.current = { x: e.clientX, y: e.clientY }

      const result = applyRotation(
        cameraRef.current.u,
        cameraRef.current.v,
        dx, dy,
        rendererRef.current.getRadius(),
        zoomRef.current,
      )
      cameraRef.current = result
      setCameraU(result.u)
      setCameraV(result.v)
      rendererRef.current.setCameraDirection(result.u, result.v)

      dragHistoryRef.current.push({ u: result.u, v: result.v, time: performance.now() })
      if (dragHistoryRef.current.length > 5) dragHistoryRef.current.shift()
    }

    const handlePointerUp = (): void => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false

      const vel = calculateInertia(dragHistoryRef.current)
      inertiaU = vel.du
      inertiaV = vel.dv
    }

    const handleWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.max(0.1, Math.min(3.0, zoomRef.current * delta))
      zoomRef.current = newZoom
      setZoom(newZoom)
      rendererRef.current?.setZoom(newZoom)
    }

    el.addEventListener('pointerdown', handlePointerDown)
    el.addEventListener('pointermove', handlePointerMove)
    el.addEventListener('pointerup', handlePointerUp)
    el.addEventListener('pointercancel', handlePointerUp)
    el.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      el.removeEventListener('pointerdown', handlePointerDown)
      el.removeEventListener('pointermove', handlePointerMove)
      el.removeEventListener('pointerup', handlePointerUp)
      el.removeEventListener('pointercancel', handlePointerUp)
      el.removeEventListener('wheel', handleWheel)
    }
  }, [])

  const containerRef = useCallback<RefCallback<HTMLElement>>((el) => {
    if (rendererRef.current) {
      rendererRef.current.dispose()
      rendererRef.current = null
    }

    if (!el) {
      containerElRef.current = null
      return
    }

    containerElRef.current = el
    const rect = el.getBoundingClientRect()
    rendererRef.current = createSphereRenderer({
      container: el,
      width: rect.width,
      height: rect.height,
      cardCount: cards.length,
    })
  }, [cards.length])

  const placeCard = useCallback((placement: CardPlacement) => {
    rendererRef.current?.placeCard(placement)
  }, [])

  const removeCard = useCallback((id: string) => {
    rendererRef.current?.removeCard(id)
  }, [])

  const updateRadius = useCallback((cardCount: number) => {
    rendererRef.current?.updateRadius(cardCount)
  }, [])

  useEffect(() => {
    const handleResize = (): void => {
      const el = containerElRef.current
      if (!el || !rendererRef.current) return
      const rect = el.getBoundingClientRect()
      rendererRef.current.resize(rect.width, rect.height)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    containerRef,
    cameraU,
    cameraV,
    zoom,
    visibleCards,
    placeCard,
    removeCard,
    updateRadius,
    isRotating,
  }
}
