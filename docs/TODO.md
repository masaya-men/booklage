# Booklage 開発ToDo

> 完了済みタスクは [TODO_COMPLETED.md](./TODO_COMPLETED.md) に移動済み
> デザイン参考資料は `docs/private/IDEAS.md`（非公開、gitignored）を参照

---

## 現在の状態（次セッションはここから読む）

- **ブランチ**: `claude/b1-placement` (worktree `.claude/worktrees/b1-placement/`、master から分岐、**origin に push 済**)
- **🔥 最新進捗 (2026-04-21)**: **Plan A (B1 Dashboard Foundation) Batch B 完了 + 本番デプロイ済** — Task 6-9 (layoutMode 削除 + IDB v6→v7 + alignAllToGrid + Toolbar 2 ボタン化 + FramePresetPopover 削除 + BoardRoot 統合) をワンセッションで実装 → `booklage.pages.dev` 反映済
- **Plan A 完了、次は Plan B (Share System)**: ShareModal 骨 + URL 埋込み + PNG 書き出し + X Web Intent + watermark。Batch A 〜 Batch B で Plan A のスコープは全て消化
- **X ブランドアカウント**: `@booklage_app` (display name: Booklage) を作成済、password マネージャー保管。build-in-public は `@men_masaya` から投稿
- **Plan A ドキュメント**: spec は `docs/superpowers/specs/2026-04-20-b1-dashboard-redesign-design.md`, plan は `docs/superpowers/plans/2026-04-20-b1-dashboard-foundation.md`
- **本番URL**: `https://booklage.pages.dev`（Batch B 反映済、2026-04-21 deploy）
- **DBバージョン**: **v7**（Batch B Task 6 で v6→v7、layoutMode 削除 migration 入り）
- **GitHub**: `origin` → `https://github.com/masaya-men/booklage.git`（Public）
- **ビルド**: `output: 'export'`（静的書き出し）、出力先は `out/`
- **デプロイ**: `npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true`（手動、**`--branch=master` 必須** — production alias に反映するため）
- **テスト**: **86 PASS / 0 FAIL**（vitest、align.test.ts の 4 件追加）、tsc strict clean

### 直近の作業（2026-04-21 Plan A Batch B 実装 + 本番デプロイ）

**ワンセッションで Task 6-9 全実装 + push + deploy 完了**（subagent が sandbox permission で edit 失敗 → main session 直接編集に切替）。

- **Task 6 (36cf611)** — `layoutMode` 概念完全削除 (`lib/board/types.ts` / `lib/storage/board-config.ts` / `lib/constants.ts` DB_VERSION 6→7 / `lib/storage/indexeddb.ts` migration / `components/board/BoardRoot.tsx` state+hydration+handler / `components/board/CardsLayer.tsx` の grid 分岐+prevModeRef+morph useEffect)。canvas 常に free placement、`CardsLayer.activePositions = freeLayoutPositions` で固定。Toolbar は optional 型化で一時的な互換 bridge に
- **Task 7 (eb0ac22)** — `lib/board/align.ts` 新規、`alignAllToGrid(items, { containerWidth, targetRowHeight, gap })` pure fn + 4 vitest。`computeAutoLayout` を `direction='2d'` で呼び、positions を各 item の `freePos` に書き戻す。rotation/zIndex/locked/isUserResized は preserve、x/y/w/h だけ上書き
- **Task 8 (94b8ead)** — Toolbar を `{ onAlign, onShare }` 2-prop 化。`⚡整列` + `📤シェア` の 2 ボタン、primary style は neutral `#1a1a1a`。`FramePresetPopover.tsx` + `.module.css` git rm、`messages/ja.json` の `board.mode`/`board.frame`/`board.toolbar.theme`/`board.toolbar.export` 削除、`board.toolbar.align` 追加。container の `left` を `calc(50% + var(--sidebar-width) / 2)` に変更、sidebar offset を考慮
- **Task 9 (7a84152)** — BoardRoot に `alignKey` state + `handleAlign` + `handleShare` stub を追加。`alignAllToGrid` の結果を `persistFreePosition` で N 回 optimistic setItems + IDB write、`setAlignKey(k+1)` で CardsLayer に morph trigger。CardsLayer は `useLayoutEffect` 内で `alignKey` 変化を検知、`gsap.to()` 400ms `power2.inOut` で morph（通常は `gsap.set()` で snap）。`effectiveLayoutWidth` / `horizontalOffset` も sidebar 分 offset。`frameRatio` state + `handleFrameRatioChange` は dead になるので削除（Plan B で復活予定）
- **検証**: tsc --noEmit clean / 86 vitest pass (既存 82 + align 4) / `pnpm build` 成功 (11 静的ページ生成)
- **Deploy**: `wrangler pages deploy out/ --branch=master --commit-dirty=true` で `booklage.pages.dev` 反映済
- **既知の dead code**（次スプリントで cleanup 可）:
  - BoardRoot の `useCardDrag` + `handleCardPointerDown` + `resolveStart` + `onDrag` + `onDragEnd` + `onCardClick` — grid drag 用インフラ全体が未使用（CardsLayer の `onCardPointerDown` prop も `void` で参照だけ）
  - Toolbar に `frameRatio` / `onFrameRatioChange` / `themeId` / `onThemeClick` / `onExportClick` の optional props が残存（Task 8 で使用箇所は削除済、Plan B で ShareModal 経由に再配線予定）

