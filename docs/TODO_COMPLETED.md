# 完了済みタスク

## B0 ボード骨組みリビルド（2026-04-19 完了）

- [x] 6層分離: `BoardRoot` → `ThemeLayer` / `CardsLayer` / `InteractionLayer` → `CardNode` / `ResizeHandle`
- [x] 純関数 `computeAutoLayout` + vitest 8件、1000カード計算 <16ms
- [x] テーマ: 点線ノート（縦）+ 方眼紙（縦、白格子）。`theme-registry.ts` で追加可能
- [x] viewport culling で 1000カード → DOM 66枚、60.6fps 維持（Playwright perf spec）
- [x] 装飾完全削除 — card-styles, liquid-glass, sphere, custom cursor, カードスタイル系
- [x] クリーンスレート削除 — 旧 board-client + orphan UI + 依存 lib（11,270行削除）
- [x] Playwright E2E 6件 green（テーマ背景、カード描画、wheel scroll、empty-drag、テーマ切替、カードドラッグ）
- [x] 本番品質の justified grid layout + IndexedDB 位置永続化

## MVP Week 1（2026-04-10 完了）

- [x] Task 1: プロジェクト初期化（Next.js 16 + TypeScript strict + pnpm）
- [x] Task 2: デザインシステム（CSS Custom Properties + constants.ts）
- [x] Task 3: ルートレイアウト（Inter + Outfit フォント + PWA manifest）
- [x] Task 4: URL検出ユーティリティ（テスト付き）
- [x] Task 5: IndexedDB ストレージ層（テスト付き）
- [x] Task 6: OGPスクレイパー API（Edge Runtime）
- [x] Task 7: oEmbedプロキシ API
- [x] Task 8: ボードページ + Canvasコンポーネント
- [x] Task 9: BookmarkCard + TweetCard
- [x] Task 10: URL入力 + 保存フロー
- [x] Task 11: GSAPドラッグ（位置永続化）
- [x] Task 12: フォルダナビゲーション
- [x] Task 13: 画像エクスポート + SNSシェア
- [x] Task 14: 背景テーマセレクター（9種）
- [x] Task 15: ランダムピック + 色サジェスト
- [x] Task 16: ブックマークレットジェネレーター（テスト付き）
- [x] Task 17: i18n基盤（日本語 + 英語）
- [x] Task 18: MVP統合テスト（18テスト全通過）
