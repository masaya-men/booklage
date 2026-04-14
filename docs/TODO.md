# Booklage 開発ToDo

> 完了済みタスクは [TODO_COMPLETED.md](./TODO_COMPLETED.md) に移動済み

---

## 現在の状態（次セッションはここから読む）

- **ブランチ**: `feat/s3-design-polish`（masterから分岐）
- **注意**: mainブランチが空のまま。masterで開発中
- **進捗**: S3 完了 → **S5（ブックマークレットUI）の実装に着手する**
- **S5 設計書**: `docs/superpowers/specs/2026-04-14-s5-bookmarklet.md`
- **S5 実装計画**: `docs/superpowers/plans/2026-04-14-s5-bookmarklet.md`（コード全部入り、5タスク）
- **GitHub**: `origin` → `https://github.com/masaya-men/booklage.git`（リポジトリ未作成）

### 重要な技術判断（確定済み）

1. **ReactのDOM管理がGSAP Draggableを壊す** — カードのwrapper divはDOM APIで直接作成し、`createPortal`でカード中身をレンダリングする方式に変更済み。`board-client.tsx`内のuseEffectでDraggable管理
2. **リキッドグラス** — Chrome検出成功、UIパネル+カードに屈折効果あり。物理ベース（スネルの法則）のdisplacement map + スペキュラーハイライト実装済み
3. **React Strict Mode** — GSAP互換性のため`next.config.ts`で`reactStrictMode: false`に設定中
4. **CardPortalContent** — tilt/spotlight/liquid glass/resize handleを統合した内部コンポーネント。各カードがポータル経由でレンダリング

### S3 完了済み

- [x] リキッドグラス基盤（displacement map生成、Provider、Hook、Chrome検出）
- [x] UIパネル全てにリキッドグラス適用（FolderNav, UrlInput, ViewModeToggle等）
- [x] **カードにもリキッドグラス適用**（glass style時にSVGフィルター自動適用）
- [x] カードスタイル4種のCSS（Glass, Polaroid, Newspaper, Magnet） — 切替動作確認済み
- [x] テーマ→カラーモード自動連動
- [x] UIモード独立トグル（自動/ダーク/ライト）
- [x] Cardboard背景テーマ + 手書きフォント(Caveat)
- [x] カードサイズ/アスペクト比プリセット + ランダム生成コード
- [x] DB Migration v3（width/height + UserPreferences）
- [x] 統合設定パネル（背景/スタイル/UIモード/サイズ/比率）
- [x] カードドラッグ（DOM API方式で動作確認済み）
- [x] FPS監視 + 段階的劣化コード
- [x] **3D tilt + spotlight 再接続**（CardPortalContent + useCardTilt hook）
- [x] **着地リプル 再接続**（handleDragEnd内でcreateRipple呼び出し）
- [x] **リサイズハンドル 再接続**（ポータル内にResizeHandle配置）
- [x] **リパルション接続確認**（handleDrag→applyRepulsion、handleDragEnd→resetRepulsion）
- [x] **ドラッグアニメーション**（ピックアップ時scale+shadow、着地バウンス）
- [x] **ホバーエフェクト磨き**（border-colorアクセント、scale調整）
- [x] **カーソル統一**（wrapper→grab/grabbing、子要素はinherit）
- [x] **FPS監視バグ修正** — useFrameMonitorが一時的FPS低下で永久劣化していた。閾値緩和（30fps→degrade、45fps以上×3回→recover）

### 次にやること（S3の仕上げ — 後でブラッシュアップ）

1. **最終確認** — 各テーマ×各スタイルの組み合わせ確認
2. **パフォーマンス確認** — 50枚カード時のFPS（perfTier段階的劣化の動作）
3. **エッジケース** — リサイズ後の液体ガラスフィルター再計算、グリッド↔コラージュ切替時の挙動

### 変更ファイル一覧（S3で追加・変更した主要ファイル）

**新規作成:**
- `lib/glass/displacement-map.ts` — 物理ベース屈折のdisplacement map生成
- `lib/glass/LiquidGlassProvider.tsx` — SVGフィルター定義 + Chrome検出コンテキスト
- `lib/glass/use-liquid-glass.ts` — リキッドグラス適用Hook
- `lib/interactions/use-card-tilt.ts` — 3D tilt Hook（CardPortalContent経由で接続済み）
- `lib/interactions/use-card-repulsion.ts` — 距離ベースリパルション
- `lib/interactions/use-frame-monitor.ts` — FPS監視
- `lib/interactions/ripple.ts` — 着地波紋エフェクト
- `lib/theme/theme-utils.ts` — テーマ→カラーモードマッピング
- `lib/canvas/card-sizing.ts` — ランダムサイズ/比率生成
- `components/board/card-styles/CardStyleWrapper.tsx` + `.module.css`
- `components/board/ResizeHandle.tsx` + `.module.css`
- `components/board/SettingsPanel.tsx` + `.module.css`

**主要変更:**
- `app/(app)/board/board-client.tsx` — 全システム統合。CardPortalContent追加、ドラッグアニメ、リプル、tilt/glass/resize接続
- `app/globals.css` — リキッドグラスCSS、tilt/spotlight、drag状態、ripple keyframes
- `app/layout.tsx` — Caveatフォント、data-ui-theme属性
- `lib/constants.ts` — DB_VERSION=3、カードサイズ定数
- `lib/storage/indexeddb.ts` — v3 migration、UserPreferences
- `components/board/Canvas.tsx` — LiquidGlassProvider削除（board-clientに移動）
- `components/board/card-styles/CardStyleWrapper.tsx` — liquidGlassプロパティ追加
- `components/board/card-styles/CardStyleWrapper.module.css` — liquid-glass-active時のblur無効化
- `components/board/BookmarkCard.module.css` — cursor inherit、hover border-color追加
- `components/board/TweetCard.module.css` — cursor inherit
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

- ~~カードにもリキッドグラスを適用~~ → 完了（glassスタイル時に自動適用）
- 方眼紙は白系背景に黒い格子パターンも追加
- もっと多くのカードスタイル（ネオン、布、羊皮紙等）
- 音フィードバック（ホバー/クリック時の微かな音）
- Twitterの共有ボタンから直接Booklageに保存（Web Share Target / PWA）
- Twitterブックマーク一括取り込み（Twitter API / OAuth認証が必要）
- YouTube高評価・あとで見る動画の一括取り込み（YouTube Data API / OAuth認証が必要）
