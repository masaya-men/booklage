# Booklage 開発ToDo

> 完了済みタスクは [TODO_COMPLETED.md](./TODO_COMPLETED.md) に移動済み
> デザイン参考資料は [DESIGN_REFERENCES.md](./DESIGN_REFERENCES.md) を参照

---

## 現在の状態（次セッションはここから読む）

- **ブランチ**: `claude/b0-impl`（Task 13〜18 完了、master マージ待ち）
- **進捗**: **B0 ボード骨組みリビルド完了** → 次は B1（装飾レイヤー）か Task 17（実データ視覚調整）
- **本番URL**: `https://booklage.pages.dev`
- **DBバージョン**: v4（ogpStatus追加、スキーマは変更なし）
- **GitHub**: `origin` → `https://github.com/masaya-men/booklage.git`（Public）
- **ビルド**: `output: 'export'`（静的書き出し）、出力先は `out/`
- **デプロイ**: `npx wrangler pages deploy out/ --project-name=booklage --commit-dirty=true`（手動）
- **テスト**: vitest 30/30、Playwright E2E 6/6、perf spec 1本 すべて green、TypeScript strict クリア

### 直近の作業（2026-04-19 B0 セッション②）

- Task 13: `/board` を BoardRoot に差し替え。最小 ja-only 翻訳ヘルパ `lib/i18n/t.ts` を追加
- Task 14: Playwright E2E 6件追加。layout wrap バグ（InteractionLayer がカードイベントを奪う）を発見・修正
- Task 15: **クリーンスレート削除** — 旧 board-client.tsx + orphan UI 全部 + 依存 lib すべて削除（11,270 行削除）
- Task 16: 1000 カード perf spec 追加 → 60.6 fps / DOM 66枚 / 最長 16.8ms frame 達成
- Task 17: 実データ視覚調整は **ユーザー確認待ち**（マージ後に実ブクマで確認してもらう）
- Task 18: TODO 更新 + master マージ

### 重要な技術判断（確定済み）

1. **B0 6層構成** — BoardRoot / ThemeLayer / CardsLayer / InteractionLayer / CardNode / ResizeHandle、`lib/board/*` に純関数レイアウト
2. **InteractionLayer は scrolled content を children として wrap する** — 直下 wrapper に `pointer-events: none`、カードだけ `auto`
3. **viewport culling** — 1-screen buffer で 1000 カード → DOM 66 枚
4. **i18n は静的 ja.json import** — next-intl 未導入。locale 化は将来スプリント
5. **IndexedDB v4 スキーマは現状維持** — rotation / scale / zIndex / gridIndex は dead column のまま（v5 マイグレーションは不要になるまで保留）

### B0 で削除された旧実装（git history 参照）

- `lib/glass/*`, `lib/sphere/*`, `lib/interactions/*`, `lib/theme/*`, `lib/import/*`, `lib/scraper/*`
- `lib/canvas/{auto-layout,use-infinite-canvas,collision}.ts`
- `components/board/*` の旧 UI 全系統（Canvas, BookmarkCard, DraggableCard, CustomCursor, Sphere*, SettingsPanel, FolderNav, UrlInput, ViewModeToggle, ThemeSelector, ExportButton, RandomPick, ColorSuggest, BookmarkListPanel, TweetCard, VideoEmbed, card-styles/）
- `components/import/*`（ImportModal 等）、`components/pwa/InstallPrompt`、`components/bookmarklet/BookmarkletBanner`

→ 再実装時はまず `docs/archive/liquid-glass-notes.md` / `docs/archive/sphere-navigation-notes.md` を読む

---

## 次にやること: リビルドフェーズ

`docs/REBUILD_VISION.md` の方針で B(board) → C(LP) → D(cards) → A(sphere)。B0 が完了したところ。

### 最優先（マージ直後にやる）

- [ ] **Task 17: B0 の実データ視覚調整**
  - `/board` を実ブラウザで開き、既存ブクマで auto layout の手触りを確認
  - `lib/board/constants.ts::LAYOUT_CONFIG` の `TARGET_ROW_HEIGHT_PX` / `GAP_PX` を必要なら微調整
  - 「触ってて気持ちいい」ラインまで来てから B1 へ進む

