# 完了済みタスク

新しいエントリは末尾に追加。 古いセッション narrative を集約する場所。
アクティブ backlog は [TODO.md](./TODO.md)、 アイデア・将来構想は `docs/private/IDEAS.md`。

---

## セッション 17 (2026-05-12) — mediaSlots safety net + 動画 tweet FLIP 修正 + 作業習慣 brushup

**前半: mediaSlots safety net + 再 deploy**
- IDB `blocked`/`blocking` handler 実装 + 5s auto-reload + 30s cooldown
- launch 前恒久対策 spec 作成: `docs/specs/2026-05-12-idb-launch-readiness.md`
- feature branch `feat/mediaslots-mix-tweet-backfill` を master に no-ff merge (commit `88a097b`)
- 本番 deploy → 動画 tweet のアニメ bug + ▶ dot サイズ問題判明
- rollback 試行 → IDB v13 → v12 ダウングレード不可で再ロックアウト → v13 再 deploy で復旧

**中盤: 作業習慣 brushup (TODO 肥大 / memory トリガー不在の構造修正)**
- TODO.md を 2102 行 → 157 行に縮減 (active backlog のみ)
- セッション 9-16 narrative + 完了済バグを TODO_COMPLETED.md に archive
- `docs/CURRENT_GOAL.md` 新設 (5-10 行、 Claude が維持、 セッション開始時に最初に読む)
- CLAUDE.md 「アイデアは TODO に追記」 → 「アイデアは IDEAS.md、 TODO 軽く」 に修正
- memory: `feedback_follow_plan` を IF/THEN トリガー形に書き直し
- memory: 新規 3 件 (`feedback_user_urgency_override`, `feedback_irreversible_pause`, `project_idb_irreversibility`)
- memory: stale 1 件削除 (`project_progress.md` MVP Week 1 時代)

**後半: 動画 tweet FLIP 修正 + 縦動画 aspect 修正 + ▶ dot 統一**
- Playwright probe + 一時 instrumentation で root cause 確定: `TweetVideoPlayer` wrapper が explicit width なし → `.media` rect が 0×0 → FLIP startScale = Infinity
- 修正案 1: 横動画は `width: min(920px, 60vw, max-h × aspect)` 明示、 縦動画は `height: min(max-h, 50vw / aspect)` 明示 (片方明示でもう片方は CSS aspectRatio が自動導出 → 黒帯なし)
- ▶ dot サイズ縮小 (Lightbox 10×8 → 6×5、 ● dot 6×6 と統一)
- ボード動画 dot を red-tint → ▶ 三角に統一 (CSS `::after`、 JSX 変更なし)
- `tests/e2e/lightbox-video-flip-regression.spec.ts` 新規 (3 assertions: 横 FLIP / transform 適用 / 縦 aspect 維持)
- 全 e2e PASS、 tsc clean、 ユーザー実機「完璧」 確認

**commits**:
- `d74566d` feat(idb): blocked/blocking handlers safety net
- `9ce0696` docs(spec): IDB 公開前恒久対策
- `88a097b` Merge feat/mediaslots-mix-tweet-backfill
- `e1b289e` docs(workflow): slim TODO.md + introduce CURRENT_GOAL.md
- `db5XXXX` docs(workflow): Claude owns doc maintenance (continued brushup)
- `b3XXXXX` fix(lightbox): restore FLIP open animation for video tweets + unify ▶ dots
- `XXXXXXX` fix(lightbox): vertical-video wrapper preserves aspect (no side black bars)

## セッション 16 (2026-05-12) — mediaSlots 統一型 + 3 段防御 backfill 実装 (事故あり)

- 両 plan 17 タスク + fixup 2 件、 計 21 commits を feature branch で実装
- 本番 deploy → board 表示不能事故 (v12 → v13 IDB upgrade が別タブ旧接続にブロックされ無限待機)
- 復旧: master を 525b9a2 に rollback → ユーザー Chrome 完全終了 → IDB 接続解放 → 旧 build (v12) でブクマ復活

## セッション 15 (2026-05-12) — spec 2 つ + sizing Phase 1

- ✅ **タスク 1**: 動画+画像 mix tweet 対応の brainstorming + spec 作成
   - spec: `docs/superpowers/specs/2026-05-12-mixed-media-tweet-design.md`
   - 主要決定: X 本家踏襲 carousel = mediaDetails API 順序通り / mediaSlots[] 統一型へ移行 / 動画再生中の slot 切替は自動 pause + currentTime 維持 / ドット表現は板上控えめ + Lightbox は ▶ 形 / IDB v12 → v13 bump
- ✅ **タスク 2**: 複数画像 backfill の brainstorming + spec 作成
   - spec: `docs/superpowers/specs/2026-05-12-multi-image-backfill-design.md`
   - 主要決定: 3 段防御 (保存直後 fetch + ボード mount backfill + Lightbox open 救済) / ボード mount backfill は visible カード限定 + rate-limit (並列 3 / 200ms 間隔) / 進捗 UI なし
