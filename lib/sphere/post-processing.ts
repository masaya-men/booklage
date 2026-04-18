import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'

/**
 * ポストプロセスパイプライン
 * - ブルーム: 光源やガラスの反射が柔らかく光る
 * - ビネット: 画面端が少し暗くなり没入感アップ
 *
 * DOFはパフォーマンスを見て後から追加可能（LODのblurで代替）
 */

const vignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uIntensity: { value: 0.4 },
    uSmoothness: { value: 0.5 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uSmoothness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float dist = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.5, 0.5 - uSmoothness, dist);
      color.rgb *= mix(1.0 - uIntensity, 1.0, vignette);
      gl_FragColor = color;
    }
  `,
}

export interface PostProcessingPipeline {
  composer: EffectComposer
  bloomPass: UnrealBloomPass
  vignettePass: ShaderPass
  resize: (width: number, height: number) => void
  dispose: () => void
}

export function createPostProcessing(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostProcessingPipeline {
  const composer = new EffectComposer(renderer)

  const renderPass = new RenderPass(scene, camera)
  composer.addPass(renderPass)

  const size = renderer.getSize(new THREE.Vector2())
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.3,
    0.6,
    0.8,
  )
  composer.addPass(bloomPass)

  const vignettePass = new ShaderPass(vignetteShader)
  composer.addPass(vignettePass)

  return {
    composer,
    bloomPass,
    vignettePass,
    resize(width: number, height: number): void {
      composer.setSize(width, height)
      bloomPass.resolution.set(width, height)
    },
    dispose(): void {
      composer.dispose()
    },
  }
}
