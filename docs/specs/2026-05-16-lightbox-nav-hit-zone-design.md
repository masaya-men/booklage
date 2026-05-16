# Lightbox ナビ矢印 + Hit Zone リデザイン

**作成日**: 2026-05-16 (セッション 33)
**ステータス**: design 確定、 実装待ち

## 背景

セッション 32 で navChevron は「常時表示 + クリック可能 + 控えめ円背景」 に落ち着いた。 が、 user 側で:

- 円形グレー背景がノイズに見える
- 矢印クリック可能領域が小さい (= 48×48 のみ) ため誤クリックが多い
- 媒体エリアや右テキストパネルの無効な空白部分の click が「何も起きない」 = 操作が伝わらない

## 決定

z-index レイヤー方式で 3 層構造。 数値 % で zone を切り分ける従来案は廃棄。

### Layer 1: 全面 close (最下層)

- viewport 全面で「click すれば閉じる」 zone
- 既存の `.backdrop` (z 100) + `.stage` (z 300、 pointer-events:none) ですでに大部分が実装済み
- 残課題: **`.frame` 内の text panel エリア無効部分** (= タイトル / description / メタの周囲空白) も click で閉じるよう変更
  - 解決: `.frame` 自体に `onClick={requestClose}` を付け、 子の interactive 要素は `stopPropagation`

### Layer 2: 機能要素 (中間層)

下記要素は Layer 1 の上、 個別に click を受け取る (= 周りの close 発火を吸収):

- 媒体 (動画 / 画像 / iframe) — `.media` に `onClick={e => e.stopPropagation()}`
- ✕ ボタン (close) — 既存通り、 click で close (= propagation 問題なし)
- 元ページボタン (source link) — `<a>` native、 `onClick={e => e.stopPropagation()}`
- dot インジケータ (`LightboxImageDots`) — 既存 onClick + `stopPropagation`
- スクロールメーター (`LightboxNavMeter`) — 既存 onClick + `stopPropagation`

### Layer 3: 左右ナビ (最前面)

- viewport の **左右 7vw** 幅、 縦は **0% ～ 100%** (= 上端から下端まで)
- 透明 / 視覚的に何も描画しない hit zone (= 開発時は debug border で確認)
- `onClick` で `nav.onNav(-1)` / `nav.onNav(1)` を呼ぶ
- z-index は `.frame` より上 → media や source link と被っても赤帯が先に hit を受ける
  - 注意: media の左右端は frame の中央寄りなので、 7vw の赤帯と物理的に被ることはない (= 1489 viewport で frame max-width 1240、 余白 124px = ~8.3vw、 7vw は余白内に収まる)
  - 注意 2: 普通画面 1280 では余白 38px (~3vw) しかないため、 7vw の赤帯は frame 内に少し食い込む。 これは「frame 外の方が click しやすい」 という意図でむしろ歓迎

### 矢印 (chevron) 自体

- 円形グレー背景 (= `background: rgba(255,255,255,0.10)`) を **削除**
- 通常時は SVG のみ表示 (= 14×14、 stroke=2、 現状サイズ / 形維持)
- **hover 時**: SVG が pulse 拡大縮小ループ (= scale 1.0 → 1.35 → 1.0、 900ms ease-in-out infinite)
- chevron 自体は装飾扱い (= pointer-events は赤帯 hot zone が受け取る)、 chevron の位置は赤帯内で縦中央

## 変更ファイル

1. `components/board/LightboxNavChevron.tsx`
   - 円背景削除、 hover 時 pulse animation 追加
   - hot zone wrapper を親で受ける構造に
2. `components/board/Lightbox.module.css`
   - `.navChevron` の `background` 削除、 `width/height` を装飾サイズに、 既存 `:hover scale(1.06)` を pulse keyframe に置換
   - 新規 `.navHotzone` クラス追加 (= 7vw 透明 hit zone、 chevron を縦中央に配置)
3. `components/board/Lightbox.tsx`
   - `.frame` に `onClick={requestClose}` 追加
   - `.media` / source link / `LightboxImageDots` / `LightboxNavMeter` の click handler に `stopPropagation` を確保
   - chevron を hot zone div で wrap、 chevron の onClick 削除 (hot zone 側で受け取る)

## エッジケース

- **共有 view (= read-only)**: nav 機能なし (`nav.total <= 1`) のとき hot zone を render しない (= 既存 `{nav && nav.total > 1 && ...}` ガードを継続)
- **モバイル**: 7vw は狭い画面では絶対値が小さい (= 360px 画面で ~25px)。 v8 で `clamp(60px, 7vw, 140px)` に
- **動画 controls との競合**: 動画は `.media` の中、 赤帯と横方向で被らない (= 動画は frame 内 left 寄り、 赤帯は viewport の左右両端)
- **frame 全面 close と source link**: source link の `onClick stopPropagation` で吸収、 native link 遷移は維持
- **chevron pulse loop と頻繁な repaint**: 矢印 SVG は 14×14、 hover のみ animation、 frame に containment あり → paint 負荷は無視可能

## 既存挙動への影響

- backdrop click 閉じる: 維持
- ✕ ボタン: 維持
- source link 遷移: 維持
- dot / メーター: 維持
- 媒体 (動画 controls / 画像) クリック: 維持 (= stopPropagation で frame の close 発火を防ぐ)

## やらないこと (= scope 外)

- 開閉アニメ自体の変更 (= Bug B 震えの「別の原因」 調査) → 別 task
- テキストカードのデザイン変更 → 残 3 項目 (= Item 2-4) として別途
- モバイル UX 全般 → B-#10 として別途

## 確定後の流れ

1. user が spec レビュー
2. writing-plans skill で実装プランを生成
3. 実装 → tsc / vitest / build / 本番デプロイ
