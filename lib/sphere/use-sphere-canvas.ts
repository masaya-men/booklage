'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import type { RefCallback } from 'react'
import { createSphereRenderer, type SphereRenderer } from './sphere-renderer'
import { applyRotation, wrapUv, calculateInertia } from './sphere-interaction'
import { getVisibleCards, type SphereCard, type VisibleSphereCard } from './sphere-culling'

export interface SphereCanvasControls {
  containerRef: RefCallback<HTMLElement>
  cameraU: number
  cameraV: number
  zoom: number
  /** Visible cards with LOD info (hidden cards excluded). */
  visibleCards: VisibleSphereCard[]
  /** DOM wrapper per card id — use createPortal to render content. Keys == card ids. */
  portalTargets: Map<string, HTMLElement>
  isRotating: boolean
}

/**
 * Manages the 3D sphere scene and keeps DOM wrappers for each card in sync
 * with the CSS3DRenderer. Consumers render React content into the wrappers
 * via createPortal (same pattern as the 2D canvas).
 */
export function useSphereCanvas(
  cards: ReadonlyArray<SphereCard>,
): SphereCanvasControls {
  const rendererRef = useRef<SphereRenderer | null>(null)
  const containerElRef = useRef<HTMLElement | null>(null)
  const animFrameRef = useRef<number>(0)
  /** card id -> wrapper DOM element (lives in CSS3DRenderer's scene) */
  const wrappersRef = useRef<Map<string, HTMLElement>>(new Map())

  const [cameraU, setCameraU] = useState(0.5)
  const [cameraV, setCameraV] = useState(0.5)
  const [zoom, setZoom] = useState(1.0)
  const [isRotating, setIsRotating] = useState(false)
  const [visibleCards, setVisibleCards] = useState<VisibleSphereCard[]>([])
  const [portalTargets, setPortalTargets] = useState<Map<string, HTMLElement>>(new Map())

  const isDraggingRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const dragHistoryRef = useRef<Array<{ u: number; v: number; time: number }>>([])
  const cameraRef = useRef({ u: 0.5, v: 0.5 })
  const zoomRef = useRef(1.0)

  // ── Sync card wrappers with the 3D scene on every cards change ─────
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return

    const currentIds = new Set(cards.map(c => c.id))

    // Remove stale wrappers
    wrappersRef.current.forEach((el, id) => {
      if (!currentIds.has(id)) {
        renderer.removeCard(id)
        wrappersRef.current.delete(id)
      }
    })

    // Add new wrappers + reposition existing ones
    cards.forEach(card => {
      const existing = wrappersRef.current.get(card.id)
      if (!existing) {
        const el = document.createElement('div')
        el.style.width = `${card.width}px`
        el.style.height = `${card.height}px`
        el.style.pointerEvents = 'auto'
        el.setAttribute('data-sphere-card', card.id)
        renderer.placeCard({ id: card.id, u: card.u, v: card.v, element: el })
        wrappersRef.current.set(card.id, el)
      } else {
        // Re-place existing wrapper if its sphere coords changed
        renderer.removeCard(card.id)
        renderer.placeCard({ id: card.id, u: card.u, v: card.v, element: existing })
      }
    })

    // Adjust sphere radius based on card count
    renderer.updateRadius(cards.length)

    // Publish new portal targets map
    const nextTargets = new Map<string, HTMLElement>()
    wrappersRef.current.forEach((el, id) => nextTargets.set(id, el))
    setPortalTargets(nextTargets)
  }, [cards])

  // ── Culling: recompute visible cards when camera/zoom changes ──────
  useEffect(() => {
    const visible = getVisibleCards(cards, cameraU, cameraV, zoom)
    setVisibleCards(visible)
  }, [cards, cameraU, cameraV, zoom])

  // ── Sync wrapper visibility/opacity with LOD results ───────────────
  useEffect(() => {
    const visibleIds = new Set(visibleCards.map(v => v.id))
    const opacityById = new Map(visibleCards.map(v => [v.id, v.opacity]))
    wrappersRef.current.forEach((el, id) => {
      if (visibleIds.has(id)) {
        el.style.display = ''
        el.style.opacity = String(opacityById.get(id) ?? 1)
      } else {
        // Hide hidden/dot-LOD wrappers so they don't eat pointer events offscreen
        el.style.display = 'none'
      }
    })
  }, [visibleCards])

  // ── Animation loop + pointer/wheel handlers ────────────────────────
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
    if (!el) return () => cancelAnimationFrame(animFrameRef.current)

    const handlePointerDown = (e: PointerEvent): void => {
      // Only start panning on empty space (not on a card wrapper)
      const targetEl = e.target as HTMLElement
      const isOnCard = targetEl.closest('[data-sphere-card]') !== null
      if (isOnCard) return
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
      wrappersRef.current.clear()
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

    // Initial placement of all cards now that renderer is ready
    cards.forEach(card => {
      const wrapper = document.createElement('div')
      wrapper.style.width = `${card.width}px`
      wrapper.style.height = `${card.height}px`
      wrapper.style.pointerEvents = 'auto'
      wrapper.setAttribute('data-sphere-card', card.id)
      rendererRef.current!.placeCard({ id: card.id, u: card.u, v: card.v, element: wrapper })
      wrappersRef.current.set(card.id, wrapper)
    })
    const nextTargets = new Map<string, HTMLElement>()
    wrappersRef.current.forEach((el2, id) => nextTargets.set(id, el2))
    setPortalTargets(nextTargets)
  }, [cards])

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
    portalTargets,
    isRotating,
  }
}