- ✅ **タスク 3**: サイズ設計 Phase 1 実装 (見た目変化ゼロ)
   - `app/globals.css` の `:root` 冒頭に sizing 基盤 token 追加: `font-size: 16px` / `--container-max: 1489px` / `--text-scale-multiplier: 1` / `--fs-{micro,caption,body,sub,heading,display}` (9-22px)
   - 重要な気づき: 新 font-size token は `--fs-*` namespace で新規 (既存 `--text-body` 等は文字色用途で 13 箇所使用、 同名で上書きすると CSS 崩壊)

## セッション 14 (2026-05-12) — I-07 Phase 1 + サイズ設計哲学策定

- ✅ **I-07 Phase 1 完了** — X (Twitter) 複数画像投稿の hover 切替 + Lightbox carousel 実装 (subagent-driven, 11 tasks)
   - IDB v12 schema (photos field 追加)、 tweet syndication parse で photos[] 全配列取得
   - ImageCard で hover-position 切替 + dot indicator + lazy preload
   - Lightbox で carousel + dot click jump + ↑↓ キーボード nav
   - 既存 X tweet の自動 backfill (Lightbox open 時)
- ✅ **I-07-#4 Lightbox dot 切れバグ修正** (commit `4e26a4d`)
   - 真因: Task 7 で導入した `.tweetMediaCarousel` (img + gap + dots 縦並べ) が `.media` の max-height を 32px 超過
   - 修正: carousel wrapper 撤去、 dots を `.frame` の子として absolute 配置 (bottom: -36px、 chrome-clearance 72px 内)、 glass chip 装飾
- ✅ **サイズ設計哲学策定** (全プロジェクト共通)
   - 成果物: `C:\Users\masay\.claude\design-philosophy-sizing.md` (思想 v2) + `docs/specs/2026-05-12-sizing-migration-spec.md` (AllMarks 移行計画)

## セッション 13 (2026-05-12) — B-#7 自由サイジング調査 (修正は revert)

- root cause 特定: 縮小カード自身は完全に滑らか、 「がくっ」 の正体は周囲カードの reflow burst
- 案 D 試行: リサイズ中だけ FLIP tween を 0.15s → 0.3s に伸長 → peak burst 半減したが副作用 (移動中カードと新位置重なって見える) で revert
- 計測スクリプト: `tmp/playwright-test-resize-neighbors.js` / `-enlarge.js`

## セッション 12 (2026-05-12) — Lightbox open/close 仕上げ

- Backdrop tuning: opacity 0.88 → 0.5、 blur 12px → 8px、 `--lightbox-backdrop-blur` CSS var 化
- Open: clean rect spring morph (`power3.out`、 tilt / blur / multi-tween 全削除)
- `.media` のみ morph (frame 全体 morph から)
- Close ボタン CSS: `transition: opacity` を base から削除、 :hover/:active のみに scope
- Close: 斜め直線 single tween、 `.media img` の object-fit を contain → cover
- Border-radius scale 補正: `DOM_radius = visibleR / current_scale` (X/Y 別個)
- Sub-pixel integer-snap: dx/dy を Math.round で整数化
- 調整ノブ: `OPEN_BASE_DUR`, `OPEN_EASE`, `CLOSE_TWEEN_DUR`, `CLOSE_TWEEN_EASE`, `--lightbox-backdrop`, `--lightbox-backdrop-blur`

## セッション 11 (2026-05-11) — B-#11 source card hide on lightbox open

- destefanis 風「クリックしたカードが lightbox に **なる**」 演出
- `BoardRoot.tsx`: 新 state `lightboxSourceItemId` (初期 click id と現在表示中 id を分離管理)
- `CardsLayer.tsx`: `sourceCardId` prop + `visibility: hidden` + `data-bookmark-id` attribute
- `Lightbox.tsx`: close FLIP 戻り先を `data-bookmark-id` lookup の live rect に変更 (originRect は culled fallback に降格)
- pan/scroll した後でも source card に正しく戻る

## セッション 10 (2026-05-11) — B-#4 Lightbox サイズ違い + 関連 UX 6 段階解決

1. centering 修正: `<Lightbox>` を canvasWrap から canvas 直下へ
2. TopHeader fade: lightbox open 時 opacity 0
3. scale 残留バグ修正: chevron-nav で frame が永続 scale 0.86 になるバグを構造除去
4. envelope 変数化: `--lightbox-media-max-h: calc(100vh - 2*canvas-margin - 2*chrome-clearance)`
5. playOverlay gradient 除去: 0% → 18% black gradient + bottom:56px の段差を完全削除
6. close button frame-attach: × を .frame の子に戻し top:0 right:0 に (Linear / Stripe pattern)

## セッション 9 (2026-05-11) — 拡張機能実機検証 + B-#5/#6/#9

