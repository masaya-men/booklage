# 3D 球体ナビゲーション archive ノート（2026-04-19）

> B0 では接続を外す。B3 で theme-registry の `direction: 'sphere'` として再接続する。
> 既存 master には opt-in で入っている（toggle 経由） — B0 削除でこの opt-in 経路は完全撤去される。

---

## 既存実装（master 到達済み）

- **ライブラリ**: Three.js + CSS3DRenderer デュアル描画
- **球面投影**: カード ID → 経緯度 → 3D 座標変換（`lib/sphere/sphere-projection.ts`）
- **慣性**: rotation 減衰 + zoom (`lib/sphere/sphere-interaction.ts`)
- **viewport culling**: (`lib/sphere/sphere-culling.ts`) — 裏側 dot 表示は未実装
- **ポストプロセス**: bloom 等（`lib/sphere/post-processing.ts`）
- **物理ガラスシェーダー**: IOR, chromatic aberration, fresnel (`lib/sphere/glass-shader.ts` — 球体には未接続)
- **エントリ**: `components/board/SphereCanvas.tsx` + `SphereModeToggle.tsx`

---

## glass-shader.ts の effective な値（uniforms 初期値）

| uniform | 値 | 意味 |
|---------|------|------|
| `uIor` | `1.15` | 屈折率 (低め＝歪み小) |
| `uChromaticAberration` | `0.03` | RGB ずらし幅（プリズム効果） |
| `uFresnelPower` | `3.0` | 視線角による反射強度カーブ |
| `uDistortionStrength` | `0.15` | 背景の歪み倍率 |
| reflected mix | `0.3` | 反射色の合成比 |
| reflected color | `vec3(1,1,1)*0.1` | ほぼ透明の反射トーン |

※ vertex は worldPosition / worldNormal を varying で出して、fragment で `refract()` → 3 チャンネルずらし → `texture2D(uSceneTexture, ...)` で背景サンプリング。

---

## 既知の残課題（`docs/TODO.md` 3D 球体セクションから引用）

1. 実際のパン操作で裏側のカードが戻ってくるか未検証
2. 球面が大きすぎてカードが小さく遠い — camera distance / scale のバランス未調整
3. WebGL キャンバスに謎の白丸アーティファクト（bloom or glow 起因と推測）
4. 裏側 dot LOD 表示は未実装（WebGL points で描画する予定だった）
5. ガラスシェーダーは球体に適用されていない（glass-shader.ts は作ったが未接続）

---

## B3 再接続時の方針

1. `lib/board/theme-registry.ts` に `direction: 'sphere'` のテーマを追加
   - 例: `{ id: 'cosmos-sphere', direction: 'sphere', backgroundClassName: ..., layoutParams: {...} }`
2. `InteractionLayer` に sphere 分岐を実装（rotation = drag, zoom = wheel）
3. `CardsLayer` を projection.ts 経由で 3D 座標に変換する分岐を追加 — または SphereCardsLayer 別コンポーネントとして分離
4. 既知残課題（特に camera distance と白丸アーティファクト）を spec 化して解決してから master へ
5. glass-shader.ts は「カードの輝き」ではなく「球体の表面素材」として適用する設計を先に決める
6. B0 の 6 層アーキテクチャを壊さないよう、sphere 専用レンダリングは ThemeLayer + CardsLayer 2 層のみに吸収する

---

## 関連ファイル（archive 前リスト — B0 削除対象）

- `lib/sphere/glass-shader.ts`
- `lib/sphere/post-processing.ts`
- `lib/sphere/sphere-culling.ts`
- `lib/sphere/sphere-interaction.ts`
- `lib/sphere/sphere-projection.ts`
- `lib/sphere/sphere-renderer.ts`
- `lib/sphere/use-sphere-canvas.ts`
- `lib/sphere/__tests__/` (テスト一式)
- `components/board/SphereCanvas.tsx` + `SphereCanvas.module.css`
- `components/board/SphereModeToggle.tsx`

再実装時は git 履歴から `887ef03` 時点のこれらを参照できる。