**X build-in-public 第 1 投稿は保留** — user 判断で「見栄えが上がってから」に延期。投稿予定文面 + スクショ構成は本 TODO 末尾「保留中の tweet 下書き」セクションに保管

### 直近の作業（2026-04-20 Plan A Batch A 実装）

**brainstorming (2026-04-20)**: B1-placement の UX に根本的ねじれ発覚 → 完全再設計
- Grid/Free モード概念を廃止 → canvas 常に free placement、`整列` は「モード」ではなく「アクション」
- Frame preset は Toolbar 常時表示ではなく「シェア」ボタンで開く full-screen モーダルに
- 左 edge-anchored サイドバー (kube.io 式 屈折液体ガラス) で dashboard 体験
- 既存 Task 14-18 (カード操作系) は温存、Task 19/20 は rework/削除
- spec `docs/superpowers/specs/2026-04-20-b1-dashboard-redesign-design.md` + plan `docs/superpowers/plans/2026-04-20-b1-dashboard-foundation.md` にまとめた

**Plan A Batch A (Task 1-5 + BoardRoot 統合)** — 本番デプロイ済 (`booklage.pages.dev`):
- **Task 1 (9a5a344 + alias fix)** — `app/globals.css` に B1 Dashboard 用 CSS 変数群 (`--glass-clarity: 0.35`, `--glass-blur: 6px`, `--glass-displacement-scale: 12`, `--glass-edge`, `--glass-specular`, `--sidebar-width: 240px`, `--sidebar-collapsed: 52px`, `--sidebar-ease`, `--sidebar-duration: 340ms`, `--corner-radius-outer: 24px`, `--corner-radius-inner: 6px`, `--accent-dark`, `--accent-primary` は既存 `--color-accent-primary` alias として追加)
- **Task 2 (23d6fc6)** — `scripts/generate-displacement-map.mjs` + `public/displacement/glass-001.png` (512x512, 70KB, radial ripple pattern)。`sharp` を dev dep に追加
- **Task 3 (1d1c9fe)** — `components/board/LiquidGlass.tsx` + `.module.css` 新規。SVG `<feDisplacementMap>` filter + blur fallback (`@supports not (backdrop-filter: url)`)
- **Task 4 (d875540)** — `components/board/Sidebar.tsx` + `.module.css` 新規 (shell)、edge-anchored 240px / 折り畳み 52px、`transform: translateX()` で ease-out 340ms
- **Task 5 (c07ab42)** — Sidebar 本実装。Playfair italic ロゴ / 検索 shell / LIBRARY 3 項 (すべて/未読/既読 + 件数) / Folders B2 placeholder / 🎨 テーマ / 縦書き `BOARD · 2026` signature。`messages/ja.json` に `board.sidebar.*` 13 キー追加
- **BoardRoot 統合** — Sidebar を BoardRoot に mount、`sidebarCollapsed` state + F キー global listener、`sidebarCounts` derived from items (isRead/isDeleted ベース)、`handleSidebarToggle` useCallback
- **Glass visibility fix** — 初回デプロイで `:global(.glass)` CSS Module スコープバグで glass チップが高さ 0 になりサイドバーがほぼ見えなかった → `<LiquidGlass className={styles.sidebarGlass}>` で className prop 経由に修正。さらに refraction が実機で効いていないため `--glass-clarity: 0.04 → 0.35` / `--glass-blur: 0 → 6px` でベースライン視認性確保 (CSS var なので後調整可)
- **実機確認** (2026-04-20 セッション後半):
  - ✅ サイドバー表示 OK (ロゴ/検索/Library/Folders/テーマ/signature 全部見える)
  - ⚠️ **リキッドガラスの屈折は実機で効いてない** — `backdrop-filter: url(#id)` の Chrome 互換性か feDisplacementMap 設定要再調査。MEMORY に `feedback_glass_blur_tuning.md` 記録、Batch B or polish で戻る
  - ⚠️ **「グリッドボタン押しても全カード整列しない」既知バグ** — 現在は「モード切替」で再レイアウトが部分的にしか効いてない。Batch B Task 6-8 で「整列アクション化」すれば解決予定 (Task 7 `alignAllToGrid` が全カード強制再計算する)
