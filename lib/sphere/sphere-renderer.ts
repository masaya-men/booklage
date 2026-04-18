import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { uvToSphere, calculateSphereRadius } from './sphere-projection'
import { createPostProcessing } from './post-processing'

export interface SphereRendererConfig {
  container: HTMLElement
  width: number
  height: number
  cardCount: number
}

export interface CardPlacement {
  id: string
  u: number
  v: number
  element: HTMLElement
}

export interface SphereRenderer {
  setCameraDirection: (u: number, v: number) => void
  setZoom: (zoom: number) => void
  placeCard: (placement: CardPlacement) => CSS3DObject
  removeCard: (id: string) => void
  updateRadius: (cardCount: number) => void
  render: () => void
  resize: (width: number, height: number) => void
  dispose: () => void
  getRadius: () => number
  getCamera: () => THREE.PerspectiveCamera
}

export function createSphereRenderer(config: SphereRendererConfig): SphereRenderer {
  const { container, width, height, cardCount } = config

  let radius = calculateSphereRadius(cardCount)
  const cameraDistance = radius * 2.5

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(60, width / height, 1, radius * 10)
  camera.position.set(0, 0, cameraDistance)
  camera.lookAt(0, 0, 0)

  const webglRenderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  webglRenderer.setSize(width, height)
  webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  webglRenderer.domElement.style.position = 'absolute'
  webglRenderer.domElement.style.top = '0'
  webglRenderer.domElement.style.left = '0'
  webglRenderer.domElement.style.pointerEvents = 'none'
  container.appendChild(webglRenderer.domElement)

  const css3dRenderer = new CSS3DRenderer()
  css3dRenderer.setSize(width, height)
  css3dRenderer.domElement.style.position = 'absolute'
  css3dRenderer.domElement.style.top = '0'
  css3dRenderer.domElement.style.left = '0'
  container.appendChild(css3dRenderer.domElement)

  const glowGeometry = new THREE.SphereGeometry(radius * 1.02, 64, 64)
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    transparent: true,
    opacity: 0.03,
    side: THREE.BackSide,
  })
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial)
  scene.add(glowMesh)

  const postProcessing = createPostProcessing(webglRenderer, scene, camera)

  const dotGeometry = new THREE.BufferGeometry()
  const dotMaterial = new THREE.PointsMaterial({
    size: 4,
    vertexColors: true,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  })
  const dotPoints = new THREE.Points(dotGeometry, dotMaterial)
  scene.add(dotPoints)

  const css3dObjects = new Map<string, CSS3DObject>()

  let cameraU = 0.5
  let cameraV = 0.5

  function updateCameraPosition(): void {
    const target = uvToSphere(cameraU, cameraV, radius)
    const dir = new THREE.Vector3(target.x, target.y, target.z).normalize()
    camera.position.copy(dir.multiplyScalar(cameraDistance))
    camera.lookAt(0, 0, 0)
  }

  function setCameraDirection(u: number, v: number): void {
    cameraU = u
    cameraV = v
    updateCameraPosition()
  }

  function setZoom(zoom: number): void {
    camera.fov = 60 / zoom
    camera.updateProjectionMatrix()
  }

  function placeCard(placement: CardPlacement): CSS3DObject {
    const pos = uvToSphere(placement.u, placement.v, radius)
    const obj = new CSS3DObject(placement.element)
    obj.position.set(pos.x, pos.y, pos.z)

    const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const right = new THREE.Vector3().crossVectors(up, normal).normalize()
    const correctedUp = new THREE.Vector3().crossVectors(normal, right).normalize()
    const matrix = new THREE.Matrix4().makeBasis(right, correctedUp, normal)
    obj.quaternion.setFromRotationMatrix(matrix)

    obj.scale.set(0.5, 0.5, 0.5)

    css3dObjects.set(placement.id, obj)
    scene.add(obj)
    return obj
  }

  function removeCard(id: string): void {
    const obj = css3dObjects.get(id)
    if (obj) {
      scene.remove(obj)
      css3dObjects.delete(id)
    }
  }

  function updateRadius(newCardCount: number): void {
    radius = calculateSphereRadius(newCardCount)
    glowMesh.geometry.dispose()
    glowMesh.geometry = new THREE.SphereGeometry(radius * 1.02, 64, 64)
    updateCameraPosition()
  }

  function render(): void {
    postProcessing.composer.render()
    css3dRenderer.render(scene, camera)
  }

  function resize(w: number, h: number): void {
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    webglRenderer.setSize(w, h)
    css3dRenderer.setSize(w, h)
    postProcessing.resize(w, h)
  }

  function dispose(): void {
    postProcessing.dispose()
    webglRenderer.dispose()
    glowGeometry.dispose()
    glowMaterial.dispose()
    dotGeometry.dispose()
    dotMaterial.dispose()
    css3dObjects.clear()
    if (webglRenderer.domElement.parentElement === container) {
      container.removeChild(webglRenderer.domElement)
    }
    if (css3dRenderer.domElement.parentElement === container) {
      container.removeChild(css3dRenderer.domElement)
    }
  }

  // reference to avoid unused-variable warning; dotPoints hosts future back-side LOD points
  void dotPoints

  updateCameraPosition()

  return {
    setCameraDirection,
    setZoom,
    placeCard,
    removeCard,
    updateRadius,
    render,
    resize,
    dispose,
    getRadius: () => radius,
    getCamera: () => camera,
  }
}