### 次フェーズ候補（ユーザー判断）

- **B1 装飾レイヤー**: kube.io 方式の液体ガラス再実装、カードスタイル、スプリング物理、3D タイル演出
  - 参照: `docs/archive/liquid-glass-notes.md`、`docs/DESIGN_REFERENCES.md`
- **B2 ブクマ管理再統合**: URL 入力 / フォルダ / インポート / 設定パネルを BoardRoot に戻す
  - 旧実装は B0 で完全削除済。git history から発掘してフルスクラッチ
- **B3 3D 球体ナビ再接続**: `theme-registry` に `direction: 'sphere'` を足して再統合
  - 参照: `docs/archive/sphere-navigation-notes.md`
- **C LP リビルド**: `app/(marketing)/` と `app/page.tsx` 全面刷新
- **D カードスタイル拡充**

### 未着手（スプリント未切）

- [ ] html-in-canvas（ブラウザ未実装、待ち）
- [ ] S4: 広告基盤（ユーザーが付いてから）

---

## 確定した設計方針

- サーバー費¥0（Cloudflare Pages無料枠のみ）
- ユーザーデータ一切非保持（IndexedDBのみ）
- ブックマークレットが主導線（Worker不要でOGP取得）
- 無限キャンバス: Figma/Miro風
- B0 以降は「装飾ゼロの骨組み」を常に維持し、装飾は差し込み可能な形で追加する

## B1 の核ビジョン: 「Booklage 上で複数動画／音を同時ミックスして世界を作る」

ユーザー発案 2026-04-19、**[redacted-strategy]**。[redacted-strategy]。

**例**: クラシック音楽 + 森の散歩動画、ポケモンシティ BGM + 勉強机、AAA ゲーム trailer + 深海生物、etc.

**技術的実現性**: 全て合法・公式 embed あり
- YouTube: `youtube.com/embed/<id>` iframe（公式・利用規約明示許諾）
- TikTok: 公式 embed API
- Twitter/X: `react-tweet`（以前削除したので B1 で戻す）
- Vimeo / SoundCloud / Spotify: iframe 公式対応
- 複数同時再生: ブラウザ制限なし。音は各カードにミュートトグル、通常は 1 枚だけ unmute

**B1 実装時の論点**（brainstorming 必須）:
- click の意味を「新タブで開く」→「カード内で再生」に変える
- 再生中カードのアスペクト比を 16:9 に自動調整
- 音声競合の UX（自動 mute / 手動 unmute 切替）
- 同時再生時のパフォーマンス（iframe 多数 → 帯域 + CPU）
- ミックス状態の保存・共有（URL 圧縮エンコード方式で「このミックス」を SNS シェア？）

## アイデア・やりたいこと

- **B1 で優先したい**: **中身に応じてカードの縦横比を変える**（ユーザー発案 2026-04-19）
  - 長文ツイート → 縦長（3:4 / 1:2 など）、画像付きツイート → 横長（16:9）、YouTube → 16:9
  - 形が揃わない方が Moodboard 的な視覚リズムが出て見ていて楽しい
  - 実装箇所: `lib/storage/use-board-data.ts::toItem` の `aspectRatio` を IndexedDB 固定値ではなく「URL種別 + OGP メタから推定」に差し替え
- **B1 で優先したい**: **ドラッグ UX の brainstorming 済み版を実装**
  - 候補: Reorder drag（mymind/Are.na）vs Free placement（Milanote）vs Hybrid（Are.na pinlock）
  - multi-playback の「ミックス配置」ニーズと合わせて設計（Free の方が直感的かも）
- もっと多くのカードスタイル（ネオン、布、羊皮紙等）
- 音フィードバック（ホバー/クリック時の微かな音）
- LPの磨き上げ（マーケティング開始前に実施）
- LPは明るいテーマをデフォルト
- [redacted-strategy]
- レンズカーソル参考: https://r3f.maximeheckel.com/lens2