- 全 commits は `claude/b1-placement` に積まれ **origin に push 済**

### 🚨 次セッション起床後の最優先アクション

1. **`docs/private/launch-plan-2026-04.md` を読む** (非公開、launch 戦略の詳細 day-by-day プラン、2026-04-21 大幅改訂版)
2. **`docs/TODO.md` (このファイル) を読む** ← 今ここ
3. **現時点の選択肢 (user 判断): "見栄えが上がったら tweet したい" 方針で以下から選ぶ**:
   - **Plan B (Share System) spec/plan 着手** — ship 必須の magic moment 機能。ShareModal + PNG 書き出し + X Web Intent + watermark。2-3 日スコープ
   - **液体ガラス refraction 調査** — Fri 4/25 の 1 日 timebox、visual win の可能性あり (原因: Chrome の `backdrop-filter: url(#id)` 互換性 or feDisplacementMap 設定)
   - **一括インポート MVP** — Pocket JSON / Raindrop export / HTML bookmark export をドラッグ&ドロップで取り込み。Pocket 終了市場を取る key 機能
   - **LP 3 バリエーション** — `/`(main) / `/ai-moodboard` / `/pocket-alternative` の静的ページ作成。AdSense 申請要件

### 保留中の tweet 下書き（2026-04-21 作成、見栄え強化後に投稿）

**Task 6 完了 build-in-public 第 1 投稿**（140 字、案 A）:

```
Booklage、ブクマでコラージュを作れる Web アプリを作ってます。今月 5/5 ローンチ目標。
今日は Task 6 完了：canvas を常時自由配置化して、「整列」はボタン操作に分離しました。

https://booklage.pages.dev
#個人開発 #buildinpublic
```

**スクショ構成**: 通常 Chrome (`@men_masaya` 側) で `booklage.pages.dev/board` を最大化、カード 8-12 枚載ってる状態で **Win+Shift+S で矩形切り取り**。左端: sidebar 左端、右端: カードクラスタ右端付近、上端: Toolbar のすぐ上、下端: カード 2-3 行見える位置。横 1600×縦 900 (16:9) 目安。

投稿元は `@men_masaya` (既存 562 フォロワー、build-in-public は personal account から)。`@booklage_app` は放置で OK。

### Plan B (次着手候補)

Share System — ShareModal full-screen + フレーム drag/resize + SNS Web Intents + Web Share API + brotli URL encoding + importer + ウォーターマーク。Batch B 完了 → **次セッションで brainstorming → spec → plan → 実装** の流れ。

### 旧進捗 (2026-04-19 B1-placement Task 1-10 + Task 13-20 実装 — 一部 Plan A で superseded)

