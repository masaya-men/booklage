'use client'

/**
 * R3F-driven FLIP open animation for the lightbox.
 *
 * The "real-deal" version of the card-to-center transition: instead of
 * just CSS transforms, this renders the card's thumbnail as a textured
 * plane in a WebGL scene, with a vertex shader that bends/stretches the
 * geometry as it travels from card position to viewport center, plus a
 * fragment shader that adds a subtle chromatic aberration smear during
 * transit. The effect costs ~250 KB of additional JS bundle (three +
 * @react-three/fiber), which we offset by lazy-loading the module on
 * idle so the first paint of the page is unaffected.
 *
 * This scene is rendered as a transient overlay during the open
 * animation only — once the tween completes, onComplete fires, the
 * scene unmounts, and the actual Lightbox content is revealed.
 */

import { useEffect, useMemo, useRef, type ReactElement } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

export type LightboxFlipSceneProps = {
  /** Source card's screen rect (viewport coordinates) at click time. */
  readonly originRect: DOMRect
  /** Lightbox content's destination rect (viewport coordinates). */
  readonly targetRect: DOMRect
  /** Image URL that the source card was rendering — drawn as the texture
   *  on the morphing plane. Falls back to the thumbnail field for any
   *  bookmark type, since v44 ensures every embed has a thumbnail
   *  during the FLIP. */
  readonly thumbnail: string
  /** Fired once the scene completes its animation; the Lightbox uses
   *  this signal to fade in the actual content and unmount the scene. */
  readonly onComplete: () => void
}

const VERTEX_SHADER = /* glsl */ `
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Squash-and-stretch envelope: peaks at the middle of the tween,
    // returns to flat at the end. sin(πt) is 0 → 1 → 0 over t∈[0,1].
    float bendT = sin(uProgress * 3.14159265);

    // Z-axis bend: vertices get pushed forward at the centre of the
    // plane and pulled back at the edges. Reads as a "page lifting" or
    // "card peeling" mid-flight, settling flat as it lands.
    pos.z += sin(pos.x * 3.14159265) * 0.18 * bendT;

    // X-axis stretch: temporarily widens the plane during transit, like
    // squash-and-stretch in classic animation. Magnitude is gentle (6%).
    pos.x *= 1.0 + bendT * 0.06;

    // Y-axis micro-compression for the equal-and-opposite effect.
    pos.y *= 1.0 - bendT * 0.04;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uProgress;
  varying vec2 vUv;

  void main() {
    // Chromatic aberration that fades out as the tween completes — the
    // RGB channels are sampled at offset UVs, giving the colour-fringe
    // smear of fast-moving footage. Strength scales with (1 - progress)
    // so the final landed image is perfectly aligned.
    float aberration = (1.0 - uProgress) * 0.008;
    vec4 r = texture2D(uTexture, vUv + vec2(aberration, 0.0));
    vec4 g = texture2D(uTexture, vUv);
    vec4 b = texture2D(uTexture, vUv - vec2(aberration, 0.0));
    gl_FragColor = vec4(r.r, g.g, b.b, g.a);
  }
`

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

const DURATION_S = 0.7

function FlipMesh({
  originRect,
  targetRect,
  thumbnail,
  onComplete,
}: LightboxFlipSceneProps): ReactElement {
  const meshRef = useRef<THREE.Mesh>(null)
  const matRef = useRef<THREE.ShaderMaterial>(null)
  const startedAtRef = useRef<number>(0)
  const completedRef = useRef<boolean>(false)

  // Texture is loaded once per thumbnail URL. crossOrigin = 'anonymous'
  // is required for cross-origin CDN images (YouTube, Twitter syndication
  // proxy) to be sampleable in WebGL — without it the GPU treats them as
  // tainted and emits a black/transparent texture.
  const texture = useMemo(() => {
    const loader = new THREE.TextureLoader()
    loader.crossOrigin = 'anonymous'
    const t = loader.load(thumbnail)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [thumbnail])

  // Dispose the texture on unmount so successive lightbox opens don't
  // leak GPU memory. Three.js keeps a reference until explicitly freed.
  useEffect(() => {
    return (): void => { texture.dispose() }
  }, [texture])

  useFrame((state) => {
    const mesh = meshRef.current
    const mat = matRef.current
    if (!mesh || !mat) return

    if (startedAtRef.current === 0) {
      startedAtRef.current = state.clock.elapsedTime
    }
    const elapsed = state.clock.elapsedTime - startedAtRef.current
    const t = Math.min(1, elapsed / DURATION_S)
    const eased = easeOutCubic(t)

    // Convert viewport-pixel rects to world coordinates. Our ortho
    // camera (zoom 1, frustum auto-sized to canvas) places (0, 0) at
    // the centre of the canvas with +Y going up. Screen Y goes DOWN,
    // so we negate the Y delta from canvas centre.
    const W = state.size.width
    const H = state.size.height
    const oCx = originRect.left + originRect.width / 2
    const oCy = originRect.top + originRect.height / 2
    const tCx = targetRect.left + targetRect.width / 2
    const tCy = targetRect.top + targetRect.height / 2

    const cxPx = lerp(oCx, tCx, eased)
    const cyPx = lerp(oCy, tCy, eased)
    const wPx = lerp(originRect.width, targetRect.width, eased)
    const hPx = lerp(originRect.height, targetRect.height, eased)

    mesh.position.set(cxPx - W / 2, -(cyPx - H / 2), 0)
    mesh.scale.set(wPx, hPx, 1)
    mat.uniforms.uProgress.value = t

    if (t >= 1 && !completedRef.current) {
      completedRef.current = true
      // Defer to next frame so the final paint at progress=1 lands
      // before the parent unmounts the scene.
      requestAnimationFrame(() => onComplete())
    }
  })

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[1, 1, 32, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={{
          uTexture: { value: texture },
          uProgress: { value: 0 },
        }}
        transparent
      />
    </mesh>
  )
}

export default function LightboxFlipScene(props: LightboxFlipSceneProps): ReactElement {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 350,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <Canvas
        orthographic
        // Default ortho camera at zoom 1 maps 1 world unit to 1 pixel,
        // with the visible frustum matching the canvas dimensions.
        camera={{ position: [0, 0, 10], near: -100, far: 100, zoom: 1 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        // Disable R3F's default frameloop:'always' until something
        // requests a frame. We use 'always' here because useFrame must
        // run every frame for the duration of the tween.
        frameloop="always"
      >
        <FlipMesh {...props} />
      </Canvas>
    </div>
  )
}
