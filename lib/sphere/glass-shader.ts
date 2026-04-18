import * as THREE from 'three'

/**
 * 物理ベース屈折ガラスシェーダー
 *
 * 参考: Maxime Heckel の refraction shader
 * - 透明度最優先: ガラスの色はほぼゼロ
 * - 大きな屈折歪み: 背景がぐにゃっと歪む
 * - フレネル反射: 見る角度で反射率が変わる
 * - 色収差: RGBがわずかにズレてプリズム効果
 */

export const glassVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

export const glassFragmentShader = /* glsl */ `
  uniform sampler2D uSceneTexture;
  uniform vec2 uResolution;
  uniform float uIor;
  uniform float uChromaticAberration;
  uniform float uFresnelPower;
  uniform float uDistortionStrength;
  uniform vec3 uCameraPosition;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  float fresnel(vec3 viewDir, vec3 normal, float power) {
    return pow(1.0 - max(dot(viewDir, normal), 0.0), power);
  }

  vec2 getRefractedUv(vec3 viewDir, vec3 normal, float ior, vec2 screenUv) {
    vec3 refracted = refract(viewDir, normal, 1.0 / ior);
    vec2 offset = refracted.xy * uDistortionStrength;
    return screenUv + offset;
  }

  void main() {
    vec2 screenUv = gl_FragCoord.xy / uResolution;
    vec3 viewDir = normalize(vWorldPosition - uCameraPosition);
    vec3 normal = normalize(vWorldNormal);

    float iorR = uIor - uChromaticAberration;
    float iorG = uIor;
    float iorB = uIor + uChromaticAberration;

    vec2 uvR = getRefractedUv(viewDir, normal, iorR, screenUv);
    vec2 uvG = getRefractedUv(viewDir, normal, iorG, screenUv);
    vec2 uvB = getRefractedUv(viewDir, normal, iorB, screenUv);

    float r = texture2D(uSceneTexture, uvR).r;
    float g = texture2D(uSceneTexture, uvG).g;
    float b = texture2D(uSceneTexture, uvB).b;

    vec3 refractedColor = vec3(r, g, b);

    float fresnelFactor = fresnel(-viewDir, normal, uFresnelPower);
    vec3 reflectedColor = vec3(1.0, 1.0, 1.0) * 0.1;

    vec3 finalColor = mix(refractedColor, reflectedColor, fresnelFactor * 0.3);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`

/** ガラスマテリアルを生成 */
export function createGlassMaterial(
  sceneTexture: THREE.Texture,
  resolution: THREE.Vector2,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: glassVertexShader,
    fragmentShader: glassFragmentShader,
    uniforms: {
      uSceneTexture: { value: sceneTexture },
      uResolution: { value: resolution },
      uIor: { value: 1.15 },
      uChromaticAberration: { value: 0.03 },
      uFresnelPower: { value: 3.0 },
      uDistortionStrength: { value: 0.15 },
      uCameraPosition: { value: new THREE.Vector3() },
    },
    transparent: true,
    side: THREE.FrontSide,
  })
}

/** ガラスシェーダーのuniformsを更新 */
export function updateGlassUniforms(
  material: THREE.ShaderMaterial,
  camera: THREE.Camera,
  resolution: THREE.Vector2,
): void {
  material.uniforms.uCameraPosition.value.copy(camera.position)
  material.uniforms.uResolution.value.copy(resolution)
}
