# Booklage 開発ToDo

> 完了済みタスクは [TODO_COMPLETED.md](./TODO_COMPLETED.md) に移動済み
> デザイン参考資料は [DESIGN_REFERENCES.md](./DESIGN_REFERENCES.md) を参照

---

## 現在の状態（次セッションはここから読む）

- **ブランチ**: `claude/b1-placement` (worktree `.claude/worktrees/b1-placement/`、master から分岐)
- **進捗**: **B1-placement Task 1-8 完了**（foundation 層、27 タスク中 8 完了）→ 次は **Task 9 (use-board-data.ts 統合)** から
- **本番URL**: `https://booklage.pages.dev`
- **DBバージョン**: v6（Task 7 で bump 済、worktree ローカル。master にマージ or deploy 時に旧ユーザーの DB が自動 migration される）
- **GitHub**: `origin` → `https://github.com/masaya-men/booklage.git`（Public）
- **ビルド**: `output: 'export'`（静的書き出し）、出力先は `out/`
- **デプロイ**: `npx wrangler pages deploy out/ --project-name=booklage --commit-dirty=true`（手動）
- **テスト**: **77 PASS / 0 FAIL**（Task 8 時点、vitest）、tsc strict clean

### 直近の作業（2026-04-19 B1-placement Task 1-8 実装）

- **superpowers:subagent-driven-development** で Task 1 から順次実装、implementer → spec reviewer → code-quality reviewer の二段レビュー loop を全タスクで実施
- **Task 1 (b58638b)** — `types.ts` に `LayoutMode` / `FreePosition` / `FrameRatio` / `BoardConfig` / `SnapGuideLine` / `CardRightClickAction` 追加
- **Task 2 (9ca2fc8)** — `constants.ts` に RESIZE / SNAP / ROTATION / Z_ORDER / FRAME / MODE_TRANSITION / UNDO 追加、`CARD_SIZE_LIMITS` を `RESIZE` にリネーム・値変更（MIN 80, MAX 1200）
- **Task 3 (367ad11)** — `aspect-ratio.ts` 新規、12 URL 種別 → アスペクト比推定の純関数 + 20 テスト
- **Task 4 (1a08532 + 5f0805e)** — `frame-presets.ts` 新規、SNS 9 プリセット + custom、8 テスト。spec 内部矛盾（custom clamp vs test）を TDD 原則に従って「test pass 優先」で解決（clamp 削除、caller 側で validation すべき旨のメモ）
- **Task 5 (61d9f7b)** — `free-layout.ts` 新規、snap guides / applySnap / bleed detection の純関数 + 8 テスト
- **Task 6 (a0fedfc)** — `auto-layout.ts` に `computeGridLayoutWithVirtualInsert` 追加（drag preview 用）、`auto-layout.test.ts` 新規 9 テスト
- **Task 7 (b19c9d2)** — IndexedDB v5→v6 migration、`BookmarkRecord` に isRead/isDeleted/deletedAt、`CardRecord` に locked/isUserResized/aspectRatio 追加
- **Task 8 (a0bfa59)** — `lib/storage/board-config.ts` 新規、`loadBoardConfig` / `saveBoardConfig` / `DEFAULT_BOARD_CONFIG`、fake DB での 2 テスト
- **全 9 commits** は `claude/b1-placement` ブランチに積まれた状態（未 push）

### ⚠️ 次セッションの最初にやってほしい後処理

**worktree 物理ディレクトリの手動削除**（Windows ファイルロックで自動削除失敗が残存）:

`.claude/worktrees/` 配下の以下の 2 つは本セッションでも PowerShell/bash 両方で削除失敗。エクスプローラーで物理削除してください：

- `lucid-bardeen-c9a786/`
- `quirky-wilson-41d2b5/`

**削除済み**: `b0-impl/`, `cool-archimedes-0b85f7/`, `hardcore-yalow/`

**アクティブ worktree**（触らない）: `b1-placement/`（今回の作業ツリー）, `condescending-vaughan-e85ea7/`, `practical-brown-e05704/`, `relaxed-bartik-75778e/`, `zen-gould-55806b/`, `tender-chaplygin-e7c89c/`（前セッション）

### B1-placement 実装計画の要点

