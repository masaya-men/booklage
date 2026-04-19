# Liquid Glass 実装ノート（2026-04-19 archive）

> 現行 SVG filter 方式は B0 で削除。次回実装時は kube.io 方式（feDisplacementMap + pre-rendered map, α=255）で完全透明を目指す。
> 参考: `docs/private/IDEAS.md`（非公開） 「kube.io」節

---

## 現行実装（2026-04-16 時点で master 到達）で確認できた値

### displacement-map 生成 (`lib/glass/displacement-map.ts`)

- **技術**: kube.io 方式の pre-rendered displacement map。Canvas 2D で 1 回生成、キャッシュ。`feTurbulence` は未使用（これ自体は正しい方針）
- **物理モデル**: 凸スクァクル (squircle) 形状の表面法線 → Snell の法則 → ピクセル毎変位
- **GLASS_REFRACTIVE_INDEX**: `1.5`
- **STRENGTH_SCALE (最大変位 px)**: `subtle=12`, `medium=24`, `strong=40`
- **bezelWidth**: `最小辺 × 0.15`（ガラスが曲がる帯の幅）
- **glassProfile**: `(1 - (1-x)^4)^(1/4)` 凸スクァクル
- **spec 合成**: fresnel 風 (`pow(1-cos, 3)` * 0.7 + dot * 0.3), 最大 α = `spec * 0.55`
- **displacement map の α**: `data[pixelIdx+3] = 255` 固定 — 既に α=255 維持している

### fallback backdrop-filter (`lib/glass/use-liquid-glass.ts`)

- `subtle`: `blur(4px) saturate(120%)`
- `medium`: `blur(6px) saturate(130%)`
- `strong`: `blur(10px) saturate(140%)`

### CardStyleWrapper.module.css `.glass`

- border-radius: `var(--radius-lg)`
- border: `1px solid rgba(255,255,255,0.1)` (dark) / `rgba(0,0,0,0.08)` (light)
- 子要素 backdrop-filter: `blur(6px) saturate(120%)`
- 子要素 background: `rgba(255,255,255,0.02)` (dark) / `rgba(255,255,255,0.04)` (light)

### mouse-reactive deformation (`use-liquid-glass.ts`)

- 4コーナーそれぞれマウス近接度で border-radius を最大 `base + 0.5*base`（min 4px）まで膨張
- GSAP `elastic.out(1, 0.4)` duration `0.6s` — コーナー変形
- hover scale: `1.005` (elastic.out(1, 0.5), 0.4s)
- leave restore: elastic.out(1, 0.3), 0.8s
- `deformation` default: medium/strong は true, subtle (cards) は false

---

## 「黒ずみ問題」の原因推定

- **症状**: ガラス越しに見える背景が本来より暗くなる
- **現行実装では displacement map の α は 255 固定**（`data[pixelIdx+3] = 255`）— つまり「α 起因」は否定
- **より可能性の高い推定原因**:
  1. `backdrop-filter` の fallback チェーン（`blur(Npx) saturate(...)` ）の saturate が色味を落とす
  2. Specular overlay の α=0.55 maxが、暗い背景下で黒みを足している可能性
  3. `<feColorMatrix>` 等を LiquidGlassProvider 側で噛ませていれば、そこでトーンが落ちる可能性（未調査）
  4. 複数ガラス重なり時の multiply 合成

---

## B1 再実装時のチェックリスト

1. `docs/private/IDEAS.md`（非公開） の「kube.io」節を再読
2. 現行 `displacement-map.ts` は既にほぼ kube 方式。捨てずに基礎として流用可
3. 黒ずみ原因調査: まず LiquidGlassProvider の SVG filter チェーン全体を Inspect（feColorMatrix / feComposite の alpha channel）
4. α=255 維持は既に OK — displacement map 経由の黒ずみではない
5. `backdrop-filter` の saturate 値を 100% に戻してみて黒ずみが消えるか確認
6. specular overlay の最大 α を 0.3 まで下げて差分計測
7. Chrome 以外は半透明グラデへフォールバック（feature detection は `LiquidGlassProvider` に既存）
8. アニメーションは scale 変更のみ（shape/size は map 再ビルドで重い） — elastic.out は現行踏襲 OK
9. カード装飾として復活させる際は、B0 の `CardNode` の children として差し込む設計に寄せる（装飾レイヤー分離）

---

## 関連ファイル（archive 前リスト）

- `lib/glass/LiquidGlassProvider.tsx` — SVG filter コンテナと feature detection
- `lib/glass/displacement-map.ts` — Canvas 2D で displacement + specular 生成
- `lib/glass/use-liquid-glass.ts` — React hook, GSAP deformation, ResizeObserver
- `components/board/card-styles/CardStyleWrapper.tsx` + `.module.css` — 4 カードスタイル (glass/polaroid/newspaper/magnet)