- **Task 20 (aa3d2b8 + 368a4a0)** — `FramePresetPopover.tsx` 本実装 + `.module.css` 新規。Task 19 で作った stub (// TODO(Task 20)) を SNS 9 プリセット + Custom 入力 UI に置換。9 preset tile (Instagram/Story/Reels/IG Landscape/X 横/X 縦/Pinterest/YT Thumb/A4) + 別描画の Custom tile、`isCustom` 時のみ width×height input + Apply button。**design override**: Shopify-tier glass chrome (rgba(255,255,255,0.98) + blur 10px + 12px radius + 紫 tinted shadow `0 8px 28px rgba(15,15,25,0.14)` + 1px hairline border)、selected は neutral `#1a1a1a` (Toolbar active と整合、violet は input focus ring のみ edit affordance として採用)、top: 56px (Toolbar との gap 詰め)。**plan バグ修正**: customW/customH の `useState` 初期値を `currentRatio.kind === 'custom' ? currentRatio.width : 800` に変更 (plan のまま 800 固定だと popover 再開時に state が消える)。**NaN guard + apply-time clamp** 方式: onChange は clamp せず自由入力、Apply ボタン押下時のみ `FRAME.MIN_PX` / `MAX_PX` で clamp (UX: 打ってる途中で "30" → "3000" の mid-typing を妨げない)。**a11y**: PresetCard を `<button type="button" aria-pressed>` に、container `role="group" aria-label` で labelled group、input に `aria-label={t(...)}` で i18n 経由。**code review で Important 3 件 fix** (368a4a0): aria-label のハードコード日本語 → i18n (`widthLabel`/`heightLabel` キー追加)、`role="dialog"` → `role="group"` downgrade (focus trap 未実装で dialog を名乗る矛盾解消)、未使用 `onClose` prop を Props 型と Toolbar 呼び出し両方から削除。`messages/ja.json` に `board.frame.popover.{title,applyCustom,widthLabel,heightLabel}` + `board.frame.preset.custom` の 5 キー追加。preset ラベルは `preset.label` 直接参照 (messageKey は Task 25 i18n 展開のため残置)。outside-click / ESC close は未実装 (Task 19 simplicity-first pattern 踏襲、将来必要になったら prop + 実装をセットで追加する方針)。82 vitest pass / tsc clean


- **superpowers:subagent-driven-development** で Task 1 から順次実装、implementer → spec reviewer → code-quality reviewer の二段レビュー loop を全タスクで実施
- **Task 1 (b58638b)** — `types.ts` に `LayoutMode` / `FreePosition` / `FrameRatio` / `BoardConfig` / `SnapGuideLine` / `CardRightClickAction` 追加
- **Task 2 (9ca2fc8)** — `constants.ts` に RESIZE / SNAP / ROTATION / Z_ORDER / FRAME / MODE_TRANSITION / UNDO 追加、`CARD_SIZE_LIMITS` を `RESIZE` にリネーム・値変更（MIN 80, MAX 1200）
- **Task 3 (367ad11)** — `aspect-ratio.ts` 新規、12 URL 種別 → アスペクト比推定の純関数 + 20 テスト
- **Task 4 (1a08532 + 5f0805e)** — `frame-presets.ts` 新規、SNS 9 プリセット + custom、8 テスト。spec 内部矛盾（custom clamp vs test）を TDD 原則に従って「test pass 優先」で解決（clamp 削除、caller 側で validation すべき旨のメモ）
- **Task 5 (61d9f7b)** — `free-layout.ts` 新規、snap guides / applySnap / bleed detection の純関数 + 8 テスト
- **Task 6 (a0fedfc)** — `auto-layout.ts` に `computeGridLayoutWithVirtualInsert` 追加（drag preview 用）、`auto-layout.test.ts` 新規 9 テスト
- **Task 7 (b19c9d2)** — IndexedDB v5→v6 migration、`BookmarkRecord` に isRead/isDeleted/deletedAt、`CardRecord` に locked/isUserResized/aspectRatio 追加
- **Task 8 (a0bfa59)** — `lib/storage/board-config.ts` 新規、`loadBoardConfig` / `saveBoardConfig` / `DEFAULT_BOARD_CONFIG`、fake DB での 2 テスト
- **Task 9 (ab76cd4 + 348da9a)** — `use-board-data.ts` を全面書き換え。`BoardItem` に freePos / isRead / isDeleted / aspectRatio / gridIndex 追加、`computeAspectRatio` 3 段階優先（isUserResized → cached → 推定）、persistFreePosition / persistGridIndex / persistReadFlag / persistSoftDelete の 4 persist 関数。BoardRoot 互換のため persistCardPosition を @deprecated shim として残存（Task 13 で除去）。後追い fix で コメント精度 + bookmarkId guard + computeAspectRatio の unit test 5 個追加
- **Task 10 (d06b672 + 93b485a)** — `components/board/SnapGuides.tsx` + `.module.css` 新規作成。plan 仕様通り verbatim の純 UI コンポーネント（Figma 風ピンク線 `#ff4080`、vertical / horizontal / spacing の 3 種）、`BOARD_Z_INDEX.SNAP_GUIDES = 25`、プロップは `guides: ReadonlyArray<SnapGuideLine>` + optional `offsetX/Y`。code-quality reviewer の指摘で `: React.ReactElement | null` return type 明示を追加（CLAUDE.md「return type は常に明示」に合わせる）
- **Task 13 (d376136 + 21710bb)** — **plan の順序を入れ替えて Task 11 より先に実装**（Task 11 が layoutMode state を前提にしてて、state 未導入だと動作確認不可だったため）。`BoardRoot` に `layoutMode: LayoutMode` と `frameRatio: FrameRatio` の 2 state 追加、mount 時に IndexedDB の board-config から hydrate（cancelled guard 付き async useEffect）、`handleModeChange` / `handleFrameRatioChange` を useCallback 化。plan Step 2（子コンポへの props 配線）は Task 14 で完了
- **UX polish 4 連発（Task 19 後、ユーザー実機確認 → 即フィードバック反映）**:
  - **(1) 83b99c8** — `BOARD_INNER` constants (max-width 1400 + side-padding 64) 追加、cards 中央寄せ、ResizeHandle hover 時のみ表示 (`hoveredId` + `resizingId` state で active resize 中も持続表示)、Space+drag pan + 中クリック pan を InteractionLayer に追加
  - **(2) fbdf454** — ThemeLayer を offset wrapper の外に分離 (背景 = viewport 全幅キープ、cards のみ中央寄せ)、hydration mismatch 解消
  - **(3) 2fe71d3 + 0e023dc** — Space+drag bug fix: `spaceHeld` state を BoardRoot に lift up、CardsLayer 側で early-bail (no stopPropagation) → InteractionLayer まで bubble、`body.user-select: none` + `e.preventDefault()` で native 選択枠抑止
  - **(4) 4ac1f84** — final fix (Space+drag が完全動作)
  - 全部実機テスト済、tsc clean / 82 vitest pass
- **Task 19 (426c5dc + 849bdb1)** — `Toolbar.tsx` + `.module.css` 新規作成、Shopify.design tier の pill toggle (top-center fixed、backdrop-blur 10px、`#1a1a1a` neutral active state、`rgba(15,15,25,0.1)` violet-tinted shadow)。BoardRoot に mount して `layoutMode`/`frameRatio`/`themeId` 切替がついに動く。FramePresetPopover stub も同時作成 (Task 20 で本実装)。`messages/ja.json` に `board.mode = { grid, free }` + `board.toolbar = { theme, export, share }` 追加。**重要な統合**: BoardRoot の旧 debug theme buttons 削除、`handleModeChange`/`handleFrameRatioChange` の eslint-disable も外して finally 正規 callback として認識される。`handleThemeClick` は theme cycle (localStorage で永続化、IDB themeId は dead state なので TODO コメント残置)。code review approved with minor revisions、polish (849bdb1) で I3 (try/catch + dev-only console.error で IDB 失敗を可視化)、N2 (dead i18n keys 削除)、N3 (sep に `role="separator"` + `aria-orientation`)、N6 (CSS コメントで「neutral chrome / violet edit affordance」分離方針 + 「always-light pill」決定を明文化)、I2 (theme dual-source TODO コメント) を一括対応。残 I1 (theme-aware pill 暗背景対応) は Notion/Figma パターンを採用して常に明るい chrome 維持で確定（後で実機で違和感あれば再考）。82 vitest pass / tsc clean
- **Task 18 (695fe98 + 17d481c)** — `ResizeHandle` を 1 ハンドル → 8 ハンドル化（4 隅 aspect-locked + 4 辺 free-axis）。新 props (`currentW/currentH/aspectRatio/onResize/onResetToNative`) で旧 API を完全置換、CardsLayer の call site も新 prop shape に更新、BoardRoot に `handleCardResetToNative` 追加。**design override**: Booklage 紫枠 + Shopify-tier polish (resting box-shadow + hover scale 1.15 + active scale 0.92 + 120ms ease-out)、JP a11y `LABELS` map で 8 hand の `aria-label` (`角リサイズ（左上）` 等)。**plan のバグも先回り修正**: corner aspect-lock を W 軸固定式 → larger-axis (`Math.abs(dx) > Math.abs(dy)`) に変更、redundant `||` 句簡素化。code review で I1 (毎ムーブ persist で 120Hz re-render の perf 懸念) 発見、17d481c で `onResizeEnd` を再導入 → BoardRoot に `handleCardResizeEnd` 追加して drag-end のみ persist する形に変更。残り I2 (top/left ハンドル drag で位置 anchor が動かない UX 問題) は plan-accepted limitation として L86-90 にコメント、free-mode 統合タイミングで対応予定。82 vitest pass / tsc clean
- **Task 17 (ee4bf85 + d5ca5ae)** — `RotationHandle.tsx` + `.module.css` 新規作成。14×14 白丸 + 12px tick line を選択カードの 24px 上に配置、pointer-capture で角度ドラッグ → 15° snap (Shift で自由) + double-click で reset。**design override**: Booklage 紫 (`var(--color-accent-primary)`) + Shopify-tier polish (resting drop shadow + hover で 4px glow ring + scale 1.08, active で scale 0.96, 140ms ease-out transition)、JP a11y (`aria-label="回転ハンドル"`)。React 19 で global `JSX` 名前空間が消えたので component return type に `ReactElement` 使用。code review で C1 (atan2 wrap-around → ±180° 跨ぐと 360° flip)、I1 (`role="slider"` + `aria-valuenow/min/max` 追加で AT に届く)、I2 (props を `cardCenterClientX/Y` に rename → 座標系を self-document) を発見、d5ca5ae で 3 件まとめて修正。**Task 17 はコンポーネント単独作成のみ — CardNode/CardsLayer への wiring は未来タスク**。82 vitest pass / tsc clean
- **Task 16 (3ee422a + 686ac86 + 0a1b0cd)** — `CardsLayer` に free-drag 状態機械を追加 (FreeDragState / freeDragStateRef / snapGuides)、`gridToFreePosition` を inline helper として作成、`handleCardPointerDown` で grid mode は既存 `useCardDrag` passthrough・free mode は内部 pointer-capture 状態機械に分岐。shift キー window listener で snap on/off リアルタイム切り替え。`displayedPositions` で drag 中のみ該当カードを上書き（render + GSAP `useLayoutEffect` + culling 全部に効く）、morph `useEffect` の deps は `activePositions` のままで drag が mode morph を kick しないよう保護。SnapGuides は `layoutMode === 'free'` 時のみ render。`onPersistFreePos` prop を required で BoardRoot から `useBoardData().persistFreePosition` を配線。**code review で C1 (snap-back 回帰)** 発見 — `persistFreePosition` が IDB だけ書いて local items を更新せず、drag 後に古い `freePos` から再 derive されてカードが元位置に snap back する致命バグ。fix (686ac86) で setItems 追加、followup (0a1b0cd) で setItems を await 前に移動して **optimistic update** 化、これで「同 React 用イベントハンドラ tick 内 batch」によりワンフレームの中間 paint も無し。同時に I2 (setSnapGuides を setFreeDragState updater 内から外出し、Strict Mode 二重実行への備え)、I3 (`onPersistFreePos` 必須化)、N1 (selectedIds deferred の 1 行コメント) も解決。82 vitest pass / tsc clean
- **Task 15 (416966c + 2c0d499 + 2a84b99)** — `CardNode` を outer/inner 2-div 構造に refactor。outer は full-size relative + drag handler、inner は rotation transform + 視覚 chrome (white bg, border, radius) + selection outline。新 props: `rotation?` / `selected?` / `locked?`。**ユーザー承認の design override**: 選択枠は plan の Figma青 `#3080e8` ではなく Booklage brand 紫 `var(--color-accent-primary)` (#7c5cfc) + glow halo `var(--color-selection-glow)` (Shopify.design tier polish)。lock indicator は plan の 🔒 emoji ではなく **Lucide-style inline SVG** (1.75 stroke, conditional render) を `backdrop-filter: blur(6px)` glass chip 内にマウント。a11y: chip に `role="img"` + `aria-label="ロック中"`。spec review で dead `position` prop 削除（2c0d499、Task 14 で wrapper 移管したため不要）。code quality review で nit 7 件中 0 critical/important、polish (2a84b99) で halo を CSS var 化 + JP a11y label 化を反映。82 vitest pass / tsc clean
- **Task 14 (2587634 + 7c68ee5 + 94c80be)** — `CardsLayer` を items + layoutMode 受け取り型に refactor、`gridLayout = computeAutoLayout(...)` を CardsLayer 内に移動、`freeLayoutPositions` で `it.freePos` 優先＋grid fallback、`activePositions` を mode で分岐。`gsap.timeline` で morph 実装。BoardRoot 側は CardsLayer JSX を新 props に差し替え、`cardsForLayer` useMemo 削除、`targetRowHeight` / `layoutGap` を hoist。spec review で dead `renderCardChildren` prop 削除（7c68ee5）。code review で C1（useLayoutEffect が gsap.set で先に最終位置スナップ → morph 無音）と C2（in-flight tween が unrelated re-render で消される）の race を発見、`morphTimelineRef` + `prevModeRef !== layoutMode` / `morphTimelineRef.isActive()` の二重 guard で修正（94c80be）。再 review で StrictMode / rapid toggle / unmount mid-morph 全て OK 確認、approved。**Task 19 で Toolbar 結線するまで無音バグは表面化しない設計だが、先回りで潰した**
- **全 commits** は `claude/b1-placement` ブランチに積まれ **origin に push 済**

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

### B1-placement 残タスク（Task 10-27、次セッション以降）

**UI 層** (Task 11-24):
- Task 11: Grid drop indicator + virtual insert 統合（plan のコード例は現構造と divergence あり、BoardRoot が drag state 持つ形に適応して実装する予定）
- Task 12: FLIP animation (GSAP) for grid reflow
- Task 21: `Frame.tsx` visualizer + desaturation ← **次セッションここから**
- Task 22: `CardContextMenu.tsx` 右クリック
- Task 23: `UndoToast.tsx` + soft delete flow
- Task 24: z-order keyboard shortcuts + lock

✅ **完了**: Task 14 / 15 / 16 / 17 / 18 / 19 / 20 + UX polish 4 連発

**仕上げ** (Task 25-27):
- Task 25: i18n 文字列 15 言語追加
- Task 26: Playwright E2E（6+ シナリオ）
- Task 27: 1000-card パフォーマンス regression

### 次セッション最優先タスク

1. **B1-placement Task 21 (Frame visualizer) から継続** — `.claude/worktrees/b1-placement/` に入って `superpowers:subagent-driven-development` で着手。plan は `docs/superpowers/plans/2026-04-19-b1-placement.md` §Task 21 (line 2651〜)。Free モードで選択された frameRatio の境界線を可視化 + outside 領域を desaturate する UI。Task 20 で `FramePresetPopover` が完成してるので Free モード切替 → preset 選択 → フレーム可視化の流れが繋がる
2. **または Task 11 (Grid drop indicator + virtual insert 統合) を先にやる選択肢あり** — plan の順番だが、Task 11 は BoardRoot 側で drag state を持つ形に「plan のコード例から構造を適応」する必要あり (TODO.md の「plan 順序変更」メモ参照)。Task 21 の方が既存構造に綺麗に乗る
3. **このセッションで保管した重要アイデア**: `docs/private/IDEAS.md` に bath idea 追加済 — **常時 dashboard + focus mode (F キー) + liquid glass 被り** B2 候補、**韓国系参考は失われたまま** (ユーザーが思い出したら追記、2026-04-19 に `ryuri-r` の Postype 記事は発見したが dashboard 参考ではないと確認)。Task 21 直前に IDEAS.md 一読推奨
4. **Privacy 大掃除はもう完了**（バックアップ branch 削除済）— 過去のような worktree orphan 物理削除作業は不要

### 引き継ぎ時の重要メモ

- **Task 4 spec 内部矛盾メモ**: `computeFrameSize({ kind: 'custom', ... })` は現在 clamp しない実装。UI から custom サイズを受ける時は caller 側で FRAME.MIN_PX / MAX_PX に clamp する必要あり（実装時に気をつける）
- **Task 6 テスト extra**: `auto-layout.test.ts` に spec 指定より多い tests が含まれる（既存 `computeAutoLayout` baseline 4 + virtual insert 5）。害はないので削除不要
- **Task 7 DB migration**: worktree で DB_VERSION が 6 になった。master にマージする前に既存 booklage.pages.dev ユーザーの DB が自動 migration される設計（fire-and-forget cursor）。migration 失敗時のフォールバック無しなのは既存 v1-v5 パターン踏襲
- **Foundation + data integration 層 (1-9) と UI 層 (10-27) の境界**: Task 10 から UI 依存が増える。実装中に subagent が NEEDS_CONTEXT で止まる率が上がる見込み。controller は sonnet モデル昇格を検討
- **Task 9 メモ**: code-quality reviewer が指摘した `updateCard` のエラー silent swallow (Important #1) と `dbRef` の weak cast (Minor #4) は deferred。Task 13 (BoardRoot 書き直し) でエラーバウンダリを設計する際に併せて対応する予定
- **Task 10 メモ — 既存 React コンポーネントの return type 欠落**: `components/board/ThemeLayer.tsx` / `BoardRoot.tsx` は return type 未明示。CLAUDE.md「return type は常に明示」に違反。Task 10 の reviewer 指摘で発覚。他の新規コンポーネント（marketing/*, bookmarklet/SavePopup）は `: React.ReactElement` を明示済で整合済。将来の small cleanup で両ファイルに `: React.ReactElement` を追加すれば足りる
- **Task 13 メモ — plan Step 2 は未実装（意図的）**: plan の Task 13 Step 2 は `layoutMode` を `CardsLayer` / `InteractionLayer` / `Toolbar` に props 配線する記述だったが、現時点で各コンポーネントは該当 prop を受け取らない signature。plan 通りに wire すると build が壊れる旨 plan 自身も acknowledge（"signatures may error"）。controller 判断で Step 2 をスキップし、各コンポが必要としたタイミング（Task 14/11/19）で配線する方針に変更
- **Task 13 メモ — handler 未消費の eslint suppression**: `handleModeChange` / `handleFrameRatioChange` は定義済だがまだ UI に wire されてない（Task 19 の Toolbar で消費予定）。`// TODO(Task 19): wire into Toolbar` コメント + `// eslint-disable-next-line @typescript-eslint/no-unused-vars` で一時的に silence。Task 19 時点で必ず消すこと
- **plan 順序変更 — Task 11 ⇄ Task 13**: plan は Task 11 → Task 13 の順だが、Task 11 が `layoutMode` state を前提にしてた（plan のコード例内で `layoutMode === 'grid'` 分岐あり）。state がないと Task 11 の動作確認が不可能だったので Task 13 を先行実装。次は Task 14（CardsLayer mode 分岐）→ Task 11（Grid drag、ただし plan のコード例は CardsLayer が自前で drag state 持つ前提で現構造と不整合なので、BoardRoot が drag state 持つ形に適応して実装）→ Task 12 → 以降 plan 順の順序で進める予定
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
