# Booklage 開発ToDo

> 完了済みタスクは [TODO_COMPLETED.md](./TODO_COMPLETED.md) に移動済み

---

## 現在の状態（次セッションはここから読む）

- **ブランチ**: `feat/s3-design-polish`（masterから分岐、22コミット）
- **注意**: mainブランチが空のまま。masterで開発中
- **進捗**: S3（デザイン磨き）実装中 — 基盤完了、再接続+磨き残り
- **仕様書**: `docs/superpowers/specs/2026-04-14-s3-design-polish.md`
- **実装計画**: `docs/superpowers/plans/2026-04-14-s3-design-polish.md`

### 重要な技術判断（このセッションで確定）

1. **ReactのDOM管理がGSAP Draggableを壊す** — カードのwrapper divはDOM APIで直接作成し、`createPortal`でカード中身をレンダリングする方式に変更済み。`board-client.tsx`内のuseEffectでDraggable管理。DraggableCard.tsxはもう使っていない（シンプルなdivを返すだけ）
2. **リキッドグラス** — Chrome検出成功、SVGフィルター5つ生成確認済み。UIパネルに屈折効果あり。物理ベース（スネルの法則）のdisplacement map + スペキュラーハイライト実装済み
3. **React Strict Mode** — GSAP互換性のため`next.config.ts`で`reactStrictMode: false`に設定中

### S3 完了済み

- [x] リキッドグラス基盤（displacement map生成、Provider、Hook、Chrome検出）
- [x] UIパネル全てにリキッドグラス適用（FolderNav, UrlInput, ViewModeToggle等）
- [x] カードスタイル4種のCSS（Glass, Polaroid, Newspaper, Magnet）
- [x] テーマ→カラーモード自動連動
- [x] UIモード独立トグル（自動/ダーク/ライト）
- [x] Cardboard背景テーマ + 手書きフォント(Caveat)
- [x] カードサイズ/アスペクト比プリセット + ランダム生成コード
- [x] DB Migration v3（width/height + UserPreferences）
- [x] 統合設定パネル（背景/スタイル/UIモード/サイズ/比率）
- [x] カードドラッグ（DOM API方式で動作確認済み）
- [x] FPS監視 + 段階的劣化コード
- [x] useCardTilt Hook, useCardRepulsion Hook, ripple.ts（コード存在）

### 次にやること（最優先 — S3の残り作業）

1. **機能の再接続** — ドラッグ修正でDraggableCardを作り直した際に外れた機能:
   - 3D tilt + spotlight（board-clientのDOM管理方式に合わせて再接続）
   - 着地リプル（onDragEnd内にcreateRipple呼び出し追加）
   - リサイズハンドル（DOM要素に追加 or ポータル経由）
   - 距離ベースリパルション（handleDrag内で呼ぶコードは存在するが動作未確認）
2. **動作確認** — 4種カードスタイル切替、ランダムサイズ/比率、perfTier接続
3. **カードにもリキッドグラス適用**（ユーザー要望 — UIだけでなくカード自体にも屈折効果）
4. **見た目の磨き** — ホバーエフェクト、カーソル、アニメーションの質、AIっぽくないデザイン

### 変更ファイル一覧（S3で追加・変更した主要ファイル）

**新規作成:**
- `lib/glass/displacement-map.ts` — 物理ベース屈折のdisplacement map生成
- `lib/glass/LiquidGlassProvider.tsx` — SVGフィルター定義 + Chrome検出コンテキスト
- `lib/glass/use-liquid-glass.ts` — リキッドグラス適用Hook
- `lib/interactions/use-card-tilt.ts` — 3D tilt Hook（現在未使用 — 再接続必要）
- `lib/interactions/use-card-repulsion.ts` — 距離ベースリパルション
- `lib/interactions/use-frame-monitor.ts` — FPS監視
- `lib/interactions/ripple.ts` — 着地波紋エフェクト
- `lib/theme/theme-utils.ts` — テーマ→カラーモードマッピング
- `lib/canvas/card-sizing.ts` — ランダムサイズ/比率生成
- `components/board/card-styles/CardStyleWrapper.tsx` + `.module.css`
- `components/board/ResizeHandle.tsx` + `.module.css`
- `components/board/SettingsPanel.tsx` + `.module.css`

**主要変更:**
- `app/(app)/board/board-client.tsx` — 全システム統合。カードwrapperをDOM APIで管理
- `app/globals.css` — リキッドグラスCSS、cardboard、ripple keyframes
- `app/layout.tsx` — Caveatフォント、data-ui-theme属性
- `lib/constants.ts` — DB_VERSION=3、カードサイズ定数
- `lib/storage/indexeddb.ts` — v3 migration、UserPreferences
- `components/board/Canvas.tsx` — LiquidGlassProvider削除（board-clientに移動）
- `next.config.ts` — reactStrictMode: false

---

## 確定した設計方針（2026-04-10 確認）

- サーバー費¥0（Cloudflare Pages無料枠のみ）
- ユーザーデータ一切非保持（IndexedDBのみ）
- ブックマークレットが主導線（Worker不要でOGP取得）
- 画像は外部サイトから直接表示
- 無限キャンバス: Figma/Miro風
- **ReactのDOM管理はGSAP Draggableと互換性がない** → DOM API + createPortal方式

## バグ・不具合（要修正）

（なし — ドラッグ修正済み）

## 未着手（S3後にやること）

- [ ] S4: 広告基盤
- [ ] S5: ブックマークレットUI
- [ ] S6: PWA + スマホ保存
- [ ] S7: LP
- [ ] S8: 静的ページ
- [ ] Cloudflare Pagesデプロイ

## 未着手（将来）

- [ ] 残り13言語のi18n対応
- [ ] Remotionプロモ動画
- [ ] OGP画像生成（Satori）
- [ ] PiPドロップゾーン（v1.2）
- [ ] Web Share Target（PWA共有）

## アイデア・やりたいこと

- カードにもリキッドグラスを適用（ユーザーが切替可能に）
- 方眼紙は白系背景に黒い格子パターンも追加
- もっと多くのカードスタイル（ネオン、布、羊皮紙等）
- 音フィードバック（ホバー/クリック時の微かな音）