- ✅ **拡張機能実機検証** — 4 系統 (bookmarklet クリック / 拡張ショートカット / 右クリック / PiP 開時) 全 OK 確認
- ✅ **B-#5 Lightbox × 位置固定** — `.backdrop` 直下に移動、 常に backdrop top:16/right:16 固定
- ✅ **B-#6 ESC キー** — 既に実装済を Playwright 確認
- ✅ **B-#9 iPhone 右端切れ (TopHeader)** — `@media (max-width: 640px)` 対応、 mobile は FilterPill + Share のみ
- 39 commits push 済 (long-standing 未 push 状態を解消)

## セッション 7-8 以前 (2026-05-07〜10) — board chrome / 自由サイジング / Plan 2 全実装 etc

詳細省略 (古い narrative)。 git log + spec ファイル参照: `docs/specs/`、 `docs/superpowers/specs/`、 `docs/superpowers/plans/`

---

## 拡張機能 sideload 検証手順 (アーカイブ、 `<all_urls>` host_permission 拡張後の再 sideload)

### A. 拡張機能の再 sideload + 動作テスト (USER-side、 最初に必須)

`<all_urls>` host_permission を加えたため、 Chrome は再インストールでないと新権限を承認しない場合がある。

1. `chrome://extensions/` を開く
2. 既存の「Booklage Saver」 拡張を削除
3. 「パッケージ化されていない拡張機能を読み込む」 → `extension/dist/` フォルダを選択
4. 拡張が再ロードされ、 全 URL 対応の権限承認ダイアログが出るので「許可」
5. テスト 4 系統:
   - bookmarklet クリック (拡張あり) → silent save 成立
   - 拡張ショートカット → cursor pill 正常
   - 右クリック → "Save to Booklage" / "Save link to Booklage" → cursor pill 正常
   - PiP open 状態でショートカット → cursor pill 抑制 + PiP にカードのみスライドイン

### B. 動作確認後の git 操作

- 拡張の最新ビルドを保証するため、 `pnpm extension:build` を deploy 前に実行
- `extension/dist/` は `.gitignore` 対象外、 commit に含める

---

## B0 ボード骨組みリビルド (2026-04-19 完了)

- [x] 6層分離: `BoardRoot` → `ThemeLayer` / `CardsLayer` / `InteractionLayer` → `CardNode` / `ResizeHandle`
- [x] 純関数 `computeAutoLayout` + vitest 8件、 1000カード計算 <16ms
- [x] テーマ: 点線ノート (縦) + 方眼紙 (縦、 白格子)。 `theme-registry.ts` で追加可能
- [x] viewport culling で 1000カード → DOM 66枚、 60.6fps 維持 (Playwright perf spec)
- [x] 装飾完全削除 — card-styles, liquid-glass, sphere, custom cursor, カードスタイル系
- [x] クリーンスレート削除 — 旧 board-client + orphan UI + 依存 lib (11,270行削除)
- [x] Playwright E2E 6件 green (テーマ背景、 カード描画、 wheel scroll、 empty-drag、 テーマ切替、 カードドラッグ)
- [x] 本番品質の justified grid layout + IndexedDB 位置永続化

---

## MVP Week 1 (2026-04-10 完了)

- [x] Task 1: プロジェクト初期化 (Next.js 16 + TypeScript strict + pnpm)
- [x] Task 2: デザインシステム (CSS Custom Properties + constants.ts)
- [x] Task 3: ルートレイアウト (Inter + Outfit フォント + PWA manifest)
- [x] Task 4: URL検出ユーティリティ (テスト付き)
- [x] Task 5: IndexedDB ストレージ層 (テスト付き)
- [x] Task 6: OGPスクレイパー API (Edge Runtime)
- [x] Task 7: oEmbedプロキシ API
- [x] Task 8: ボードページ + Canvasコンポーネント
- [x] Task 9: BookmarkCard + TweetCard
- [x] Task 10: URL入力 + 保存フロー
- [x] Task 11: GSAPドラッグ (位置永続化)
- [x] Task 12: フォルダナビゲーション
- [x] Task 13: 画像エクスポート + SNSシェア
- [x] Task 14: 背景テーマセレクター (9種)
- [x] Task 15: ランダムピック + 色サジェスト
- [x] Task 16: ブックマークレットジェネレーター (テスト付き)
- [x] Task 17: i18n基盤 (日本語 + 英語)
- [x] Task 18: MVP統合テスト (18テスト全通過)

---

## 完了済バグ (旧 §未対応バグ から移管)

- ~~**B-#4 ムードボード ↔ ライトボックス でカードサイズが異なる**~~ ✅ セッション 10 完全 close (上記セッション 10 narrative 参照)
- ~~**B-#5 × ボタン位置固定**~~ ✅ セッション 9 完了
- ~~**B-#6 ESC キー対応**~~ ✅ 既存実装、 セッション 9 で Playwright 確認
- ~~**B-#9 iPhone 右端切れ (TopHeader)**~~ ✅ セッション 9 完了
- ~~**B-#11 Lightbox open 演出: source card 空白化**~~ ✅ セッション 11 完了
- ~~**I-07-#4 Lightbox dot 切れバグ**~~ ✅ セッション 14 末 (commit `4e26a4d`)