- Grid モードと Free モードの 2 切替。ボード設定（layoutMode + frameRatio）は永続化
- 中身に応じたアスペクト比マッピング（YouTube 16:9、長文ツイート 3:4 等、12 パターン）
- Free モード: ソフト境界フレーム + SNS プリセット + desaturated 外側 + ブリード配置
- カード変形（Free のみ）: 回転（Shift で自由）、8 ハンドルリサイズ、alignment snap（Shift で OFF）、z-order
- 右クリック: 既読 / 削除（10s Undo トースト）/ z-order / ロック
- Shopify.design tier の UI chrome、Designmd Style Extractor で数値抽出
- IndexedDB v5→v6 migration + `freePos` / `isRead` / `isDeleted` 追加 ← **Task 7 で完了**
- Grid drag: A++ Insert + FLIP reflow、C-pure は post-B1 upgrade として design 済

### B1-placement 残タスク（Task 9-27、次セッション以降）

**Integration 層** (Task 9): `lib/storage/use-board-data.ts` 改修、`detectAspectRatioSource` + `estimateAspectRatio` を OGP から使って aspectRatio 動的計算、`freePos` / `gridIndex` 配信

**UI 層** (Task 10-24):
- Task 10: `SnapGuides.tsx`（Figma 風ピンク線）
- Task 11: Grid drop indicator + virtual insert 統合
- Task 12: FLIP animation (GSAP) for grid reflow
- Task 13: `BoardRoot` に layoutMode state + morph
- Task 14: `CardsLayer` mode 分岐 + morph
- Task 15: `CardNode` 選択 UI + free transforms
- Task 16: Free-mode drag + snap + alignment guides
- Task 17: `RotationHandle.tsx`（15° snap / Shift で自由）
- Task 18: `ResizeHandle.tsx` を 8 ハンドル化（4 隅 aspect-locked / 4 辺 free-axis）
- Task 19: `Toolbar.tsx` Pill トグル
- Task 20: `FramePresetPopover.tsx`
- Task 21: `Frame.tsx` visualizer + desaturation
- Task 22: `CardContextMenu.tsx` 右クリック
- Task 23: `UndoToast.tsx` + soft delete flow
- Task 24: z-order keyboard shortcuts + lock

**仕上げ** (Task 25-27):
- Task 25: i18n 文字列 15 言語追加
- Task 26: Playwright E2E（6+ シナリオ）
- Task 27: 1000-card パフォーマンス regression

### 次セッション最優先タスク

1. **worktree 物理削除**（lucid-bardeen + quirky-wilson の 2 つ）
2. **B1-placement Task 9 から継続** — `.claude/worktrees/b1-placement/` に入って `superpowers:subagent-driven-development` で Task 9 から再開。plan は `docs/superpowers/plans/2026-04-19-b1-placement.md` 参照

### 引き継ぎ時の重要メモ

- **Task 4 spec 内部矛盾メモ**: `computeFrameSize({ kind: 'custom', ... })` は現在 clamp しない実装。UI から custom サイズを受ける時は caller 側で FRAME.MIN_PX / MAX_PX に clamp する必要あり（実装時に気をつける）
- **Task 6 テスト extra**: `auto-layout.test.ts` に spec 指定より多い tests が含まれる（既存 `computeAutoLayout` baseline 4 + virtual insert 5）。害はないので削除不要
- **Task 7 DB migration**: worktree で DB_VERSION が 6 になった。master にマージする前に既存 booklage.pages.dev ユーザーの DB が自動 migration される設計（fire-and-forget cursor）。migration 失敗時のフォールバック無しなのは既存 v1-v5 パターン踏襲
- **Foundation 層 (1-8) と Integration/UI 層 (9-27) の境界**: Task 9 から UI 依存が増える。実装中に subagent が NEEDS_CONTEXT で止まる率が上がる見込み。controller は sonnet モデル昇格を検討
- **IDEAS.md sync**: 本セッションでは修正していない。`b1-placement` worktree と メインリポ両方で同一

### 2026-05-19 以降に削除する remote backup branch

- `git push origin --delete backup-pre-filter-repo-2026-04-19` （Phase 2 力ずくロールバック用、1 ヶ月で十分）

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

ユーザー発案 2026-04-19、B1 で実装する重要機能の一つ。

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
  - 候補: Reorder drag vs Free placement vs Hybrid（詳細は docs/superpowers/specs/ 参照）
  - multi-playback の「ミックス配置」ニーズと合わせて設計
- もっと多くのカードスタイル（ネオン、布、羊皮紙等）
- 音フィードバック（ホバー/クリック時の微かな音）
- LPの磨き上げ（マーケティング開始前に実施）
- LPは明るいテーマをデフォルト
- 複数動画の同時再生は B1 の中核機能の一つ
- レンズカーソル参考: https://r3f.maximeheckel.com/lens2
