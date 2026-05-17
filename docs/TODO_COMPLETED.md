# 完了済みタスク

新しいエントリは末尾に追加。 古いセッション narrative を集約する場所。
アクティブ backlog は [TODO.md](./TODO.md)、 アイデア・将来構想は `docs/private/IDEAS.md`。

---

## セッション 18 (2026-05-12) — I-07-#1 save 時 backfill 検証 + I-07-#2 hover swap polish

### 前半: I-07-#1 save 時 backfill 検証完了

**判明**: 該当機能はセッション 17 の reapply merge (`2b5f1f3`) で既に master に入っていた。 [SaveIframeClient.tsx:113-126](app/save-iframe/SaveIframeClient.tsx#L113-L126) で fire-and-forget `fetchTweetMeta` → `persistMediaSlots` 実装済。 CURRENT_GOAL.md と TODO.md が古いまま active 扱いで残っていた。

**実施**: 動作裏付けが弱かったので Playwright e2e テストを追加して verify-only で完了扱いに:
- `tests/e2e/save-iframe.spec.ts` に「Phase A: save-time backfill writes mediaSlots to IDB for a tweet URL」 追加
- /api/tweet-meta を route mock (video + photo の mix tweet payload)
- save message post → save:result 受信 → IDB を 5s poll → mediaSlots が `['video', 'photo']` で persist 済を確認
- 3/3 e2e PASS / 453 unit PASS / tsc clean

**結果**: 保存ボタン押下直後にボードを開いた時点で、 既に mediaSlots が IDB に書き込まれている保証ができた (▶ dot / 複数画像 dot が初回 mount から表示される)。

### 後半: I-07-#2 hover swap polish (クロスフェード + brightness lift)

**ブレインストーミング**: 4 方向 (instant / cross-fade / blur / scale+fade) を Visual Companion でモック比較 → **クロスフェード** 採用。 速度 (130 / 220 / 380ms) → **380ms** 採用 (じっとり余韻系)。 destefanis 由来の `:hover filter: brightness(1.08)` lift も併用合意。

**実装**:
- `app/globals.css :root` に 3 デザイントークン追加 (`--card-hover-swap-duration: 380ms` / `--card-hover-swap-easing: ease-out` / `--card-hover-lift-brightness: 1.08`)
- `components/board/cards/ImageCard.module.css` を絶対配置レイヤースタック構造に書き換え。 active layer のみ opacity 1、 残りは opacity 0、 共通 token で cross-fade + filter transition
- `components/board/cards/ImageCard.tsx` を `slots.map(...)` 形に書き換え (各 slot に `<img data-active={...}>`)。 `preloadedRef` + 手動 `new Image()` preload ループは削除 (`loading="lazy"` で ブラウザ任せ)
- `tests/e2e/board-mixed-media.spec.ts` の hover swap assertion を src 比較 → data-active 比較 に書き換え。 brightness lift 用の新 e2e assertion 1 件追加
- `tests/lib/multi-image-hover.test.tsx` を複数 layer に合わせて `activeImg()` ヘルパー導入で書き換え
- Instagram Reel カードは `:not(.thumbInstagramReel)` で lift スキップ (baseline brightness 0.86 と干渉回避)

**spec / plan**:
- spec: `docs/superpowers/specs/2026-05-12-hover-swap-polish-design.md`
- plan: `docs/superpowers/plans/2026-05-12-hover-swap-polish.md`
- Future-readiness 章で B1 multi-video playback との互換性確認済

**結果**: tsc clean / 453 unit PASS / 27+4 e2e PASS / ユーザー本番実機で hover の感触 OK。 デザイントークン化により、 後から数値調整したい時は globals.css の 3 行を書き換えるだけ。

**commits**:
- `XXXXXXX` test(save-iframe): verify Phase A save-time mediaSlots backfill
- `XXXXXXX` docs(spec): I-07-#2 hover swap polish + brightness lift
- `XXXXXXX` docs(spec): note hover swap layered arch enables future multi-playback
- `XXXXXXX` docs(plan): I-07-#2 hover swap polish implementation plan
- `XXXXXXX` feat(tokens): add card hover micro-interaction CSS vars
- `XXXXXXX` feat(board): cross-fade hover swap + destefanis brightness lift


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
2. 既存の「AllMarks Saver」 拡張を削除
3. 「パッケージ化されていない拡張機能を読み込む」 → `extension/dist/` フォルダを選択
4. 拡張が再ロードされ、 全 URL 対応の権限承認ダイアログが出るので「許可」
5. テスト 4 系統:
   - bookmarklet クリック (拡張あり) → silent save 成立
   - 拡張ショートカット → cursor pill 正常
   - 右クリック → "Save to AllMarks" / "Save link to AllMarks" → cursor pill 正常
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

## セッション 19 (2026-05-13) — I-07-#5 Lightbox テキスト reveal アニメ

### 全体の流れ

Phase A 忠実コピー路線の最後の細部、 Lightbox テキストパネルの reveal アニメ。 ユーザー意思で導入決定 (destefanis 本家確認は当初スキップ)。 brainstorming で 5 軸決定 → spec / plan 書き → subagent-driven で 9 task 実装 → 本番 deploy。 deploy 後のユーザー体感フィードバックを 3 回受けて polish iteration、 最終的に **destefanis 完全準拠 + 数値調整版** で着地。

### Phase 1: 初版実装 (9 task, subagent-driven-development)

**brainstorming で決定 (5 軸)**:
- 構造: 3 段 stagger (見出し → 本文 → meta+CTA)
- mechanism: translateY + clip-path + opacity 同時
- start: media FLIP 着地 + 150ms 一呼吸
- duration: 500ms / stagger: 150ms / power3.out
- prefers-reduced-motion: opacity-only fallback

**実装の構造**:
- `app/globals.css :root` に 5 デザイントークン追加 (`--lightbox-text-reveal-*`)
- `components/board/Lightbox.module.css` に `.metaCtaGroup` wrapper class 追加
- `components/board/Lightbox.tsx` で:
  - JSX に `data-reveal-stage` 属性を 9 箇所追加 (3 text component × 3 stage)
  - `sourceLink` を main render から各 text component 内 (`metaCtaGroup` 内) に移動
  - file-level helper 5 関数追加 (`readRevealTokens` / `collectStageEls` / `setStageInitialState` / `appendRevealTimeline` / `getPrefersReducedMotion`) + `RevealTokens` 型
  - open useLayoutEffect の textEl 素 fade を stage 単位の mask reveal に置換
  - close handler に stage tween kill を追加
  - nav useLayoutEffect の onComplete で reveal を再発火

**実装 commit (9 本)**:
- `49fe137` feat(tokens): add lightbox text mask-reveal-up tunable vars
- `7397e8b` feat(lightbox): add .metaCtaGroup wrapper class for stage 3 reveal
- `0ac69ea` feat(lightbox): add data-reveal-stage markers + move sourceLink into text components
- `971c688` feat(lightbox): add reveal token reader + stage helpers
- `43d40b3` feat(lightbox): replace text fade with 3-stage mask-reveal-up on open
- `703e19e` fix(lightbox): kill in-flight stage reveal tweens on close
- `da87e15` feat(lightbox): re-fire mask-reveal-up on nav slide landing

各 task は subagent (haiku / sonnet 使い分け) → spec compliance review → code quality review → 次 task の 2-stage 検証で実装。 全 task で tsc clean / 453 vitest pass。

### Phase 2: polish iterations (ユーザー体感フィードバックで 3 回回す)

**iteration 1 (v1 deploy 直後の fb)**: ユーザー報告 「がたっがたっと不格好に出てきている、 段落で区切らず全部まとめて出してしまっていい、 テキストのアニメーションがほとんど感じられない」

原因分析: 18px × 3 要素 × 150ms 間隔 stagger で各要素の動きが小さく断続的に重なって gata-gata に感じる。 翻って動きが薄味。

対応 (`b9f1213`): 構造を 1 ブロック化、 数値強化:
- duration 0.5s → 0.7s
- translateY 18px → 32px
- pause 0.15s → 0s (即発火)
- stagger 0.15s → 0s (1 要素なので無効)
- `collectStageEls` を `[textEl]` を返す形に書き換え、 JSX から `data-reveal-stage` 属性を 9 箇所削除

**iteration 2 (v2 deploy 後の fb)**: 「カードがライトボックスに配置されてからテキストが出るまで ストップが残っている」、 また 「参考 (destefanis) をしっかり確認してほしい」

destefanis 本家 (GitHub `destefanis/twitter-bookmarks-grid`) のソース実読:
- text 専用アニメは `.lightbox-info` の CSS transition (opacity + translateY **8px**、 duration **0.4s ease**、 `transition-delay: 0.25s`)
- card は Motion One spring (0.45-0.7s) で click 位置から center へ morph
- 重要: **text reveal は card animation の最中** (transition-delay 0.25s から開始 = spring の 35-55% 時点) に発火。 card と text がオーバーラップするので 「カードが止まってから text が出るまでの隙」 が存在しない
- clip-path mask は **使っていない** (translateY + opacity のみ)

対応 (`59c7087`): destefanis 完全準拠の値に揃え:
- duration 0.7s → 0.4s
- translateY 32px → 8px
- easing power3.out → power2.out
- start タイミング `dur + pause` → `dur * 0.5 + pause` (card 中盤から overlap)
- `setStageInitialState` と `appendRevealTimeline` から clip-path 撤去 (translateY + opacity のみ)
- close handler の stage kill コメントを clip-path 撤去後の文脈に更新

**iteration 3 (v3 deploy 後の fb)**: 「もうちょっとだけアニメーションが動いていることを感じたい」 (= 上品 + 動いている感のバランスを少し動き寄りに)

対応 (`53e4040`): destefanis から微増:
- translateY 8px → **16px**
- duration 0.4s → **0.6s**
- start タイミング (`dur * 0.5` overlap) は維持 → ストップは復活しない
- easing / pause / stagger は変えない

→ ユーザー OK 「良い感じでした」。

### 副次的な学び / 検証

- destefanis source 実読は memory の `reference_destefanis_visual_spec.md` の lightbox 章 (line 55-59) を補完: text reveal の挙動は本家でも CSS transition のみ・ overlap・ 8px と、 minimalist 路線
- collectStageEls が `[textEl]` を返す形になったので、 `data-reveal-stage` 属性は不要に。 もし将来 stage 復活させたい場合は JSX に attr を戻し helper を querySelectorAll 形に戻すだけで restore 可能
- ユーザー体感重視のチューニングは spec の数値固定では届かない 領域 → CSS token 化しておいて 1 行ずつ deploy 試行のサイクルが効く

### 触ったファイル

- `app/globals.css` (line 336-347 周辺) — 5 トークン追加 → 値調整 3 回
- `components/board/Lightbox.module.css` — `.metaCtaGroup` 追加
- `components/board/Lightbox.tsx` — file-level helpers + open / nav / close useLayoutEffect の text reveal、 JSX の sourceLink 配置変更

### spec / plan

- spec: `docs/superpowers/specs/2026-05-12-text-mask-reveal-design.md`
- plan: `docs/superpowers/plans/2026-05-12-text-mask-reveal-up.md`

### 確定値 (本番反映済)

```css
--lightbox-text-reveal-duration: 0.6s;
--lightbox-text-reveal-stagger: 0s;
--lightbox-text-reveal-pause: 0s;
--lightbox-text-reveal-translate-y: 16px;
--lightbox-text-reveal-easing: power2.out;
```

start タイミング (open): `dur * 0.5 + pause` (= media FLIP 着地の中盤、 overlap)
nav: slide 着地後に `gsap.timeline({ delay: pause })` で reveal 発火

---

## 完了済バグ (旧 §未対応バグ から移管)

- ~~**B-#4 ムードボード ↔ ライトボックス でカードサイズが異なる**~~ ✅ セッション 10 完全 close (上記セッション 10 narrative 参照)
- ~~**B-#5 × ボタン位置固定**~~ ✅ セッション 9 完了
- ~~**B-#6 ESC キー対応**~~ ✅ 既存実装、 セッション 9 で Playwright 確認
- ~~**B-#9 iPhone 右端切れ (TopHeader)**~~ ✅ セッション 9 完了
- ~~**B-#11 Lightbox open 演出: source card 空白化**~~ ✅ セッション 11 完了
- ~~**I-07-#4 Lightbox dot 切れバグ**~~ ✅ セッション 14 末 (commit `4e26a4d`)

## セッション 20 (2026-05-13) — カード健全性機構 (B-#1/#2 + Lightbox close wheel) + IDB v14

### ユーザー報告の出発点

セッション 19 が CURRENT_GOAL に B-#1/#2/#3 「サムネ系 UX バグ 3 本」 を残して終了。 ユーザーから 4 件の具体的 URL (Instagram reel / labs.noomoagency.com / codepen.io full / pitperform.eu) が 「表示うまくいかない」 と提示され、 加えて Lightbox を ×/Esc で閉じた後の wheel で隣カードへの遷移アニメが一瞬走る bug 報告。

### 真因 3 種類が混在していた

(調査 commit 不要だが、 設計を整理した spec が `docs/superpowers/specs/2026-05-13-card-metadata-health-design.md`)

1. **scraper bug** (2/4): noomo / pitperform は og:image が `/OpenGraph.jpg` 等の相対 URL。 4 つの scraper 経路 (Worker functions/api/ogp.ts / extension/lib/ogp.js / extension/lib/dispatch.js inline / lib/utils/bookmarklet.ts の extractOgpFromDocument + BOOKMARKLET_SOURCE IIFE) のどれも og:image を絶対化していなかった。 favicon は解決していたのに image だけ素通し。
2. **データ薄い** (2/4): Instagram (bot 弾き) / CodePen full (メタタグ不在) は title も image も取れない。 TextCard が hostname だけ出していたが視覚的に弱い。
3. **Lightbox bug**: `components/board/Lightbox.tsx` の wheel + arrow handler が `closingRef.current` を見ておらず、 close tween (~500ms) 中も `nav.onNav()` を発火していた。

### ユーザーとの設計対話で見えた追加要件

「ブクマ先がなくなった時 (投稿削除、 ウェブサイト削除) にもそれが分かる状態に」 + 「リンク切れ自動 tag で削除はかどる」 という提案。 1 万件でも重くないかの試算 → viewport-driven + 30 日経年 + 並列度 3 で年間 ~3000 req/ユーザー、 Cloudflare 無料枠 100k/日に対して影響軽微。

「タグ」 ではなく `BoardFilter` 型に `'dead'` 追加で fold ( internal の `tags` は mood ID 配列で混入は不適切)。 UX 上は 「リンク切れ N 件」 の system filter として mood リスト下に表示。

### 実装プラン (11 task)

`docs/superpowers/plans/2026-05-13-card-metadata-health.md`。 subagent-driven で 1 task ずつ implementer 分離 + spec/quality review。

1. `lib/utils/url-resolve.ts` 共通ヘルパー (resolveMaybeRelative) + 6 vitest
2. `functions/api/ogp.ts` 修正 (Worker 経路の og:image 絶対化 + twitter:image fallback)
3. extension + bookmarklet 経路 3 箇所修正 (extractOgpFromDocument / BOOKMARKLET_SOURCE IIFE / dispatch.js inline)。 BOOKMARKLET IIFE の URI 長 cap を 2100→2200 に bump
4. `components/board/Lightbox.tsx` の wheel + arrow listener に `closingRef.current` guard
5. **IDB v13→v14 schema bump** — `BookmarkRecord` に `linkStatus?: 'alive'|'gone'|'unknown'` と `lastCheckedAt?: number` 追加 (additive のみ、 v11/v12/v13 と同じ no-op upgrade pattern)。 4 件の v14 migration test 追加 + v13 既存 test を `toBeGreaterThanOrEqual` パターンに future-proof
6. `lib/storage/backfill-relative-thumbnails.ts` — 起動時 1 回限りの idempotent cleanup。 thumbnail が `/` `./` `//` 始まりの record を sweep して absolute 化。 use-board-data の初期化 useEffect に dynamic import で wiring
7. `lib/board/revalidate.ts` — `shouldRevalidate(lastCheckedAt, now)` + `RevalidationQueue` (maxConcurrent 3、 id dedup) + `defaultFetcher` (`/api/ogp` 叩いて 404/410=gone, error=unknown)。 BoardRoot に IntersectionObserver wiring (rootMargin 200px) で viewport 入場 + 経年 30 日のカードを queue.enqueue
8. `components/board/cards/MinimalCard.tsx` + `pickCard` routing 拡張 (`hasUsableMetadata` チェック) + ImageCard の `onError` で MinimalCard fallback
9. `components/board/cards/RefetchButton.tsx` — hover-revealed ↻ ボタン (32×32px memory feedback_large_pointer 準拠)。 spin / ✓ / idle の 3 state、 連打抑止。 BoardRoot `manualRevalidate` callback で `defaultFetcher` 直接呼び (queue 経由しない)、 alive 時に `persistThumbnail(_, true)` で stale サムネ自動修復
10. `lib/board/filter.ts` に `'dead'` branch + `BoardFilter` 型拡張 + `tests/lib/filter-dead.test.ts`。 FilterPill UI に 「リンク切れ N」 system entry (count=0 時は非表示)。 `data-link-status='gone'` 属性 + `app/globals.css` で opacity 0.55 + grayscale(60%) + ::after 「リンク切れ」 赤バッジ。 BoardRoot.handleCardClick で gone カードの Lightbox 開きをガード

### Task 12 (全件再チェック設定 UI) は次セッションへ繰越

設定パネル自体が現プロジェクトに未実装。 viewport revalidation + 手動 refetch button で日常運用は充分カバー、 「いま全件チェック」 は将来の設定 UI 実装と合わせて別 spec で扱う方針。

### 教訓

- IDB v14 bump はもう確定 (deploy 後不可逆)。 セッション 17 の lockout 教訓 (`project_idb_irreversibility`) を踏まえ additive only に徹底
- subagent-driven 9 dispatch (impl 1 + review 1 〜 1+2 セット) で全 task 完走。 minor 指摘 (JSDoc 冗長 / bookmarklet URI cap) は inline で即対処、 important 指摘 (observer 再構築 perf) は実害なしで次セッション送り
- code reviewer は時々 「sync cluster の文脈」 を誤解する。 extension/lib/ogp.js + dispatch.js の sync と BOOKMARKLET_SOURCE の sync は別クラスター (前者は MV3 V8、 後者は ES5-safe で訪問者ブラウザ任意) を識別する必要あり
- 「進めて」 「OK」 は agreed steps 実行の意味であり (memory `feedback_user_urgency_override`)、 IDB schema bump のような 「不可逆 + 当初 spec 範囲」 は迷わず実行。 ただし deploy 自体は user 確認を仰ぐ (memory `feedback_irreversible_pause`)

---

## セッション 21 (2026-05-13) — セッション 20 deploy + 再取得 UX 再設計 + Lightbox close 角丸調査 (途中)

### 前半: セッション 20 deploy + 4 URL bug 本番動作確認

セッション 20 末で deploy 未実施だった「カード健全性機構 + IDB v14」 を本番反映。
最初の deploy で out/ が古いままで RefetchButton が消えていない問題 → fresh build + 再 deploy で 162 ファイル uploaded → 本番反映完了。 root cause: `rtk next build` は static export を trigger しない。 必ず `pnpm build` を使うべき (CLAUDE.md 指定済だった)。

検証結果: labs.noomoagency / pitperform の thumbnail OK、 Instagram / CodePen は MinimalCard で identifiable、 Lightbox 閉じ中 wheel スクロールも正しくブロック。 4 URL bug 全解決確認。

### 中盤: hover ↻ refetch ボタン廃止 + Lightbox open trigger で自動再取得

ユーザー観察「↻ ボタンのデザイン悪い、 30 日 viewport 自動でほぼ網羅されてるなら不要では?」 から再設計。 さらに「OGP 変更された時に自動更新されないのは悲しい」 「Lightbox 開いた時に最新化できないか?」 を受けて、 **intent-driven revalidate** を実装:

- `lib/board/revalidate.ts`: `THIRTY_DAYS_MS` → `REVALIDATE_AGE_MS = 7 days` (export 化)
- `components/board/BoardRoot.tsx`: shared `RevalidationQueue` を `useRef` で hoist、 `handleCardClick` / `handleLightboxNav` / `handleLightboxJump` で `revalidateOnIntent` 呼出
- nav (wheel scroll) は **300ms trailing debounce** — 高速スクロール中は fetch ゼロ
- alive 結果で **thumbnail も自動 heal** (`persistThumbnail(id, image, force=true)`) → OGP 側で og:image 差し替えても気付ける
- `components/board/cards/RefetchButton.tsx` + .module.css 完全削除、 `CardsLayer` の `onRevalidate` prop + RefetchButton render 削除

commit: `b432df9 feat(health): intent-driven revalidate on Lightbox open + 7-day cadence`

### 後半: Lightbox close の角丸 「間に合っていない」 問題 (未解決のまま revert)

ユーザー観察「カードが元の位置に戻る際の角丸の修正が間に合っていない」。 段階的に 3 回試行:

1. **49f20d3** — radius tween を position tween から decouple (0.30s power3.out で 50ms 前完走) → 改善せず
2. **8e43648** — radius を text-fade window 内に pre-roll (0.08s power2.out)、 source card の `--card-radius` を DOM から実値読み取り (formula drift 排除) → 改善せず
3. **cf6b8d1** — destefanis 方式に転換: `scale` → `width`/`height` 直接アニメ、 `.media` を `position: fixed` で flex 離脱、 内側 img を 100%×100% cover に統一 → **アニメーションが壊れた**

#### destefanis 方式失敗の root cause (途中まで判明)

`.frame` の **`will-change: transform`** (Lightbox.module.css L85) が **`position: fixed` の containing block を作る**ため、 viewport 基準でなく `.frame` 基準で位置決めされていた。 `position: absolute` + `.frame`-local 座標に修正 + `.frame` 自体も width/height 固定して shrink 防止 — まで実装したが、 Playwright 検証で `.media` が**まだ source card 位置にジャンプ**する症状残存 (timing 由来の可能性大、 未確定)。

→ commit `3f2115c` で revert、 本番は `8e43648` 状態 (pre-roll radius、 動き正常、 AA 差は微妙に残る) に巻き戻し済 + deploy 完了。

#### destefanis 本家調査結果 (`https://github.com/destefanis/twitter-bookmarks-grid`)

- 単一 `app.js` (24KB) + `style.css` の最小構成
- **Motion One** で spring animation
- 核心: `lightboxClone = el.cloneNode(true)` でカードを複製、 body に append、 `width`/`height` を直接 animate、 `transform: translate3d` で位置だけ動かす
- カード自体は `visibility: hidden` で隠す
- border-radius は 24px CSS 固定、 アニメ中 native レンダリング → GPU resample AA 問題ゼロ

#### 残課題 (次セッション以降)

ユーザーは「ボードカードのリッチ機能 (ホバー切替、 将来の動画同時再生) は維持しつつ、 destefanis 方式で animation を最高品質にしたい」 と希望。 技術的に可能 (clone はアニメ用スナップショット、 ソースカードは触らない) だが、 4-6h 級の本格リファクタ → **別 spec を立てて専用セッションで取り組む**ことで合意。

### memory に追記すべき教訓

- **`pnpm build` を使え** (`rtk next build` は static export しない → 古い out/ を deploy してしまう)。 既存 CLAUDE.md L91-93 で指定済だった、 守れていなかった
- **`will-change: transform` は position:fixed の containing block を作る** (MDN 検証済)。 destefanis 方式実装時の最初の罠
- **destefanis の核心は cloneNode(true) + body append**。 .frame 階層の transform/perspective/will-change の組み合わせ罠を全部回避する

### sub-summary

- master HEAD: `3f2115c` (= cf6b8d1 revert)
- 本番 deploy 済 (`booklage.pages.dev` で動作確認済、 close 動き正常)
- ↻ ボタン廃止 + 7 日 cadence + Lightbox open auto revalidate は ship 済 + 動作確認済
- close 角丸 AA 問題は**未解決**、 destefanis 方式リファクタで解く方針合意、 次セッション以降の spec 作業から
- vitest 484 / tsc / build 全 clean

---

## セッション 22 (2026-05-13) — E (角丸 24px fixed) + F (サイズ / ギャップスライダー) + clone refactor spec

セッション 21 で合意した A-G の前提作業 (E + F) を片付け、 次々セッション向けの clone refactor spec を起こした。 ユーザーは「途中で確認はせず案 b で一気に進めて」と判断、 1 commit + 1 deploy にまとめた。

### E. 角丸 24px fixed 化

destefanis 本家準拠で、 全カードと Lightbox を **24px 固定**に統一。 これで open/close で radius 数値変化がゼロになり、 GPU resample 由来の AA 差は構造的に発生しない (= 次々セッションの clone refactor で「border-radius を animate しない」 最小実装が可能に)。

変更:
- [app/globals.css:350](app/globals.css#L350): `--lightbox-media-radius: 6px` → `24px`
- [CardsLayer.tsx:448](components/board/CardsLayer.tsx#L448): `Math.min(24, Math.min(p.w, p.h) * 0.075)` → `'24px'` 固定
- [ShareFrame.tsx:212](components/share/ShareFrame.tsx#L212): 同じ formula を `'24px'` 固定に (ShareFrame は将来作り直しもあり得るとユーザー了承)
- [Lightbox.tsx:447-457, 728-729](components/board/Lightbox.tsx#L447): `openCardRadius` / `cardRadiusValue` 計算を 24 固定値に。 interpolation ロジック自体は temporary に残置 (両端 24 = 視覚的 no-op、 destefanis refactor 時に削除)

味の変化: 小カードがぽってり丸くなる。 ユーザー受容、 「業界標準値 24px、 ぱくり懸念なし」 と合意済 (memory `project_phase_a_decisions` の destefanis 忠実方針と一致)。

### F. サイズ / ギャップスライダー化

5 段階 SizeLevel を完全廃止、 連続 px 値に。 ギャップも 18px 固定 → 連続 px 値に。

新規 component:
- [SizeSlider.tsx](components/board/SizeSlider.tsx) — `W <slider> 280` (デフォルト 280px、 range 120-720)
- [GapSlider.tsx](components/board/GapSlider.tsx) — `G <slider> 18` (デフォルト 18px、 range 0-60)
- [WidthGapResetButton.tsx](components/board/WidthGapResetButton.tsx) — `DEFAULT` ラベル、 両 slider を default に戻す。 default 状態だと disabled (薄く表示)
- [SliderControl.module.css](components/board/SliderControl.module.css) — 共通 slider スタイル、 32×32 px のヒット領域 (memory `feedback_large_pointer`)、 visible thumb は 12×12 px

削除:
- `components/board/SizePicker.tsx` + `.module.css` + `.test.tsx`
- `lib/board/size-levels.ts` + `.test.ts`

state:
- [BoardRoot.tsx:106-117](components/board/BoardRoot.tsx#L106): `cardWidthPx` / `cardGapPx` state 追加、 clamp ヘルパ、 reset handler
- localStorage キー: `booklage:card-width-px` / `booklage:card-gap-px` (旧 `booklage:size-level` は廃止、 古いキーは無視)
- 自由リサイズ済カード (`customWidths[id]`) の挙動は維持: slider はそれらに影響を与えない (memory `feedback_free_size_decided` 確定仕様遵守)
- skyline layout の `gap` を `cardGapPx` 参照に変更

ラベル選定: 「W / G」 (memory `feedback_ui_vocabulary` = UI text は世界共通英語語彙)。 「DEFAULT」 はリセット意味で短く強い語、 ResetAllButton (RESET + count) と並んでも区別がつく。

### 次々セッション向け spec 起こし

[docs/specs/2026-05-14-lightbox-clone-refactor.md](docs/specs/2026-05-14-lightbox-clone-refactor.md) 作成。 destefanis 本家の cloneNode(true) + body append + width/height + position:fixed 構造を、 mediaSlots / customCardWidth / thumbnail healing 等の board 機能を一切壊さず Lightbox の open / close / 内部 nav 3 経路に適用する spec。 E + F が前提に揃ったことで、 当初見積 4-6h を 2-3h 級に圧縮見込み。

着工前の前提チェック 5 点 (master HEAD / radius 統一 / slider 動作 / 本家ソース読み直し / 既存機能スクショ保存) を spec 末尾に明記。

### コメント整理 (動作影響なし)

5 ファイルの「SizePicker」 言及を「size slider」 に置換 (BoardRoot / CardsLayer / TopHeader.module.css / ResetAllButton)。 残り 4 ファイル (use-board-data / indexeddb / CardCornerActions / TopHeader.module.css 他) は Read 必須エラーで scope creep 回避でスキップ。 全て JSDoc コメント、 動作には無関係。

### memory 追記

なし (今回の変更は memory 化するほどの一般化はなく、 spec ファイルで十分)。

### sub-summary

- master HEAD: 本 commit (E + F + spec)
- 本番 deploy 済 (`booklage.pages.dev` に reflect、 ユーザー視覚確認待ち)
- close 角丸 AA 違和感は radius 数値変化がゼロになったので**根本消滅したはず** (clone refactor 前でも改善する) → ユーザー目視確認予定
- サイズ / ギャップスライダーで「カード幅と隙間」 を絶対 px 値で連続調整可能に
- vitest 477 / tsc / build 全 clean (テスト総数は 484 → 477、 size-levels 関連 7 件削除分)

---

## セッション 23 (2026-05-14) — スライダー 3 連バグ潰し + B-#17 Lightbox clone refactor

### 前半: スライダー問題の構造的修正

セッション 22 の deploy をユーザー視覚確認した結果、 3 つの問題が報告された:
1. close 終盤の「角が成形されなおされる」 違和感が**まだ残っていた** (ユーザー仮説: Lightbox 表示中の radius が違うのでは?)
2. W スライダーが 10 単位刻みでしか動かない、 右の空間を使えていない (画面左寄せ)
3. G スライダー (カード間ギャップ) は完全に動かない

#### 問題 1 の真因と判定
ユーザーの仮説「Lightbox の角丸が違う」 が**技術的に裏付けられた**: Lightbox.tsx は transform: scale で animate しているため、 動的に逆スケール補正値で `borderRadius` を毎フレーム書き換えている (L498 / L778)。 これが GPU resample と DOM 補正の競合で close 終盤の AA チラつきを生む。 **セッション 22 で CSS 変数を 24px に揃えただけでは消えない構造的問題**、 B-#17 clone refactor (transform: scale 撤去) でしか根治不可。

#### 問題 2 の修正
- SizeSlider.tsx L25 `step={10}` をハードコードしていた → `step={1}`
- GapSlider.tsx L25 `step={2}` → `step={1}`
- SliderControl.module.css `.range` width 90px → 200px (= 1 マウス px あたりの step 数を約 2.2 倍精細化)
- ユーザーは「マウスの動きより slow に動く工夫」 まで要求 → ネイティブ range slider では実現不可、 pointer event ベースのカスタム slider を別装飾セッションで実装する旨を IDEAS.md に保管 ("E. スライダー精度の遊び")
- ユーザーが「数字表記の遊び (130 → 0.0130 等)」 も提案 → 装飾セッションでまとめて対応

#### 問題 3 の真因と修正
**CardsLayer.tsx が独自に `computeSkylineLayout` を呼んでおり、 4 箇所で gap を `COLUMN_MASONRY.GAP_PX` (固定 18) で渡していた**。 BoardRoot の cardGapPx は実は表示に反映されていなかった (= 計算は走っていたが結果が使われていなかった)。 修正:
- CardsLayerProps に `cardGapPx` を追加
- 4 箇所 (masonryLayout / previewMasonry / drag simulator / drop final layout) の固定値参照を置換
- useMemo / useCallback の依存配列に `cardGapPx` を追加
- BoardRoot から `cardGapPx={cardGapPx}` を渡す
- 不要になった `COLUMN_MASONRY` import を整理

#### default W の確定: 280 → 267
ユーザーが「pre-slider 時代の Size 3 で 5 列が美しく埋まっていた、 それを default にしたい」 と発言。 私が当初 `CARD_WIDTH_DEFAULT_PX: 280` で「ぴったり 5 列」 と推定したが、 ユーザー目視は 267 が正解。 推測でなく実測で詰めるべく、 ユーザーに DevTools で `canvasWrap.clientWidth` を測ってもらった結果 **1429px**。 私の 1489 (window inner width 想定) が間違いだった真因は:
- canvas-margin 24px ずつ控除 (= -48px)
- Windows Chrome scrollbar 制御で残り 12px 差
- → effectiveLayoutWidth = 1429 - 18 (SIDE_PADDING ×2) = **1411**
- 5 列ぴったり値: `(1411 - 4*18) / 5 = 267.8` → floor で **267** (268 だと 5 列目が 1px はみ出て 4 列に降格)
- ユーザーの懸念 (b)「window 表示エリア基準で計算していないか」 への明確な回答: viewport.w は黒い canvasWrap.clientWidth で測っている、 window inner width は使っていない
- ただし「default 267 はユーザー個人環境にのみぴったり」 = 別 PC では別 default が必要 → **論理キャンバス案** (固定幅 + window 余白で中央寄せ) を IDEAS.md に保管 ("G. 論理キャンバス案")

### 中盤: B-#17 Lightbox clone refactor

着工前 5 点チェック (CURRENT_GOAL.md spec) を実施:
1. master HEAD に E + F + spec → ✅
2. `--card-radius: 24px` / `--lightbox-media-radius: 24px` → ✅
3. SizeSlider / GapSlider 本番動作 → ✅ (ユーザー視認、 5 列再現確認)
4. destefanis 本家 app.js L270-459 を読み直し → ✅ (= cloneNode → body 直下 → width/height/translate3d で animate のパターン把握)
5. mediaSlots / customCardWidth / thumbnail healing → ユーザー手元確認可能で省略

実装:
- Lightbox.tsx の上部に `ensureCloneHost()` helper を追加 — body 直下に `<div id="lightbox-clone-host" />` を常駐、 z-index 150 で frame の下、 zero-sized fixed shell + pointer-events:none
- `createLightboxClone(sourceCard, rect)` helper — source の inline style 全削除 + position:fixed + width/height/top/left を引数 rect でセット + data-bookmark-id 削除 + 削除 × / リセット ↺ / リサイズハンドルを querySelectorAll で remove (= clone は純粋な visual proxy)
- open path (L703-816) 書き換え:
  - source card を `[data-bookmark-id]` で querySelector → source rect 取得 (= 既存の originRect ではなく live rect 優先、 scroll 追従)
  - clone を host に append → GSAP `to` で top/left/width/height を mediaRect へ animate (transform: scale + radius interpolation を完全撤去)
  - `.media` は opacity:0 で待機、 onComplete で opacity:1 + clone remove (instant swap)
  - text reveal / closeBtn fade / backdrop fade は既存ロジック維持
- close path (L420-580) 書き換え:
  - mediaEl の現在 rect で fresh clone 作成 → host に append
  - `.media` opacity:0 で隠す
  - clone を source rect へ animate
  - landingAt - CLOSE_REVEAL_LEAD で onSourceShouldShow 発火 (= BoardRoot が source visibility 復元)
  - onComplete で clone remove + onClose
- internal nav (wheel scroll で隣カード) は触らず、 既存 transform:scale ロジックのまま (= 別 follow-up)

### 後半: 退行報告 → instant swap への収束

ユーザーが本番確認した結果 2 つの問題報告:
1. **× ボタンが clone と一緒に come along** → `data-visible="true"` 属性が cloneNode 経由で複製、 opacity 0.78 で表示されていた → `createLightboxClone` で削除 ×・リセット ↺・リサイズハンドルを `querySelectorAll().remove()`
2. **YouTube カードで「カクッ」** → clone (= 縦長カードのサムネ) と `.media` (= 16:9 iframe with 黒帯) は表示が物理的に違うので instant swap で見た目ジャンプ → 一旦 0.18s cross-fade で対応 ship

ユーザー再確認: 静止画でも cross-fade で**背景が透けて見える**問題発生。 cross-fade 中は両方 opacity:1 未満 → backdrop (半透明) が透ける数学的限界。 → **cross-fade を撤去して instant swap に戻す**。 静止画は完璧、 動画は「カクッ」 が残るが「再生ボタン overlay 方式」 別 spec で根治する判断 (= [docs/specs/2026-05-14-lightbox-play-button-overlay.md](./specs/2026-05-14-lightbox-play-button-overlay.md) 新規作成)。

### deploy

セッション 23 中に 5 回 deploy:
- `52d479c0` step=1 / track 200px
- `6edc6c1e` G slider fix
- `12157f50` default W 267
- `9cc5c75e` B-#17 clone refactor
- `ea61498c` strip card chrome + cross-fade
- `428cef71` instant swap (現本番)

### memory への昇格

なし (= 全体としてはセッション固有の経過、 一般化する話は IDEAS.md と spec に集約済)。

### sub-summary

- master HEAD: 2 commit (`slider fixes` + `B-#17 lightbox clone refactor`)
- 本番 `booklage.pages.dev` deploy 済 (`428cef71`)
- 静止画カードの Lightbox 開閉が完璧に滑らかに、 close 角丸 AA 違和感は構造的に根治
- 動画カード (YouTube 等) は「カクッ」 が残るが、 再生ボタン overlay 方式 spec で根治予定
- スライダー 3 連バグ全て修正、 default W 値はユーザー実機での厳密な逆算で確定
- vitest 477 / tsc / build clean

---

## セッション 24 (2026-05-14) — 動画カードのカクッ根治 + open animation 揺れの根本原因特定

### 前半: B-#17-#2 動画カードの「カクッ」 を board-aspect poster box で根治

セッション 23 末で残った課題: YouTube カードを Lightbox で開く瞬間、 clone (= board card のサムネを cover) と `.media` (= 16:9 box + サムネを cover で詰める) の見た目差で「カクッ」 と切り替わる。 spec [docs/specs/2026-05-14-lightbox-play-button-overlay.md](./specs/2026-05-14-lightbox-play-button-overlay.md) では「Play overlay 押下まではサムネ維持」 を提案していたが、 ユーザーの真意は別だった。

**ユーザーの真意確認** (= 3 ラウンドの対話で解像度を上げた):
- 当初 Claude の解釈: 「Play overlay を fade-in する」 (= 表面的な誤魔化し)
- ユーザー真意: **「board card と完全に同じ aspect・同じ crop で Lightbox に grow させてほしい」**。 Play overlay を重ねるのは OK、 押下後に iframe が出て 16:9 にカクッとなるのも OK (= 操作直後だから許容)
- 結論: `.media` の動画カード rendering 構造を、 board card と同じ「サムネ + 自然 aspect」 に揃える根治

**実装** (= `feat(lightbox): preserve board card aspect during open animation`, commit + deploy `e690033d`):
- `lib/share/lightbox-item.ts`: `LightboxItem` 型に `aspectRatio?: number` 追加、 `normalizeItem` で BoardItem の aspectRatio を素通り
- `components/board/Lightbox.tsx`:
  - `EmbedPoster` を `EmbedPosterBox` (= 動的 aspect 持ち wrap) + `EmbedPlayButton` (= 共通 Play UI) に分割
  - YouTubeEmbed: `hasInteracted === false` 時に `EmbedPosterBox` で render、 押下後に既存 `iframeWrap16x9` / `iframeWrap9x16` + iframe mount に切替
  - TikTokEmbed: `tier === 'poster'` 時に `EmbedPosterBox`、 video / iframe tier はそのまま
  - InstagramEmbed: `EmbedPosterBox` + Instagram で開く link badge を子に
- `components/board/Lightbox.module.css`:
  - 新規 `.embedPosterBox` class — `aspect-ratio: var(--item-aspect, 16/9)` で動的、 width clamp に `calc(var(--item-aspect) * var(--lightbox-media-max-h))` を含めて envelope 内に収まる
- `lib/share/lightbox-item.test.ts`: fixture に aspectRatio 期待値追加 (2 件)
- 検証: tsc clean / vitest 477 全パス / build 22 routes
- ユーザー実機確認: 全動画種別 (YouTube / Shorts / TikTok / Instagram) で open 時のカクッ消滅、 Play 押下後の iframe 切替もユーザー許容

### 後半: open animation の「揺れ / FPS 低い」 感 → backdrop-filter blur が真犯人

ユーザーが新たに報告: 「Lightbox にカードが来る時に若干揺れているような、 FPS が低いような感じがある。 徹底的に手を抜かずに調査したら原因が分かりそう?」

systematic-debugging skill で Phase 1 (Root Cause Investigation):

1. **コード精査**: open animation は B-#17 clone-based、 GSAP timeline で top/left/width/height + backdrop opacity 0→1 (`OPEN_BACKDROP_FADE_DUR = 0.42s`) + text reveal stagger を並行発火
2. **destefanis 本家との比較** (= `C:/Users/masay/AppData/Local/Temp/destefanis-app.js`): `backdrop-filter` / `blur(` grep で **0 件**。 本家には全く blur なし
3. **我々の実装**: `.backdrop` (z-index 300) に `backdrop-filter: blur(8px)` あり、 viewport 全面サイズ
4. **ユーザー環境**: DPR 2.58 (4K + 200% × 130%)
5. **症状の機序仮説**:
   - backdrop は z-index 300、 clone は z-index 150 (= clone が backdrop の**下**)
   - アニメ中 backdrop は opacity 0→1 で fade-in 状態 → element は描画されている → backdrop-filter active
   - 各フレームで「動く clone を blur した結果」 を re-compute → opacity α で composite
   - 結果として「sharp clone + blurred clone」 が α 比率で混ざる → 二重像 → 動くごとに ずれる → 「揺れ」 として知覚
   - 加えて viewport-size × DPR 2.58 の paint cost で frame drop → 「FPS 低い」 感覚

**git history で blur 導入経緯を確認** (= ユーザー質問「なぜブラーが入ってた?」 に対する事実回答):
- `a1fa6dc` (2026-05-02): 最初の Lightbox 実装で blur 12px を導入 (ユーザー + Claude 共同設計)
- `33682191` (2026-05-11): destefanis 本家を参考に大幅シンプル化 (tilt 削除等) したが、 commit message に「values left distinct so the project keeps its own character (subtle back.out spring on open, 8px backdrop blur, etc)」 = 「AllMarks の個性として 8px blur は意図的に残す」 とあり

**ユーザー判断**: 「ブラー不要、 暗くするだけで OK」 (= AllMarks 個性として残す必要なし、 destefanis 方式と同じく半透明の暗さだけで深さ表現で十分)

**実装** (= `perf(lightbox): drop backdrop-filter blur to eliminate open-anim shake`, commit + deploy `4156d88d`):
- `components/board/Lightbox.module.css` の `.backdrop` から `backdrop-filter` 2 行を削除、 削除理由のコメントを残した (= 将来 theme として復活する想定で `--lightbox-backdrop-blur` 変数は globals.css に残置)
- `--lightbox-backdrop: rgba(0,0,0,0.5)` の暗さはそのまま (= 1 行調整でいつでも濃淡変更可能)
- 検証: tsc clean / vitest 476 (BroadcastChannel 1 件 flaky、 isolated で PASS、 私の変更と無関係) / build 22 routes
- ユーザー実機確認: **「とてもよくなりました!!」** — 仮説 A 確定

### 学び (memory への昇格対象 — 別途 update 検討)

- **backdrop-filter の paint trap**: viewport-size + 動的コンテンツがフィルタ要素の後ろ + 高 DPR、 この三条件が揃うと Chromium で深刻な frame drop が出る。 destefanis 本家が回避していたのは経験的な選択
- **「AllMarks の個性として残す」 判断は再検討必要**: ガラス系の演出は LiquidGlass テーマで集中投入する方針 (memory `project_liquidglass_as_theme`)。 default chrome の backdrop には不要

### deploy

セッション 24 で 2 回 deploy:
- `e690033d` board-aspect poster box (動画カード「カクッ」 根治)
- `4156d88d` drop backdrop-filter (open animation 揺れ根治) ← 現本番

### sub-summary

- master HEAD: 3 commit (= 動画カード aspect 統一 + backdrop blur 削除 + close-out)
- 本番 `booklage.pages.dev` deploy 済 (`4156d88d`)
- B-#17 関連で残っていた最後の体感問題 2 つ (動画カクッ + open 揺れ) が両方根治
- 静止画・動画ともに「board card がそのままぬるっと大きくなる」 体感を実現
- vitest 477 (BroadcastChannel 1 件 flaky を除く) / tsc / build clean

---

## セッション 25 (2026-05-14) — 動画 dot 再デザイン + 背景タイポ + Lightbox open/close clone 構造の根治

### 1. 動画 dot indicator 再デザイン (= 丸の中を三角で切り抜き、 ユーザー発案)

過去ブレストの 7 候補 (A 横カプセル / B 二重丸 / C 中抜き丸 / D 縦バー / E パルス / F 二重リング / G 超小三角) を比較ページに並べる方針を提示したが、 ユーザー自身が「丸の中を三角形でくり抜く」 アイデアを発案 → 一発採用。

- `ImageCard.module.css` の `data-slot-type='video'` を SVG mask 方式に書き換え (= path で円 + 三角 evenodd fill-rule、 background-color で fill 制御)
- `Lightbox.module.css` の同 selector も同様に書き換え
- `Lightbox.tsx` の不要 span 子要素 (`lightboxImageDotVideoIcon`) を削除

途中ハマり: **Chromium で `mask-image` を click 要素本体に当てると hit area が masked shape に縮む** という罠 (= Lightbox dot の 24×24 hit area が 6×6 disc-minus-triangle に collapse、 ユーザー指摘で発覚)。 修正: mask を `::after` pseudo に逃がす + button 本体は透明 unmasked。 memory: `reference_mask_image_pointer_events.md` に保存。

### 2. 背景タイポでタグ名表示 (= 新機能、 IDEAS.md §H ベース)

board の背景に巨大タイポでタグ名 (or 「すべて」 → "AllMarks") を表示する Apple TV+ 風 hero。 ユーザーが「後でいろんなアニメーション (DVD bounce / glitch / 数増し / 横流し / カード起こす風で揺れ) で遊べるよう拡張可能構造で」 と要望。

- 新規 component `components/board/BoardBackgroundTypography.tsx` + module CSS
- `variant` prop で animation 切替の枠を予約 (= 'static' のみ実装、 `'dvd-bounce' / 'glitch' / 'multi' / 'marquee' / 'card-wind'` は CSS selector slot のみ予約)
- URL query `?bgtypo=<variant>` で切替できる仕込みも入れた
- フォントは **Geist Semibold (600)** (= Phase A 確定済の Geist 一族で統一感)
- text content: `'all'` → `"AllMarks"` / `'inbox'` → `"Inbox"` / `'archive'` → `"Archive"` / `'dead'` → `"Dead Links"` / mood タグ → mood.name
- `BoardRoot` で ThemeLayer wrapper と cards wrapper の間に挿入 (= viewport-bound、 cards が前面、 ヘッダー上には出ない)

ハマり 1: 初期実装で `.host` に `z-index: 2` を当ててしまい **タイポがカードの前面に出る** バグ。 cards wrapper の translate3d による stacking context の罠 (= z-index は同じ stacking 内でしか比較されない)。 修正: z-index 指定削除 → DOM 順序のみで cards が前面に。

ハマり 2 (= ユーザー指摘): 1 番目の Apple TV+ 構造ベタ写しは「destefanis 哲学に近い individual な個性」 が無い、 ただし「自由配置連動」 ら polish 系は今やらない、 シンプル「タイポ + AllMarks ロゴ表示」 で確定。

IDEAS.md §H に animation variant ブレスト詳細を追記 (= ユーザーが言ってくれた DVD bounce / glitch / multi / marquee / card-wind の各イメージを具体保管、 次以降のセッションで「これやって」 と言えば即着手可)。

### 3. Lightbox open/close clone 構造の連鎖再 work (= 3 段階)

ユーザーが「画面で見切れているカードを click すると、 open animation 中に clone が canvas 外まで飛び出る」 と発見。 過去 (= B-#17 destefanis-style clone refactor、 セッション 23) で clone を body 直下 portal に変更した時から潜在していたバグ。

#### 3-A. clip-path 追加 (= 最初の試行、 失敗)
- clone host (= body 直下 fixed) に clip-path: inset(...) で canvas rect 内に clip
- anchor を `.canvas` (= TopHeader 含む) に設定してしまい、 clone が **TopHeader 上を通る**バグ → ユーザー指摘で `.canvasWrap` に anchor 移動 (memory `feedback_verify_layout_before_clipping.md` 保存)
- さらに「物理的に同じ世界の住人として fade band も通る」 と mask-image gradient 追加
- ↑ ただし fade overlay は Lightbox open 中 unmount される gate あり、 mask は実質効かない → fade overlay gate を撤廃 + そのまま mask を当てた状態で deploy
- 結果: 「fade が変に残ってアニメがダサい」 「Lightbox に出てきてもしばらくカード暗い」 ユーザー報告

#### 3-B. 方式 B (= clone host を canvasWrap 内 portal、 hack 全削除)
- ユーザー指示「徹底的にベストプラクティス探そう、 本家どうなってる?」 → memory `reference_destefanis_visual_spec.md` 再読み → **本家は source-card transform + Motion One spring** で clone を使わない、 だから canvas overflow:hidden で自動 clip + fade band 自動適用
- AllMarks の clone 方式 (= B-#17、 border-radius sharp 維持のため意図的選択) は本家とは別実装、 ただし clone を **canvasWrap 内 portal** に move すれば canvas 自身が clip 担当
- 実装: ensureCloneHost を body 直下 → canvasWrap 内 absolute portal、 clone 座標を viewport → host-relative に変換、 `updateCloneHostMask` 等 hack 全削除、 fade overlay 自体も削除 (= destefanis 本家にない、 ScrollMeter で代替)
- ↑ ただし `.backdrop` (z 300) が canvasWrap (z auto) の sibling、 stacking 比較で **backdrop が clone host (z 30) の上**にいて、 clone がアニメ中に dim される新バグ発生
- ユーザー「最近の修正で明らかにカードの挙動が変わった」 指摘 (memory `feedback_check_reference_before_patching.md` 保存)

#### 3-C. 方式 β (= backdrop を dim layer + stage layer に split、 確定形)
- `.backdrop` は dim 専用 (= z 100、 半透明黒 + opacity fade + close handler)
- 新規 `.stage` (= z 300、 perspective + overflow + grid centering + 全 children) を sibling として split
- `clone host` を z 200 に上げて、 backdrop (100) < clone (200) < stage (300) の 3 層構造
- `.frame { pointer-events: auto }` で stage 内の透明領域は backdrop に透過、 frame 内は click 受ける
- `.backdrop:hover .navChevron` → `.backdrop.open:hover ~ .stage .navChevron` (= sibling combinator)
- ユーザー実機確認: **「OK 直った!!!!!!!」**
- 結論: 本家と 100% 同等ではない (= backdrop blur 無し + Motion One spring じゃない、 ただし B-#17 利点として border-radius sharp + テキスト pixel-perfect は維持)、 ただし「カード暗くなる根治」 + 「destefanis 風視覚 95%」 が達成された。 blur / spring polish はユーザー判断で**やらない**確定。

### 学び (memory に保存済)

- **mask-image gates pointer events (Chromium)** — click 要素本体に mask 当てると hit area が masked shape に縮む、 `::after` に逃がす
- **Animation world consistency** — Portal-elevated clones must fade through the same overlays / fade bands as in-world elements (ユーザー「fade band は薄いカーテン」)
- **Verify layout before clipping** — `.canvas` ではなく `.canvasWrap` (= TopHeader 除外) が正解、 着工前に CSS module + fade band 位置を確認すべき
- **Check reference before patching** — 3+ local-symptom 修正したら、 reference spec memory を re-read、 4 つ目の patch じゃなく reference 再確認に戻る

### deploy

セッション 25 で 9 回 deploy:
- `2f0442d` dot 三角切り抜き
- `8e5affb` 背景タイポ hero (初期、 z-index 2)
- `eb31e2f` z-index 削除でカード前面化
- `05c3269` Lightbox dot hit area fix
- `e3...` clip-path 追加 (canvas anchor) → 撤回
- 次 `.canvasWrap` に anchor 移動
- 次 mask-image gradient 追加 + fade gate 撤廃 (= 方式 A 第 4 段)
- `250f2dba` 方式 B (= canvasWrap 内 portal + hack 全削除)
- 後 fade overlay 削除 + cleanup
- `0ed947f5` 方式 β (= backdrop split、 確定形) ← 現本番

### sub-summary

- master HEAD: dot 三角切り抜き / 背景タイポ / Lightbox clone host 構造 (= 方式 β)
- ユーザー要望「拡張可能構造」 (= 背景タイポ animation variant 5 種) は CSS selector + variant prop で予約済
- destefanis 本家との残差: backdrop blur 無し + Motion One spring 無し (= ユーザー判断「polish しない」 確定、 spec から外す)
- 動画 dot は「丸の中三角切り抜き」 採用、 過去ブレスト L1386 の 7 候補は不要
- vitest 477 (BroadcastChannel 1 件 flaky) / tsc / build clean


---

## セッション 26 (2026-05-14) — 角丸 24 → 20 + dashboard.html 永続化 + 新着 IDEAS 追記

### 1. 角丸 24 → 20 (= 候補 E 即着工)

セッション 25 で「B-#17 落ち着いた現時点でやって良い」 と TODO.md に書いてあった視覚比較タスク。 ユーザー判断で session 26 内で実施。

**変更 4 箇所**:
- [app/globals.css:326](app/globals.css#L326) `--card-radius: 24px` → **20px**
- [app/globals.css:350](app/globals.css#L350) `--lightbox-media-radius: 24px` → **20px**
- [components/board/CardsLayer.tsx:452](components/board/CardsLayer.tsx#L452) インライン上書き → `'20px'`
- [components/share/ShareFrame.tsx:209](components/share/ShareFrame.tsx#L209) インライン上書き → `'20px'`

`FilterPill` / `DisplayModeSwitch` の `border-radius: 24px` は chrome UI 由来 (= カードと別文脈) で touched せず。

**検証**: tsc clean / Playwright で DOM の `--card-radius: 20px` + `--lightbox-media-radius: 20px` 反映を計測確認。 ユーザーは実機ハードリロードで card 角の比較 OK。

### 2. dashboard.html 永続化 (= ユーザー要望の頭整理ツール)

ユーザー発案: 「ブラウザで一覧できる残タスク + アイデア全景ファイル」 = 大画面で眺めると頭が整理できる。 セッション 26 で 2 段階に作った:

- 初版: `session-26-overview.html` (= スクロール多めの記事構造)
- ユーザーから「コンパクト化 + 状態 indicator」 要求 → 単一ページ 3 列ダッシュボードに刷新、 ファイル名を `dashboard.html` に rename (= セッション番号外して永続)

最終ファイル: `docs/private/dashboard.html` (= gitignored)。 ダッシュボードは TODO.md / IDEAS.md の「視覚レンダリング」、 真実の場所は md 側。 dot indicator で状態 (推奨 / 新着 / 検討中 / 進行中 / 未着手 / 完了 / 保留) を一目把握。

**自動更新ルールを `.claude/rules/session-workflow.md` §終了時 に明文化**: 毎セッション末に dashboard.html を TODO.md / IDEAS.md と同期。 私 (Claude) の判断・記憶に頼らず確実にメンテされる構造に。

### 3. 新着 IDEAS.md 追記 (= ユーザー session 26 共有)

ユーザー発案 3 件を IDEAS.md 末尾に追記:
1. **Nothing デザインを取り入れたい** — 取り入れ方 3 案 (テーマ独立 / chrome 一部常駐 / LiquidGlass 融合)。 SF 軍事 (情報過密) と対極の「ミニマル工業軸」。 ブランド衝突回避で公開名は別命 (例: Skeleton)
2. **飛行機高度計スクロールバー** — SF 軍事テーマ chrome、 Lightbox HUD メーター v79 資産延長で実装可、 ScrollMeter brushup と同 sprint
3. **円形レーダー** — 無限キャンバス + SF 軍事、 sweep が回ってブクマが ping = 空間把握 + 発見性 + クラスタ可視化。 無限キャンバス採用が前提条件

### 4. その他のサイドエフェクト

- `.claude/rules/session-workflow.md` §終了時 を「TODO.md 更新 + dashboard.html 同期 + commit + 引継ぎ」 の 4 ステップに拡張
- vitest / tsc clean (= 角丸変更は purely visual、 ロジック非変更)

### 残し物 (= 候補 D ちらつき修正等は session 27+ に持ち越し)

候補 A (背景タイポ variant) / D (Lightbox nav ちらつき) は session 26 で着手せず、 ユーザーが「次は board chrome デザイン調整 + 拡張機能」 へ方向変更。 session 27 の主題は **chrome ミニマル化 + 精密化** (= B-#13 brushup の本格着手)。


---

## セッション 27 (2026-05-15) — board chrome ミニマル化 brainstorm + spec 化 (= 実装ゼロ)

brainstorm のみで実装ゼロ。 board chrome の「ミニマル化 + 精密化」 方向を Visual Companion で深掘りし、 確定 spec を残したセッション。

**確定したこと** (= [`docs/superpowers/specs/2026-05-15-board-chrome-minimal-design.md`](superpowers/specs/2026-05-15-board-chrome-minimal-design.md)):

- ① **ScrollMeter 下配置 + counter readout**: 波形ロジックは現行維持、 canvas bottom 24px center に portal、 `[ N1 — N2 / TOTAL ]` 表示、 D ハイブリッド動き (N1/N2 600ms scramble、 TOTAL 1500ms scramble、 settle 後 ±1 micro-jitter)、 Lightbox open 時 fade out で LightboxNavMeter と入れ替わる
- ② **TopHeader Apple v3**: edge gradient scrim (= board ::before/::after 上下 80px) + 文字 chrome (white 0.85 + 0.5px paint-order stroke + text-shadow ゼロ) + hover マイクロインタラクション (translateY -1px + stroke 0.6) + mount 後 2.4s intro fade

**動的反転は物理制約で棄却** (spec §2-4):

| 案 | 問題 |
|---|---|
| v4: mix-blend-mode: difference | RGB チャネル独立 → カラフル変色 (赤→cyan / 青→yellow) |
| v5b: JS sampling per-label | 文字 1 つ = 1 色までしか無理、 文字内 partial inversion 不可能 |
| v6: backdrop-filter (grayscale + contrast) で 2 値化 | 上端 80px の card 領域が「色味抜け・コントラスト強化された帯」 になる副作用、 user 「全然まともに確認できない」 |

→ CSS では「文字内 pixel-by-pixel 反転 + 白黒のみ + 副作用なし」 の 3 条件同時実現は不可。 Apple v3 (edge scrim + thin stroke) が最終解。

**brainstorm 経緯** (= Visual Companion での候補比較):

1. ScrollMeter 候補 A/B/C 提示 → user「波形そのまま + counter `[画面内範囲/全件]` + ランダム動き」
2. counter 動き B/C/D 提示 → user「D 採用」
3. counter v3 (= 高速 scramble + N1 連動 swell) → user「TOTAL 動かさないで」
4. counter v4 (= 数字派手 / 波形静か / 範囲幅 swell) 提示
5. TopHeader 候補 A/B/C/D 提示 → user「D 採用、 ピル無し」
6. D-text-only v1 → 右側見切れ → v2 で chrome-row container fix → user「text-shadow がダサい、 モダン研究してきて」
7. 研究 deep-dive (general-purpose agent 経由、 destefanis 実コード + Apple HIG + visionOS) → 結論「destefanis は backdrop-blur pill、 Apple は edge scrim + thin stroke、 mix-blend は罠」
8. modern v3 (= Apple iOS Photos / visionOS) 提示 → user「良い感じ」 ← Apple v3 確定
9. v4-v6 動的反転試行 → 物理制約発覚、 Apple v3 で確定

**残し物** (= 次セッション持ち越し):

- spec §4 の 10 ステップ実装 (= セッション 28 の主題)
- ③ Slider 精密化 (= setPointerCapture + movementX×ratio で slow slider 根本治療) は更にその次

**所感**: Visual Companion server を多用、 Sonnet weekly 制限近づき切り上げ。 brainstorm 1 セッションを完全に確定 spec に落とせた、 「実装ゼロ × spec 完成」 セッションのプロトタイプ。


---

## セッション 28 (2026-05-16) — board chrome Apple v3 実装 (= セッション 27 spec 完全消化)

セッション 27 で確定した [`docs/superpowers/specs/2026-05-15-board-chrome-minimal-design.md`](superpowers/specs/2026-05-15-board-chrome-minimal-design.md) §4 の 10 ステップを 3 commit に分けて実装。 全 478 vitest + tsc + build clean、 本番 deploy 済。

### Commit 1: TopHeader minimal + canvas edge scrim (`542a0dc`)

board chrome の視覚的「下地」 を作る commit。 TopHeader が黒帯 + sticky から脱却し、 canvas 上に float する文字 chrome 行になる。

- [components/board/TopHeader.module.css](components/board/TopHeader.module.css): `height: 64px` / `background: #000` / `border-bottom` / `position: sticky` を全削除 → `position: absolute; top:0; left:0; right:0; padding: 14px 24px 0` の透明な lane に。 lane 自体は `pointer-events: none`、 `.group` 島だけが auto に戻すパターンで「空白部分は背後にクリックが抜ける」 を実現
- [components/board/TopHeader.tsx](components/board/TopHeader.tsx): divider `<span/>` (= 1px 縦線) を `<span>·</span>` の dot 文字に置換
- [components/board/BoardRoot.module.css](components/board/BoardRoot.module.css) `.canvas`: ::before (上 80px) + ::after (下 80px) の linear-gradient scrim を新規追加、 z-index 80 で cards(default) より上 / chrome row(110) と Lightbox(100) より下

### Commit 2: ScrollMeter portal + counter readout (`d0f98f8`)

ScrollMeter を TopHeader instrument slot から canvas 下端に portal、 counter readout を新規実装。

- [components/board/ScrollMeter.tsx](components/board/ScrollMeter.tsx): 既存の rAF 波形ロジックは無変更で、 `.meterWrap` で囲み `.meterStack` (counter + 波形) 構造に。 counter は単一 rAF で N1/N2/TOTAL を毎フレーム上書き — scramble window 中 (`now < scrambleUntil`) は `Math.floor(Math.random() * 10000)`、 settle 後は確率 (N1/N2 0.06、 TOTAL 0.10) で `settled ± 1` の micro-jitter。 settled 値は ref に保持して useState を経由しない (= 60Hz の数字更新で React re-render を avoid)。 波形 swell は scroll fraction のみ参照 (= 数字の scramble と完全独立)
- [components/board/ScrollMeter.module.css](components/board/ScrollMeter.module.css): `.meterWrap` = `position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 90`、 transition opacity 0.25s で `.hidden` (= Lightbox open) と fade swap
- [components/board/TopHeader.tsx](components/board/TopHeader.tsx) + [TopHeader.module.css](components/board/TopHeader.module.css): instrument slot を完全削除、 nav (左) + actions (右) の 2 slot に。 `display: grid` から `display: flex; justify-content: space-between` に切り替え (= 3 slot 用の `1fr auto auto auto 1fr` grid は不要に)。 props から `instrument` は drop
- [components/board/BoardRoot.tsx](components/board/BoardRoot.tsx): `visibleRange` useMemo を新設 — filteredItems × layout.positions を viewport.y / h と突き合わせて N1, N2 (1-based) を算出、 全カード visible 時 N1=1 N2=TOTAL。 React の per-frame render schedule で自然に 60fps throttle。 ScrollMeter は canvasWrap と Lightbox の sibling として canvas 直下に配置、 `hidden={!!lightboxItemId}` を渡す
- [components/board/TopHeader.test.tsx](components/board/TopHeader.test.tsx): 2 group expectation に更新
- [components/board/ScrollMeter.test.tsx](components/board/ScrollMeter.test.tsx): track 経由で ticks 取得に書き直し、 初期 textContent に N1/N2/TOTAL が含まれる assertion 追加

### Commit 3: thin-stroke text chrome on all header islands (`1588d54`)

chrome 行に並ぶ 6 種ボタンから pill 装飾を全削除、 paint-order stroke で 文字 chrome 化。

- [components/board/FilterPill.module.css](components/board/FilterPill.module.css): `.pill` から `background` `border` `border-radius` 削除 → text-only + 0.5px paint-order stroke。 dropdown menu (= `.menu`) は popover なので solid backdrop 維持、 anchor は `right: 0` → `left: 0` (= 左 nav 位置で右側に開く)
- [components/board/ResetAllButton.module.css](components/board/ResetAllButton.module.css) + [WidthGapResetButton.module.css](components/board/WidthGapResetButton.module.css): 同方針で pill 削除 + stroke 化。 ResetAll の count バッジ (= 白底に黒数字の小ピル) は「data」 として solid 維持
- [components/board/PopOutButton.module.css](components/board/PopOutButton.module.css): icon-only ボタン、 `filter: drop-shadow(0 0 0.5px rgba(0,0,0,0.45))` で SVG にも paint-order stroke 相当の hairline halo を付与 (= `-webkit-text-stroke` は glyph 専用なので)
- [components/board/SliderControl.module.css](components/board/SliderControl.module.css): W/G label と value の text color を 0.85 white + stroke に統一。 range input の track/thumb は touch しない
- [components/board/BoardRoot.module.css](components/board/BoardRoot.module.css) `.sharePill`: 同方針、 `padding 6px 14px` → `10px 12px` (= 32×32 hit area + 大ポインタ対応)

全要素で hover 時の挙動を統一: color 1.0、 stroke alpha 0.6、 transform translateY(-1px)、 transition 0.15s ease。 text-shadow は全部排除 (= 「動画字幕」 風 drop-shadow が Apple v3 の thin-stroke と干渉)。

### 動かしてみての所感 (= 本番反映後の引き渡し前メモ)

- 一連の commit で「黒帯ヘッダー → canvas に float する文字」 と「中央 ScrollMeter → 下端 ScrollMeter + counter」 の 2 つの大きな視覚転換が同時に起きる。 commit 1 + 2 + 3 を順に重ねるイメージで diff を見ると分かりやすい
- counter readout の D ハイブリッド動き: ユーザーの「数字はうるさく動く、 波形は静か」 要望を実装で satisfy するため、 settled 値を ref で保持して `useState` 経由の re-render を回避。 これにより 60Hz の scramble が React の reconciliation を巻き込まない
- canvas `::before/::after` scrim と LiquidGlass / FrameBorder の z-index 衝突は今回ゼロ (= cards default < scrim 80 < Lightbox 100 < TopHeader 110)、 ただし将来 LiquidGlass を chrome に戻すと再検討要

**vitest / tsc / build clean** / **本番 deploy 済** (`https://booklage.pages.dev` 反映)。 PR / branch なし、 master 直 commit (= solo dev、 worktree 非使用)。

---

## 2026-05-16 セッション 29 — Phase 1 fine-tune + Phase 2 PrecisionSlider + Booklage→AllMarks 全面リブランド

セッション 28 の Apple v3 chrome 本番反映を受けて、 当初は Phase 1 視覚 fine-tune + Phase 2 ③ Slider 精密化が主題だったが、 ユーザー要望追加で chrome 視認性大幅強化 + Booklage → AllMarks 全面リブランドまで完遂。 計 6 commit shipped。

### 1. ScrollMeter periodic full-scramble (`feat(scroll-meter): periodic full-scramble on idle counters`)

ユーザー報告 = 「現状はスクロール中しか scramble せず、 settle 後は ±1 micro-jitter のみ。 settle 中も**たまに full scramble** を発火させたい」。 実装: rAF loop に `nextPeriodicAtRef` を追加、 5-15 秒間隔で N1/N2/TOTAL のいずれかを 600-1500ms full-scramble。 既存の scroll-driven scramble とは `Math.max` で重畳のみ。

### 2. PrecisionSlider 新規 (`feat(slider): custom pointer-based precision slider for W/G`)

IDEAS §セッション 23 D + E 「マウスより遅く動く + 1 ずつ狙える」 の根本治療。 native `<input type=range>` を廃止して自前 pointer-based slider 実装:

- `setPointerCapture` + `movementX × ratio` で値変化、 ratio = (max - min) / 1000 = マウス 1000px で min→max を移動
- 内部値は float、 表示は `Math.round(value)` の 4 桁 zero-pad (`0280`)
- Gap 上限 60 → 300 (= 「カードを意図的にスカスカに並べた表現」 を解放)
- `WidthGapResetButton` の atDefault 判定は `===` → `Math.abs(diff) < 0.5` のトレランス比較に
- 共通部品 `PrecisionSlider` を新規、 `SizeSlider` / `GapSlider` は薄ラッパー
- arrow / Home / End キーで a11y 最低限の操作互換
- spec: `docs/superpowers/specs/2026-05-16-precision-slider-design.md`
- 10 test 追加、 vitest 478 → 488

### 3. Chrome v4 legibility (`style(chrome): v4 chrome legibility — stronger stroke + halo + missing islands`)

ユーザー要望 = 「全部一律にくっきり」 + 「左上のタグ修正漏れ」。 chrome formula を v3 (0.5px / 0.45 黒 / shadow なし) → v4 (0.75px / 0.6 黒 + soft halo) に強化、 `globals.css` に `--chrome-text-*` token を集約 (= 今後の調整は 1 箇所で済む)。 FilterPill / ResetAllButton / WidthGapResetButton / PrecisionSlider / sharePill / ScrollMeter counter の 6 箇所を vars に揃え、 ScrollMeter counter は chrome 完全未適用 (= 修正漏れ) だったので新規適用。 FilterPill の bracket (0.4→0.6) と count (0.5→0.7)、 ScrollMeter の bracket/dim (0.42→0.6) も dim 緩和。

### 4. Booklage → AllMarks 全面リブランド (`chore: rebrand Booklage -> AllMarks across UI/i18n/docs/comments`)

ユーザー要望 = 「あらゆるところで旧名称が使われているので Claude の認識も含めて統一したい」。 113 ファイル一括置換:

**User-visible** = APP_NAME fallback / Watermark primary + secondary / LP / share / save toast / 15 言語 i18n messages/*.json / Chrome 拡張 (extension/ + chrome-extension/) manifest / popup / options / PWA public/manifest.json + sw.js / Console messages

**Internal** = TypeScript 型名 BooklageDB → AllMarksDB / Console log prefix [booklage] → [allmarks] / 全コメント / JSDoc / docs / CLAUDE.md / MYCOLLAGE_FULL_SPEC.md / Claude memory ファイル群

**意図的に維持** (= 動作 / データ保護):
- `DB_NAME = 'booklage-db'` (= 既存ユーザー IDB データ保護)
- `booklage.pages.dev` URL 全般 (= ドメイン取得 2026-05-31 まで)
- `wrangler --project-name=booklage` (= Cloudflare Pages project)
- `package.json` "name" (= tooling 影響リスク)
- Bookmarklet 内の `data-booklageExtension` / `booklage:save-via-extension` 等の programmatic ID (= 既存ユーザー bookmarklet との cross-process API 維持)
- GitHub repo 名 (= github.com/masaya-men/booklage)

spec: `docs/private/2026-05-11-allmarks-branding-spec.md` (gitignored)

### 5. ScrollMeter / FilterPill 括弧削除 + count brightness 統一 (`style(chrome): drop brackets, brighten FilterPill count`)

ユーザー質問「タグの括弧や件数、 スクロールメータの括弧などはなぜ意図的に色が違うのか？合わせては?」 から、 構造のタイポグラフィ階層論を共有しつつ、 ユーザー希望に従って括弧削除 + 数字 brightness 統一を実施。

- FilterPill: `[ ALL · 234 ]` → `ALL · 234` (= 括弧削除、 数字をラベルと同明度)
- ScrollMeter: `[ 0001 — 0012 / 0234 ]` → `0001 — 0012 / 0234` (= 括弧削除)
- FilterPill `·` は唯一残る構造区切りとして dim 維持 (= `ALL 234` で label と数字がくっつかないため)
- ScrollMeter `—` `/` は 3 つの数字 (N1/N2/総数) の構造区切りとして dim 維持

### 6. TODO 状態更新 (`docs(session-29): TODO 状態更新`)

セッション 29 の 4-5 commit 反映、 rebrand の意図的に維持リスト明示、 次セッション推奨タスク候補追記。

### 学び / 注意 / 教訓

- **chrome token 集約**: `globals.css` に `--chrome-text-*` token を入れたことで、 今後 stroke 値 / shadow / 色を調整するときは 1 箇所で済む。 v3 から v4 への formula 更新コストが 5+ ファイルの繰り返し編集 → 6 箇所が vars 参照だけになった
- **PrecisionSlider の ratio = (max - min) / 1000**: W と G で「マウスを動かす距離は同じ感覚」 を出すには range-aware ratio が必須。 定数 ratio (= 例 0.5) だと W と G で大きく手感が違う。 これがユーザー要求「1 ずつ狙える」 を構造的に解決した
- **AllMarks rebrand の「変えない」 リスト**: 113 ファイル中で 100+ は容易に置換できるが、 6 種の技術 ID (DB_NAME / deploy URL / wrangler / package / bookmarklet ID / repo) は動作 / データ影響があるので絶対に変えない。 この境界判断は migration 設計の一般原則
- **構造的 dim 配色**: bracket / 区切り文字を dim にする手法はタイポグラフィ階層付けの王道だが、 ユーザーが「合わせたい」 と言うなら従う。 ScrollMeter の `—` `/` は 3 数字の構造的区切りなので削除 / 統一しない判断は spec 的に正当 (= 削除すると意味不明)
- **rebrand 後の自己参照崩壊**: 「Booklage → AllMarks」 のような自己参照を含む文章が一括置換で壊れる (= 「AllMarks → AllMarks」 になる)。 TODO.md / memory project_allmarks.md で発生、 手動で再構築要

**vitest 488 / tsc / build clean** / **本番 deploy 5 回 / push 済** (`https://booklage.pages.dev` 反映)。 PR / branch なし、 master 直 commit (= solo dev、 worktree 非使用)。

### 次セッション (= 30)

ムードボード全画面化 (= 30 分の小規模 sprint)。 詳細 `docs/CURRENT_GOAL.md`。


## セッション 30 (2026-05-16) — 全画面化 visual pivot + Bug 調査 + 次戦略合意

### 前半: 全画面化 (= 5 つの CSS 変更で Phase A → Phase C pivot)

セッション 29 で計画した「30 分の小規模 sprint」。 destefanis homage の額縁付きデザインから AllMarks 個性 「自分の世界」 全画面表現への visual pivot。

**変更**:
1. `--bg-outer` `#ebebeb` → `#0a0a0a` (= canvas と同色で枠を消す)
2. `--canvas-margin` `24px` → 当初 `0` → ユーザー希望「壁から離して」 で **`48px`** (= 純粋に内側 padding として機能、 色は canvas と同色なので「枠」 ではない)
3. `--canvas-radius` `24px` → `0` (= 角丸撤廃、 ストレート edge)
4. `BoardChrome` (= 左上 AllMarks wordmark + 下端 Guide/About/Privacy/Terms リンク) を一時非表示。 元々 margin に居場所があった、 margin 縮小で消えるため。 footer 全体デザイン (= 広告含む) を別 sprint で再設計後に差し戻す
5. `CARD_GAP_DEFAULT_PX` `18` → **`97`** (= ユーザーが画面で調整してベスト値発見、 4 列 gallery 密度、 背景タイポ AllMarks が gap から透けて見える)

**ユーザー判定**: 「整理ツール → 表現ツール」 ミッションを default で体現する転換 + Phase A 完全終了 + Phase C (個性化) 突入を宣言。

**commit / deploy**:
- `e8beadd` style(board): session 30 visual pivot — fullscreen canvas + gallery density
- 本番 deploy 済 (= `booklage.pages.dev`)

**memory 更新**:
- `feedback_strict_reference.md` を全面書き直し: Phase A の destefanis 忠実コピー制約を「履歴コンテキスト」 に格下げ、 Phase C 個性注入解禁
- `MEMORY.md` の該当 index 行も更新

### 中盤: 戦略 4 つの議論 + 合意

**ユーザー発意の話題**:
1. 拡張機能を早めに submit すべきか?
2. タグ付けの位置付け
3. 広告の扱い
4. 「骨組み先に作るべき (= サイジング汎用化、 等)」

**Claude 回答**:
1. **拡張機能 ストア submit は 5/31 ドメイン取得後に AllMarks v1.0 として 1 回で**。 ただし「使える状態」 への polish (= ローカル sideload 改善) は今すぐ全然 OK = ユーザー誤解を解いて合意
2. **タグ**: manual tag (= IDB schema bump 必要、 不可逆 → 早期 schema 設計が foundation) と AI auto-tag (= MVP 後 feature) を分離。 タグ自体は AllMarks 移行後にマッチングアプリ風 UI で実装、 で合意
3. **広告**: 配信は後で良いが **layout 予約 slot** は今 foundation に含める。 戦略 spec は既存 (= `project_ad_strategy_2026_05` memory)
4. **骨組み 3 本柱** を提示 → 同意:
   - サイジング汎用化 (= clamp(MIN, vw, BASE))
   - manual tag schema (= IDB bump + CRUD + filter)
   - 広告 placement 予約 slot
   - 推奨順 (1) → (3) → (2)、 順次セッション

**card-drag-edge-autoscroll の記録確認**: ユーザー懸念 → 既に `docs/private/IDEAS.md:1899` C 項目に記録済を発見。 訂正 + 報告。

### 後半: Bug 調査 + 修正 (= systematic-debugging skill 適用)

**ユーザー報告 2 件**:
- Bug A: テキストカードを開くと「カードのまま飛んできて、 ライトボックスになるとテキストになる」 急変
- Bug B: ライトボックス open / close の morph が震えている (= テキスト以外すべて)

**Phase 1 (= root cause investigation) で 3 つの sub-bug に分解**:

| sub-bug | 症状 | root cause |
|---|---|---|
| **A-1** | TextCard 急変 | `LightboxMedia` ([L1597-1639](components/board/Lightbox.tsx#L1597-L1639)) に text-only ケースなし、 L1638 placeholder div に fallback。 Clone は full TextCard、 swap で素 div へ急変 |
| **A-2** | サムネ付きカード「奥に消える」 (= 断続) | `.media img` に aspect-ratio 駆動 wrapper なし、 embed は `.embedPosterBox` で事前 sizing 済だが一般 image card は素 `<img>`。 image load 完了前の `mediaEl.getBoundingClientRect()` がほぼゼロ → clone tween が zero rect に縮む。 Cache hit/miss で intermittent |
| **B** | 全カード共通 morph 震え | clone tween が `top` / `left` / `width` / `height` を直接 animate (= layout property、 GPU 加速不可、 毎フレーム reflow + paint + composite)。 sub-pixel float 補間で増幅。 B-#17 の「radius 維持のための設計トレードオフ」 が代償化 |

**fix 適用**:

**A-2 fix** (= 即修正、 リスクなし):
- `Lightbox.tsx` L1635 周辺: `aspectRatio` あれば `.imageBox` wrapper、 なければ素 `<img>` (= share view 互換)
- `Lightbox.module.css` に `.imageBox` / `.imageBox img` 追加 (= `.embedPosterBox` と同じ width 式、 `object-fit: contain` で aspect ズレ時の画像切り抜き防止)

**A-1 + B は次セッション持ち越し**: ユーザー判断「応急処置はムダ、 公開前なので根本解決から」。 次セッション 31 で TextCard 再設計と一緒に扱う (= 同 file 群、 一括効率)。

**commit / deploy**:
- `0fd7b8a` fix(lightbox): aspect-driven wrapper for general image cards
- 本番 deploy 済

### TextCard 再設計の方向合意 (= 次セッション 31 主題候補)

ユーザーから reference 画像 3 枚 (= 白地黒字 editorial / 黒地白字 statement / 黒地白字 editorial) + 方向性提示:
- 2 パターンを random 分配 (= 白地黒字 / 黒地白字)
- タイトル typography が主役、 文字サイズは reference くらい (= 今より小さく抑えめ)
- 装飾は最小 (= 角丸 + パディング + ホスト名小 + タイトル)
- 「テキストカードをカードとして」 ボードと Lightbox で同じ装飾を共有 → A-1 自動解決

詳細は `docs/private/IDEAS.md` D 項に記録。

### 学び / 注意 / 教訓

- **設計トレードオフの代償化**: B-#17 で「radius 維持のため transform:scale を避けて top/left/width/height 直接 animate」 を選んだが、 これが Bug B の root cause。 当時の判断は正当だが、 「視覚優先で性能を犠牲にした選択は後でユーザー知覚で顕在化する」 という教訓
- **aspect-ratio CSS で load 完了前 sizing 確定**: B-#17-#2 で embed 向けに作った `.embedPosterBox` の汎用性、 同じ pattern が一般 image card にも必要だった。 「embed 専用」 だと思い込んでいた範囲が広がる
- **systematic-debugging Phase 1 の重要性**: Bug A をユーザー報告 (= テキストカード問題) で診断したら、 第二 evidence (= サムネ付きも奥に消える) でほぼ別 bug が出てきた。 「root cause を **複数**特定する」 まで投げ出さない姿勢が大事
- **応急処置を捨てる勇気**: ユーザー判断「公開前だから根本解決から」 は normal な development では non-trivial。 Solo dev だからこそ「動いてる方が安心」 という心理に流されず、 設計の clean さを優先できる
- **「テキストカードを 1 つの世界に統一」 の architectural insight**: ユーザー発意の「カードのデザインをもっとしっかりして、 それをちゃんとカードとして扱えば単純になる」 は本質的に正しい。 ボードと Lightbox で別物として扱う複雑さの源を消す方向

**vitest 488 / tsc / build clean** / **本番 deploy 3 回** (`https://booklage.pages.dev` 反映)。 PR / branch なし、 master 直 commit。

### 次セッション (= 31) 主題

**「Lightbox 周りまとめ sprint」**:
1. TextCard 再設計 (= 2 パターン random、 typography 主役、 reference 画像準拠)
2. Lightbox の `.media` で再設計 TextCard を大サイズ描画 → A-1 自動解決
3. Bug B (= 震え) scope 測定 → 修正 (= B-a / B-b / B-c から選択)

詳細 `docs/CURRENT_GOAL.md` + `docs/private/IDEAS.md` D・E 項。

---

## セッション 31 (2026-05-16) — Lightbox 周りまとめ sprint (= 全 3 タスク完遂、 1 commit deploy)

### 前半: 5 つの未確定事項を確認 → 仕様確定

ユーザーと spec 詰め。 5 点合意:

1. **色分配** → cardId hash で deterministic、 カード作成時に決まり以降固定 (= 「置かれたときに決まった色で固定」)
2. **文字サイズ** → 既存 `pickTitleTypography` base から **40% 縮小** (= reference 画像くらい抑えめ)
3. **黒地カードの色** → `#0a0a0a` (= board 背景 `#000` とギリ見分けつく off-black)
4. **all-caps display 路線 (画像 2 タイプ)** → 採用しない、 白地 / 黒地の **2 パターンだけ**
5. **長タイトル時の挙動** → **9:16 上限まで縦伸び → そこで ellipsis で切る** (= 動的縮小路線は隣カードと統一感壊すので不採用)

### Phase 1: TextCard 再設計 — 実装

- `lib/embed/text-card-color.ts` を新規追加 = djb2 hash で cardId → 'white' | 'black' deterministic 分配
- `lib/embed/title-typography.ts` base font size 全モード約 40% 縮小:
  - headline `56 / 48 / 40` → `34 / 29 / 24`
  - editorial `22` → `18`
  - index `14` → `13`
  - lineHeight も `fontSize × 1.18-1.5` の比率で再計算、 `maxLines` を伸ばす (= 9:16 上限まで縦に伸びる前提)
- `lib/embed/text-card-measure.ts` を `measureTextCardLayout` API へ刷新 = `{ aspectRatio, maxLines, clamped }` を返す。 自然高さ > 9:16 上限なら **aspect を `9/16` に clamp + 表示行数を再計算 + clamped:true** で ellipsis 制御
- `components/board/cards/TextCard.tsx`: `pickTextCardColor` 適用、 `WebkitLineClamp: maxLines` で truncation、 useEffect の persist key 更新
- `components/board/cards/TextCard.module.css`: `.white` / `.black` variant 追加、 favicon は黒地時 `rgba(255,255,255,0.08)` 背景 + opacity 0.7 で馴染ませる

### Phase 2: Lightbox 統合 — A-1 自動解決

- `lib/share/lightbox-item.ts` に `cardId?: string` を追加。 `normalizeItem` で `BoardItem.cardId` → `LightboxItem.cardId` を流す (= board と Lightbox で同じ色 variant を維持)
- `components/board/Lightbox.tsx` の `LightboxMedia` 関数末尾の placeholder div を削除、 代わりに **`.imageBox` aspect-driven wrapper の中で `TextCard` を cardWidth=600 で再描画**。 fake BoardItem は `cardId ?? url` fallback で share view も同色決定論
- **Bug A-1 自動解決**: clone (board の TextCard) → 大 TextCard、 同じ装飾なので急変なし。 placeholder div への急変が消える
- `DefaultText` に `hideTitle?: boolean` prop 追加、 text-only card (= `!view.thumbnail`) で `hideTitle={true}` を渡し `.text` 右パネルの h1 重複表示を抑制。 description / host / source link は維持

### Phase 3: Bug B 震え修正 — B-b (= 軽量 fix) を適用

セッション 30 時点で root cause 特定済 = `clone` tween が `top/left/width/height` 直接 animate (= layout property)、 sub-pixel float 補間でジッタ増幅。 B-c (= transform 路線 + radius を child element に逃がす完全 fix) は scope 大なので、 まず B-b で軽量化:

- `createLightboxClone` で start rect を `Math.round` で整数化、 `willChange: 'top, left, width, height'` + `transform: translateZ(0)` + `backfaceVisibility: 'hidden'` 追加 (= GPU compositing hint)
- open / close 両 tween の target rect も `Math.round` 化 (= GSAP sub-pixel 補間ジッタを抑制)

完全 fix にはならない (= layout property 直接 animate の本質は変わらず) ので、 体感で残れば次セッションで B-c 本格対応。

### 学び / 注意 / 教訓

- **既存 test を破壊するときの差分管理**: `title-typography.test.ts` の `expect(fontSize).toBeGreaterThanOrEqual(40)` は base 40% 縮小で当然失敗 → 期待値を `>= 24` に書き換え + コメントで「session 31 redesign のため」 と理由明記
- **`toEqual` と undefined keys**: vitest の `toEqual` は undefined 値のキーを「未定義」 と同視するので、 元 `normalizeItem` の `mediaSlots: undefined` も `photos: undefined` も expected に書かなくて通っていた。 新 `cardId: 'c-1'` を追加した瞬間、 cardId だけ expected に書く必要が生じる (= undefined 同視ルールの罠)
- **「同じ世界を board と Lightbox で共有」 architectural insight の検証**: TextCard を 1 つに統一すれば clone morph で素の placeholder 急変が物理的に起こり得ない。 セッション 30 のユーザー判断「公開前だから根本解決から」 が正しかった
- **flaky test を判別する手間**: `tests/lib/channel.test.ts` の BroadcastChannel test は session 31 全実行で 1 度 fail / 1 度 pass。 タイミング依存の flaky と判定 (= 私の変更とは無関係)、 単体再実行で 2/2 pass を確認

**vitest 488 (= flaky 1 件除く全 pass) / tsc / pnpm build clean** / **本番 deploy 済** (`https://booklage.pages.dev` 反映)。 master 直 commit、 1 commit で 3 タスク + test 期待値更新を含む。

### 次セッション (= 32) 主題候補

セッション 31 で Lightbox 周りはひと段落。 触らないリストにある **foundation 3 本柱** からスタートが筋:

1. **サイジング汎用化** (= clamp(MIN, vw, BASE)、 spec `docs/specs/2026-05-12-sizing-migration-spec.md`)
2. **広告 placement 予約 slot** (= board / footer / PiP)
3. **manual tag schema** (= IDB schema bump + tag CRUD + filter)

推奨順 (1) → (2) → (3)。 もしくは Bug B 震えが体感残っていれば **B-c (transform + radius child 化) を本格修正** する選択肢もあり。

月末 (= 2026-05-31) ドメイン `allmarks.app` 取得確認も次セッション開始時のリマインダー。

foundation 3 本柱 (= サイジング汎用化 / tag schema / 広告 placement) はセッション 32 以降へ後ろ倒し合意済。

---

## 2026-05-16 セッション 32 — Lightbox の TextCard 表示 + 震え対策、 user と方針すり合わせ sprint

セッション 32 は **「Lightbox 周りまとめの続き」** から始まり、 user 報告で複数バグが連続発覚、 複数 deploy を重ねて末で方針 decided な session。 user / Claude 双方で混乱があり、 大きな refactor を相談なしに進めて user 「怖い」 と feedback を受けた。 教訓を memory に保存。

### 完遂された主な変更 (= 末で deploy)

1. **webpage の Lightbox 表示を専用 component LightboxTextDisplay に統一** (= B 案)
   - 「webpage は OG image 有無に関わらず全部テキストカード風」 という user 決定 (= 2026-05-16 session 末)
   - 「タイトル中央大 + 上に favicon + ドメイン」 のシンプル card
   - 画像引き伸ばし問題 (= 「巨大ぼやけ image」「ファビコンの拡大版」 等) が完全消滅
   - 動画 (YouTube/TikTok/Instagram) + Tweet 写真/動画は既存経路維持
2. **左右ナビ矢印 (navChevron) 常時表示 + クリック可能**
   - 元 hover-reveal を廃止 (= user 「表示されない」 報告に対応)
   - `pointer-events: auto` を navChevron に追加 (= stage の pointer-events:none を override)
   - 背景は 0.10 で控えめ (= user 「濃すぎる」 報告で 0.18 から元値復元)
3. **backdrop-filter blur 削除** (= navChevron / embedOpenBadge / tweetWatchOnXBadge)
   - 既知 trap (memory `reference_backdrop_filter_paint_trap`) 対応、 高 DPR で動く clone 背後の paint 負荷削減
   - 揺れの部分減効果あり (= user 「少しは減ったがまだ気になる」)
4. **clone の border-radius を hardcode 24px → CSS var (20px) に統一**
   - 過去 7bb0529 で取りこぼされた radius 移行 (= user 「丸さすら違う」 報告)
5. **X ツイートの OGP title boilerplate strip** (= `cleanTitle(title, url)` lib/embed に共通化)
   - board + Lightbox 両方で「Xユーザーの 〜 さん:「本文」/ X」 → 「本文」 のみ
6. **Tweet text-only 判定を hasPhoto/hasVideo flag ベース に**
   - photoUrl に profile pic 混入する誤判定回避 (= user 「巨大 X ロゴ」 報告対応)

### 試したが破棄したアプローチ (= 教訓のため記録)

1. **ResizeObserver scaler 案**: board の TextCard を cardWidth=280 で描画して transform:scale で拡大
   - 失敗理由: `.imageBox` の width が動的 (= min(920, 60vw)) なのを無視して固定 600px scale → 親と inner のサイズ不一致でレイアウト崩壊
2. **clone をそのまま `.media` に置く案 (LargeBoardCardClone)**: source card の DOM cloneNode → scaler
   - 失敗理由: clone DOM 内部の TextCard の border-radius が scale で 拡大、 layout 計算が依然崩壊
3. **clone の transform:scale animation 案 (Bug B fix)**: createLightboxClone を transform-only に refactor
   - 失敗理由: scale で border-radius が動的変動 → 「角丸ぐにゃぐにゃ」 user 不満
4. **GSAP modifiers per-frame integer snap**: width/height tween に毎フレーム px snap
   - 失敗理由: discrete jump で「カクカク」 感、 「角丸グニャグニャ」 user 不満

### Claude の失敗 (= 次セッションで繰り返さない)

- **大きい変更を user 相談なしに進めた** → user 「怖い」 → memory `feedback_consult_before_big_changes` 新規保存
- **想像で修正を進めた** → user 「事実確認せず推測で進めるな」 → clone borderRadius は session 31 から残ってた hardcode、 私が「session 31 で 24→20 にした」 と誤推測で説明
- **動かない実装を続けて deploy** → user 環境で何度も壊れる、 user 「変わらない」 「もう一回失敗」

### Bug B 揺れの現状 (= 残課題)

- 軽量 fix (B-b、 session 31 軽量) + backdrop-filter blur 削除 (session 32) で部分改善
- user 「少しは減ったがまだ気になる」、 user 仮説: 「blur 以外の重い計算が原因」
- 次セッションで原因仮説 + 必要なら開閉アニメ自体の見直し

---

## セッション 33 (2026-05-16) — Lightbox ナビ矢印 + Hit Zone リデザイン (Item 1 / 全 4 項目)

**user 起点**: 「テキストカード周りを完全な状態にしたい」。 関連 4 項目を順に進める方針:

1. ライトボックスやじるしの円グレー背景削除 + ホバー時アニメ
2. テキストのみカード (= webpage / tweet) の基本サイズ固定 + 構造シンプル化
3. board 上ツイート文のみカードを black / white ランダム化
4. テキストのみカードを Lightbox にそのまま移動 + 右に元ページ遷移 / アカウント情報

セッション 33 ではこのうち **Item 1 + 関連 hit zone リデザイン** を完成。 残 Item 2-4 は次セッション (= 34) へ。

### Visual Companion で 6 回 mockup iteration

- v1 (arrow-hover.html): 矢印 hover animation の 4 案を視覚比較 → user **D 案 (= pulse loop)** 選択
- v2 (hit-area.html): hit area 幅 3 案 (= 80px / 18vw / 25%) を視覚比較 → user 「画面端 / 右パネル等を分けて塗った画像」 で具体要望
- v3 (hit-area-v2.html): user の塗り画像を構造に当てはめた解釈モック → 「ライトボックスの実画面に重ねた版で見たい」
- v4 (hit-area-real-vN.html): 実画面スクショ (= 3835×1740 PNG) を base64 で HTML に埋め込み、 hit zone overlay。 brainstorm server が画像 file を serve しないため base64 + bash concat で生成 (5.2MB HTML)
- v5 (hit-area-real-v3): 赤帯を画面上端まで伸ばす
- v6 (hit-area-real-v4): 下端の青削除 (= dot インジケータ誤爆防止、 user 提案)
- v7 (hit-area-real-v5): 緑 (source link) 周囲に safe zone 追加 (= user 提案「元ページボタンの周りだけ押しやすく」)、 ✕ ボタン領域を上青に統合
- v8 (hit-area-real-v6): 動画上端と青の被りを修正
- v9 (hit-area-real-v7): user 提案 **z-index レイヤー方式** で再構成 → 確定

### 確定方針 (= spec `docs/specs/2026-05-16-lightbox-nav-hit-zone-design.md`)

**z-index 3 層構造** (= user 提案):
- **Layer 1 (= 最下層)**: 青 = 全面 click で閉じる
- **Layer 2 (= 中間)**: 動画 / 画像 / ✕ / 元ページボタン / dots / メーター = 個別 click を受け取り close 発火を吸収
- **Layer 3 (= 最前面)**: 赤 = 左右 `clamp(60px, 7vw, 140px)` のナビ hit zone

矢印:
- 円形グレー背景 (`rgba(255,255,255,0.10)`) **削除**
- 通常時は SVG だけ (= 14×14 stroke=2、 現状形維持)
- hover で D 案 pulse loop (= `scale(1) → scale(1.35) → scale(1)`、 900ms ease-in-out infinite)

### 実装変更 (= 3 ファイル + 1 spec)

1. **`components/board/Lightbox.module.css`**:
   - `.navChevron` (円形 button) を **削除**
   - `.navHotzone` 追加 (= 7vw 透明 hit zone、 z-index 3 within stage)
   - `.navChevronIcon` 追加 (= 32×32 装飾コンテナ)
   - `@keyframes chevronPulse` 追加
   - `.backdrop` / `.stage` を `position: absolute` → **`fixed`** に変更 (= user 「画面端まで届かない」 報告対応、 hit zone を viewport 全体に拡張)
2. **`components/board/LightboxNavChevron.tsx`**: button が hit zone 本体、 chevron は装飾子として `<span className={styles.navChevronIcon}>` で wrap
3. **`components/board/Lightbox.tsx`**:
   - `.frame` に `onClick={requestClose}` 追加 (= Layer 1 全面 close 実装)
   - `.media` に `onClick={(e) => e.stopPropagation()}` (= 媒体 click 吸収)
   - source link (= 3 箇所、 Instagram / DefaultText / TweetText) に `onClick stopPropagation` (= リンク機能維持)

`requestClose` は `closingRef` guard 既存 → close button + frame 両方発火しても double-fire 安全。

### 副作用 / 視覚変化

- `.backdrop` / `.stage` を `position: fixed` にしたことで、 元は canvas 内 (= 外側 24px 白い outer frame を維持) だった Lightbox dim が **viewport 全面** を覆う形になった。 user **OK 判定**。
- これにより、 Lightbox open 中は outer frame の白い余白も dim で覆われる (= 全画面 takeover 感)

### user の核心要望と達成

| user 発言 | 実装 |
|---------|------|
| 円グレー背景がノイズ | 完全削除 |
| 矢印が拡大縮小しながらアニメ | D 案 pulse loop |
| 画面端の広いエリアでナビ click | clamp(60, 7vw, 140) hit zone |
| ✕ と青を分けず一帯で閉じる | ✕ も Layer 2、 上一帯は Layer 1 で全部 close |
| 元ページボタン周りは押しやすく | Layer 2 で個別 hit + stopPropagation で誤発火吸収 |
| カードサイズ / 媒体サイズに依らず一定幅 | 7vw viewport-based、 frame 内 media とも横方向で分離 |
| 画面端まで連続 | backdrop / stage を `position: fixed` で viewport 拡張 |

### 検証

- vitest 488 / tsc / build clean (= 全 pass、 セッション開始時から数値変動なし)
- 本番反映済 (= `https://booklage.pages.dev`、 user ハードリロード確認 OK)

### Visual Companion 副産物 (= 削除候補)

`.superpowers/brainstorm/6093-1778926800/content/` 配下に 5.2MB × 4 個 ≈ 20MB の HTML 残存 (= mockup v1-v9 と PNG 1 枚)。 gitignored なので push には影響しないが、 ローカルディスクを使うので次セッション開始時に整理してよい。

### 次セッション (= 34) で扱う 残 3 項目

- Item 2: テキストのみカード (webpage + tweet) のサイズ固定 + 構造シンプル化
- Item 3: board 上ツイート文のみカード を black / white ランダム化 (= webpage TextCard と統一)
- Item 4: テキストのみカードを Lightbox にそのまま移動、 右エリアに元ページ遷移 / アカウント情報

---

## セッション 34 (2026-05-16) — Phase 1 完了 + transform-scale FLIP 試行 (= rolled back)

### 確定 deploy 済 (= commit dd3d7c0)

**Phase 1: テキストカード Lightbox 経路の整理 + サムネ復活**

1. **Item 3 = 既に済んでいた判明**: 文のみツイートは board の `pickCard` で TextCard 経路、 `pickTextCardColor(cardId)` で white/black ランダム振り分けが session 31 から効いていた。 何もしなくて OK
2. **session 32 「全部 LightboxTextDisplay」 判断を逆転** (board mirror routing):
   - 一般 webpage で **thumbnail あり (= noomoagency 等) → Lightbox でも image 表示** に復活 ([Lightbox.tsx:1737-1751](components/board/Lightbox.tsx#L1737-L1751))
   - thumbnail なし → `LargeTextCardScaler` (= 既存 dead code 化していた関数を本流化) で TextCard を Lightbox で拡大
   - これに伴い `LightboxImageWithFallback` が dead code 化 → 中身を `LightboxTextDisplay` → `LargeTextCardScaler` fallback に書き換えて生き返らせた
3. **inner card-radius を 0 上書き**: scale 拡大時に inner TextCard の 24px radius が visually 53px に膨らむ問題、 outer `.imageBox` の 20px に統一 ([Lightbox.tsx:1907-1913](components/board/Lightbox.tsx#L1907-L1913))
4. **TextCard に `omitMeta?: boolean` prop 追加**: Lightbox で TextCard を transform:scale で拡大すると 16×16 favicon が bitmap blur に → omitMeta で favicon + hostname 行を非表示にして「がびがびファビコン」 問題解消
5. **DefaultText の `hideTitle` 削除**: 右パネル h1 (= title) を text-only でも表示するように (= Item 4 の右パネル全文表示につながる)

**user 確認**:
- noomoagency (= クラゲ thumbnail) → Lightbox で綺麗に出る ✅
- pushmatrix (= title 空) → hostname fallback で問題なし
- 角丸 20px 統一 ✅

### 試行して rolled back (= 未 commit、 diff は `docs/private/session-34-flip-wip.diff` に保存)

**session 23-24 で width/height tween に切り替えた根拠を再評価し、 transform:scale FLIP に戻そうとした**:

- 当時の理由 (cf6b8d1 commit message): GPU scale tween が「角丸が間に合っていない」 感覚を生む = radius 24→20 動的 morph + GPU bilinear AA の複合問題
- 現在 (session 32 以降): radius 全 20px 統一済 → morph 不要、 残るは GPU AA の subtle 差のみ
- user 判断: 「条件変わったから A 案再評価すべき」 = 試行 OK

**v1 実装** (= clone を MEDIA size で作って scale-down 開始):
- ImageCard / Video カード → 拡大滑らか OK ✅
- TextCard → 文字が clone の inner で固定 (= 拡大しない、 末端で jump)
- close 時の border-radius は scale で視覚的に縮む = user「丸さ減ったあと最後にカクッ」

**v2 実装** (= clone を SOURCE size に保ち、 transform:scale で UP に拡大):
- 理論上は LargeTextCardScaler の内部 transform:scale と一致するので、 inner text の最終 size も一致 = swap jump 消えるはず
- 加えて border-radius を毎フレーム `20 / current scaleX` で逆補正
- user 確認: **テキストはまだ jump 残り**、 **角丸も常に 20px にならず変化する** = scale compensation が想定通り動いていない

**user 判断**: 次セッションで頭すっきりの状態で再着手。 今 deploy 中は Phase 1 安定版 (= dd3d7c0) に戻している。

### 次セッション (= 35) への引き継ぎ

A 案 (transform-scale FLIP) 再着手の優先順:
1. **まず角丸 = 20px 固定** が transform 中も維持される実装。 `gsap.getProperty('scaleX')` が想定通り動かない可能性高、 alternative:
   - GSAP `modifiers` 経由で scale 値を inject + radius を同時更新 (← session 32 で「box が px discrete jump」 と revert された案だが、 radius のみ更新なら問題ないかも)
   - 別の proxy object を同じ tween に乗せて proxy.scale を読む
   - CSS `getComputedStyle(clone).transform` を matrix parse して scale を取り出す
2. 角丸 OK 後に text grow 問題解決 (= v2 設計で正しく動くか確認、 ダメなら別案)

参照: `docs/private/session-34-flip-wip.diff` (= v2 実装の生 diff、 116 行)、 cf6b8d1 commit message (= 当時 GPU scale で躓いた経緯)、 session 32 modifier revert 経緯 (= Lightbox.tsx 内 comment にも残る)

### 検証

- tsc clean / vitest 487/488 (= channel.test.ts は flaky で 2 回目 pass、 私の変更とは無関係)
- build clean / 本番反映済 = `https://booklage.pages.dev` ハードリロードで Phase 1 stable 状態が見える


## セッション 35 (2026-05-17) — 本家 destefanis 真の実装判明 + 文字カード zoom hybrid + cardWidth ハードコード fix

### 当初予定との大幅な路線変更

セッション 35 のゴールは「transform-scale FLIP 完成」だったが、 user の懐疑「本家がどうやってるか確認した?」 から実機ソース確認に踏み込み、 **大前提が誤読だったと判明**:

- destefanis 本家 `app.js` 396-407: `Motion.animate(clone, { width, height, transform: translate3d }, springTransition)` = **width/height tween + translate のみ、 transform:scale は一切使っていない**
- session 30 memory「本家は transform:scale + spring で center へ scale up」 は誤読
- 私たちの master HEAD (= Phase 1 安定版) は実は本家と同じ方式 = transform:scale FLIP は本家へ近づく動きではなく **離れる動き** だった

→ **方針転換**: transform:scale FLIP 不採用確定、 文字カード特有の「文字も一緒に拡大」 問題は別の hybrid 方式で解く

### 採用方式: 外側 width/height tween + 文字カード内側 scale-host

本家流 + AllMarks オリジナリティの hybrid:

1. **外側 clone (width/height tween)** = 本家 destefanis と同方式 (= 何も変えない)
2. **文字カードのみ内側に scale-host を挿入** → 「文字も一緒に拡大」 を実現
3. **scale-host は CSS `zoom`** (= 当初 transform:scale を試したが文字 raster blur → user 報告「どんどん悪く見える」 → zoom 切替、 browser 再レイアウト + font-size 真の値で再描画 = 文字常に crisp)
4. **`cardWidth=280` ハードコード削除** → source の実 width で typography tier 揃った (= 過去ここで「箱は同じ視覚 width だが内側 font tier が違う」 jump が起きていた)

### コード変更 (= [components/board/Lightbox.tsx](components/board/Lightbox.tsx))

- `wrapCloneWithScaleHost` 新規 helper (≈ line 291) — 文字カード検出 + scale-host 挿入
- OPEN tween (≈ line 884) / CLOSE tween (≈ line 626) の onUpdate で zoom を外側 width に追従更新
- `LargeTextCardScaler` 内部 `transform:scale` → `zoom` 化 (≈ line 2037)
- `fakeBoardItem.cardWidth: 280` ハードコード削除 (≈ line 1834)

### memory 訂正 (= 次セッションで同じ誤読を繰り返さない)

- [reference_destefanis_visual_spec.md](C:/Users/masay/.claude/projects/c--Users-masay-Desktop--------/memory/reference_destefanis_visual_spec.md) — 本家 transform:scale → width/height tween と訂正
- [reference_flip_scale_compensation.md](C:/Users/masay/.claude/projects/c--Users-masay-Desktop--------/memory/reference_flip_scale_compensation.md) — transform:scale FLIP 不採用確定、 hybrid scale-host を正解として記録
- MEMORY.md index も訂正済

### 残課題 (= 次セッション 36 で着手)

user 観察: cardWidth fix 後も swap 瞬間に title font が「かくっ」 と変化する。 user 仮説 = **board (URL あり) / .media (URL なし、 omitMeta) のレイアウト差**。 妥当な見立て。

直接原因: TextCard の `display: flex; flex-direction: column` + `.title` の `flex: 1` (headline mode) で、 meta 行有無により title container の vertical サイズが変化 → text の visual 位置・line layout が swap 瞬間に切り替わる。

次セッション 36 の選択肢:

- **A 案**: `.media` でも URL 表示する (= omitMeta 撤去) — シンプル、 右パネルと URL 重複が tradeoff
- **B 案**: アニメ clone から URL 行を strip — 重複なし、 click 瞬間に URL がパッと消える
- **C 案**: URL 行を cross-fade で opacity tween + typography 揺れ別調整 — リッチ、 工数大

session 35 の感覚では A が筋。 ただし board → lightbox の文脈遷移 / 右パネルとの情報重複の議論を 36 でやってから確定。

### 検証

- tsc clean / vitest 488/488 全通過
- 本番 3 回 deploy: scale-host 初版 → zoom 化 → cardWidth hardcode 削除
- user 実機確認: 文字 crisp + typography tier 揃った OK、 残るは URL 有無による layout 差のみ

### commits

(close-out commit で TODO + CURRENT_GOAL + Lightbox.tsx をまとめて記録)


---

## セッション 36 (2026-05-17) — 文字 jump 完全決着 (3 案を経て根本原因 = cardWidth 二重管理ズレ確定)

### 何が起きたか

session 35 末で残った「swap 瞬間に title font がかくっと変化」 を 3 アプローチ経由でついに完全解消。 副作用として「user 否定から元実装の意図を読む」 学びを得た。

### 失敗 1: A 案 (omitMeta 撤去) — 私の独断、 user 即否定

CURRENT_GOAL.md と session 35 narrative に「session 35 の感覚で A が筋」 と書いて、 そのまま実装。 [Lightbox.tsx](components/board/Lightbox.tsx) `LargeTextCardScaler` から `omitMeta` prop を削除 + [TextCard.tsx](components/board/cards/TextCard.tsx) の prop 定義も削除 (= 死にコード扱い) → deploy。 user 実機確認で:

- favicon が巨大化してガビガビ (= 16px Google favicon を zoom 3x で 48px 描画、 raster blur 確定)
- title が「pushmatr…」 で省略 (= board の URL 行ありレイアウトで描画 → headline mode の metaBottom が下スペース取って title が縮む)
- user 言: 「やりたいこと違うよね？テキストカードせっかくそのまま拡大できるようになったのに」

omitMeta は session 34 のメモでは「favicon bitmap blur 回避」 とだけ記録されていた。 実は user 体験では「title が伸び伸び拡大される」 = session 35 で確立した core UX を成立させていた。 私はメモの理由だけ見て独断で撤去した = 反省ポイント。

### 失敗 2: B 案 (clone から URL 行 strip) — 半分正解、 まだ残る

omitMeta を revert (= TextCard.tsx に prop 定義復活 + Lightbox.tsx で omitMeta=true 戻し) + `wrapCloneWithScaleHost` 内で `[class*="metaTop"], [class*="metaBottom"]` を DOM strip して、 clone と swap 先の layout を一致させた。 deploy → user 実機: **まだ「かくっ」 残る、 徹底調査せよ** と指示。

### 徹底調査で根本原因確定

[Lightbox.tsx](components/board/Lightbox.tsx) OPEN tween + LargeTextCardScaler + [CardsLayer.tsx](components/board/CardsLayer.tsx) `buildSkylineCard` + [BoardRoot.tsx](components/board/BoardRoot.tsx) `persistentCustomWidths` を順に追って、 board の cardWidth が **二重管理** されていることを発見。

| カード状態 | 実 rendering width (= 画面に映る) | IDB 保存値 (`it.cardWidth`) |
|---|---|---|
| user 手動 resize 済 | `customWidths[id] = it.cardWidth` | `it.cardWidth` ✅ 一致 |
| **resize してない** | **`cardWidthPx` (= size slider 値、 例 200)** | **`280` (= IDB default)** ❌ ズレる |

LargeTextCardScaler の `boardW = fakeItem.cardWidth = item.cardWidth ?? 280` は IDB 保存値 → resize していないカード + size slider 非 default のとき、 board 実 width 200 ≠ swap 先 boardW 280 で **typography mode が変わる**。 `pickTitleTypography` は cardWidth で headline / editorial / index を判定するので、 200 と 280 で mode が違うと fontSize / lineHeight / flex 配置が全部変わる = swap で「かくっ」。

session 35 の `cardWidth: 280` ハードコード削除 fix は「user が resize 済」 ケースしか cover していなかった。

### 修正: source DOM の実 width を実測 (C 案相当)

```typescript
const boardW = useMemo<number>(() => {
  if (typeof document === 'undefined') return fakeItem.cardWidth
  const source = document.querySelector<HTMLElement>(`[data-bookmark-id="${fakeItem.bookmarkId}"]`)
  if (!source) return fakeItem.cardWidth
  const w = source.getBoundingClientRect().width
  return w > 0 ? w : fakeItem.cardWidth
}, [fakeItem.bookmarkId, fakeItem.cardWidth])
```

これで:
- size 決定ロジック (slider / 個別 resize / 混在 / 将来の新ロジック) と独立
- 画面に映る実 width を直接拾う = 必ず source と一致
- source DOM が無い (= share view / culling) ケースだけ IDB fallback

LargeBoardCardClone (≈ line 1964) で同じ手法を既に使っており、 実績ある手。

### コード変更

- [components/board/Lightbox.tsx](components/board/Lightbox.tsx) `LargeTextCardScaler` (≈ line 2037): boardW を DOM 実測に変更、 useMemo + useMemo import 追加
- [components/board/Lightbox.tsx](components/board/Lightbox.tsx) `wrapCloneWithScaleHost` (≈ line 296): clone から metaTop/metaBottom 行 strip (= B 案残骸、 layout 一致補強として残す)
- [components/board/cards/TextCard.tsx](components/board/cards/TextCard.tsx): omitMeta prop 復活 + Lightbox.tsx で omitMeta=true 維持

### 検証

- tsc clean / vitest 488/488 全通過
- 本番 3 回 deploy: A 案 (= omitMeta 撤去、 user 否定) → B 案 (= revert + clone strip、 不十分) → C 案 (= DOM 実測、 user 「やった！ やっと出来てます！」)
- 実機: size slider tier 変更 / 個別 resize / 混在ケース全部 OK

### memory 更新

- 新規: [reference_cardwidth_dual_management.md](C:/Users/masay/.claude/projects/c--Users-masay-Desktop--------/memory/reference_cardwidth_dual_management.md) — cardWidth 二重管理の罠 + DOM 実測解
- 新規: [feedback_user_observation_reveals_intent.md](C:/Users/masay/.claude/projects/c--Users-masay-Desktop--------/memory/feedback_user_observation_reveals_intent.md) — user 「もとはこうだったのに」 = 既存実装は core 仕様の可能性、 撤去前に why を再点検

### 新規発覚 (= session 37 持ち越し)

ツイート (X) Lightbox で thumbnail が profile image / mediaSlot 解析失敗のケース → X ロゴだけ巨大ガビガビ表示、 動画ツイートでも動画が出ない。 user 提示の再現 URL 3 つを TODO.md `B-#19` に記録済。 session 37 で集中対応。

### commits

(close-out commit でこの narrative + TODO.md + CURRENT_GOAL.md + Lightbox.tsx + TextCard.tsx をまとめて記録)

---

## セッション 37 (2026-05-17) — ツイート Lightbox 経路の 3 連 fix (CSS scoping + animated_gif + unified_card)

### 何が起きたか

session 36 末に user 発覚した「ツイート Lightbox で profile image 巨大ガビガビ + 動画ツイート未再生」 を Playwright + 実機 DevTools で**根本原因を 3 つ別個に確定**し、 全部 1 commit で fix → prod deploy → 4 URL 全て検証成功。 session 36 反省 (= 独断で大きく動かない) を活かして、 事実取得 → user 合意 → 実装の順で進行。

### 出発点 = user 提示 4 URL

- https://x.com/konrad_designs/status/2054511169461727508 (= animated GIF)
- https://x.com/EnterProAI/status/2046946956455379344 (= unified_card 動画 + リンクカード)
- https://x.com/lovart_ai/status/2049735758127276237 (= unified_card 動画 + リンクカード)
- https://x.com/men_masaya/status/2055536632162549980 (= 文字のみ、 user 自身の日本語、 session 中盤に追加発覚)

### Phase 1: 事実取得 (= 推測ゼロで)

`cdn.syndication.twimg.com` の生 JSON を直接 curl して 4 URL の payload 構造を比較:

| URL | mediaDetails | card.name | 結果 |
|---|---|---|---|
| konrad | `[{type:'animated_gif', video_info.variants:[mp4]}]` | undefined | parser が `type==='video'\|'photo'` のみ走査 → drop |
| enterpro | `[]` | `'unified_card'` | mediaDetails 空、 媒体は `binding_values.unified_card.string_value` (JSON 二重 encode) 内の `media_entities` map |
| lovart | `[]` | `'unified_card'` | 同上 |
| masaya | `[]` | undefined | 純テキスト、 media なし |

→ 3 つ別個の bug が同時発火。

### Phase 2: Playwright で実機再現

[playwright-test-tweet-lightbox.js](C:/Users/masay/AppData/Local/Temp/playwright-test-tweet-lightbox.js) で 4 URL を `/save` route 経由で IDB に投入 → board → Lightbox click → DOM 計測。

**主犯発覚**: 全 4 URL で Lightbox.media 内に **`img.lightboxTextFavicon` が natural 32x32 で displayed 464x464** (= 14.5x upscale)。 これが「巨大ガビガビ X ロゴ」 の正体。 user が「profile image」 と言っていたが実体は **Google favicon for x.com** だった。 同時に、 favicon が flex meta 行を 464px 占有 → `lightboxTextCard` の overflow:hidden で title が画面外に → 「文章表示できてない」 (URL 4) の原因も同じ。

### Phase 3: 真因 = CSS scoping bug (session 30 で混入)

[Lightbox.module.css:190](components/board/Lightbox.module.css#L190) `.imageBox img { width:100%; height:100%; max-width:none; max-height:none }`。 commit 0fd7b8a (session 30) で**通常画像 Lightbox**用に追加されたが、 descendant 選択子のため**孫要素の favicon まで波及**。 session 32 で `LightboxTextDisplay` (= 外側 `.imageBox` でラップ、 中に `.lightboxTextMeta` > `img.lightboxTextFavicon`) が追加されてから罠が発火 — 通常画像 tweet を主に開いていれば発覚せず、 unified_card / animated_gif / 純テキスト tweet を開いたときだけ刺さる罠だった。

### 修正 3 つ (全部 1 commit)

**Fix 1 (主犯) — CSS scoping 直接子化**: `.imageBox img` → `.imageBox > img`。 通常画像 Lightbox は `<img>` が直接子なので影響なし。 text card / clone 系の孫 img は救済。

**Fix 2 — animated_gif 対応**: [lib/embed/tweet-meta.ts](lib/embed/tweet-meta.ts) で `pushMediaSlot` helper を切り出し、 `type === 'video' || type === 'animated_gif'` を統合扱い (両者 mp4 variant の構造同じ)。

**Fix 3 — unified_card 対応**: `decodeUnifiedCardMediaEntities(binding_values)` で JSON.parse → media_entities 走査。 mediaDetails が空かつ `card.name === 'unified_card'` のときだけ補完取得 (= 通常 mediaDetails 経路は無変更、 mix 防止)。 malformed JSON は空配列で graceful degrade。

### 検証

- **tsc clean** + **vitest 493/493 全通過** (+5 new tests: animated_gif extraction / unified_card video / 空 entities / malformed JSON / mediaDetails 優先)
- **Playwright prod 検証** (deploy 後): 4 URL 全部正しく rendering
   - konrad: `<video>` 1280x960 mp4 で再生可能
   - enterpro: `<video>` 1280x720 mp4 で再生可能
   - lovart: `<video>` 1280x720 mp4 で再生可能
   - masaya: 24x24 favicon + 大きい日本語テキスト表示

### 副産物 (= 解決はしたが学び)

- **bookmarklet の og:image = profile image 問題**は本件 fix で間接的に解消。 Lightbox は thumbnail を使わず favicon + meta.text を使う path に乗ったので、 thumbnail に profile image が入っていても Lightbox 表示には影響しない。 board card 側で profile image が出る件は別問題 (= IDEAS.md 系の board 表示改善で扱う)。
- **persistMediaSlots が Lightbox open 時に走る** ので、 既存 IDB の古い bookmark も Lightbox を 1 回開けば mediaSlots が backfill される。 BoardRoot の bulk backfill も同経路。

### multi-playback vision との関係 (= user 確認済)

board 上で動画再生し続ける + 同時再生する vision の**前提条件**は、 「**parser が tweet の動画 url を取得できる**」 こと。 Fix 2, 3 でこの土台が揃った。 board card autoplay loop の実装 + 複数選択 UI は **session 37 後の別タスク**として残る (= IDEAS.md 既存記載)。

### memory 更新

- なし (= 既存の `reference_twitter_syndication_cors.md` / `reference_cardwidth_dual_management.md` / `project_allmarks_vision_multiplayback.md` は引き続き有効)
- 教訓は本 narrative に集約 (= 「CSS scoping bug は後発の利用者を巻き込んで罠化する」、 「parser に新フォーマットを add する時は helper 切り出して既存 case を壊さない」)

### Phase 2 (= session 内追加 fix): board と Lightbox で text card 色が違う

user 報告: 「自分のツイートはムードボード上では黒地なのに Lightbox で白地にされてしまう」。

#### 原因

board の [TextCard](components/board/cards/TextCard.tsx) は session 31 で `pickTextCardColor(cardId)` (= djb2 hash の bit 1) で **white / black variant を deterministic に決める**仕組みだった。 が、 Lightbox の `LightboxTextDisplay` は session 32 で別 component として作られていて、 `background: var(--card-white)` でハードコード白固定。 → 同じ tweet でも board (= 黒の場合あり) と Lightbox (= 常に白) で見た目が分岐。

#### 修正

- [Lightbox.tsx](components/board/Lightbox.tsx) `LightboxTextDisplay` に `cardId` prop 追加 → 同じ `pickTextCardColor` で variant 決定 → `lightboxTextCard_white` / `lightboxTextCard_black` class 切替
- [Lightbox.module.css](components/board/Lightbox.module.css) `.lightboxTextCard` から `background` ハードコード削除、 `_white` (= `var(--card-white)`) と `_black` (= `#0a0a0a` = board TextCard.black 同色) variant 追加。 各 variant 配下で meta color (rgba(255,255,255,0.55)) / favicon タイル (rgba(255,255,255,0.08), opacity 0.7) / title color (rgba(255,255,255,0.92)) も反転
- `isTweetTextOnly` path で `cardId={item.cardId}` を渡し
- cardId 不明 (= share view) は `pickTextCardColor('')` → white で graceful fallback

#### 検証

- tsc clean
- Playwright (= 2 回 deploy)
  - white variant: `bg=rgb(255, 255, 255)`、 title `#0a0a0a`
  - black variant (= 強制 cardId 検証): `bg=rgb(10, 10, 10)`、 title `rgba(255, 255, 255, 0.92)`
  - 視覚スクショ confirmed
- prod 反映済 → user の既存 IDB の cardId が black hash なら、 ハードリロード後に board と同じ黒地で表示される

### Phase 3 (= session 内追加 fix): text card open-swap jump 解消

user 報告: 「ツイートカードも、 他のテキストカードと同様にライトボックスになってから一段表示が学っと変わる」。

#### 調査 (= Playwright slow capture + DOM 計測)

[playwright-test-jump-slow.js](C:/Users/masay/AppData/Local/Temp/playwright-test-jump-slow.js) で 30ms 連写、 open 中の clone と swap 先 media の構造を比較:

| | open 中の clone | swap 先 media |
|---|---|---|
| 構造 | 板の TextCard 複製 + `wrapCloneWithScaleHost` で metaTop/metaBottom strip | `LightboxTextDisplay` (= 別 component) |
| header 行 | なし (= 削除済) | 「x.com」 + 24px favicon |
| title | TextCard の 18px が CSS zoom で約 3.3x = 60px 見え | 40px native 固定 |

→ swap 瞬間: **「x.com」 行が突然出現 + title が 60 → 40px に縮む**。 これが「学っと」 jump の正体。

#### 修正

[Lightbox.tsx:1517](components/board/Lightbox.tsx#L1517) を 1 行 swap:
```diff
- return <LightboxTextDisplay title={text} url={item.url} aspect={aspect} cardId={item.cardId} />
+ return <LargeTextCardScaler fakeItem={fakeBoardItem} aspect={aspect} />
```

`fakeBoardItem` は直前で構築済 (session 32 から残っていた使われない準備、 ここで生きた)。 これで text-only tweet も**非ツイートのテキストカードと同じ経路**を通る → clone も media も同じ TextCard component (omitMeta=true) → 構造一致 → swap jump が**原理的にゼロ**になる。

#### 影響範囲 (= user に事前確認した「壊さない」 担保)

| 経路 | 影響 |
|---|---|
| 動画 / 画像付き tweet | 完全に別経路 (= `slots.length > 0` で先に return)、 ノータッチ |
| 非ツイートのテキストカード | 既存の LargeTextCardScaler 経路、 何も変えない |
| 板の TextCard / 通常画像 lightbox | 一切触らない |

`LightboxTextDisplay` 関数 + 関連 CSS (`.lightboxTextCard*`, `.lightboxTextMeta`, `.lightboxTextFavicon`, `.lightboxTextTitle`, `.lightboxTextDomain`) は dead code 化したが、 別 spec で cleanup 予定 (= 今は defensive に残置)。

#### 検証

- tsc clean + vitest 493/493 (channel.test.ts は既知 flake、 再実行で pass)
- Playwright prod 検証: clone と media が同構造で swap → 「x.com」 行の突然出現 / title 縮みなし

#### 副次的に揃ったこと

- 板で見える内容と Lightbox で見える内容が**同じ構造 + 同じ色 variant** (= phase 2 で揃えた white/black variant も TextCard 内部の `pickTextCardColor(cardId)` でそのまま動く)
- session 35 で確立した「テキストカードがそのまま伸び伸び拡大」 の核心仕様にツイートも統合された

### memory 更新

- なし。 既存 memory (`feedback_check_reference_before_patching.md`, `reference_cardwidth_dual_management.md`, `feedback_user_observation_reveals_intent.md`) は引き続き有効

### commits

- `560b33f` fix(tweet): session 37 phase 1 — fix lightbox favicon ballooning + parse animated_gif + unified_card
- `d73c95c` fix(lightbox): session 37 phase 2 — match TextCard color variant in Lightbox text view
- `efcac1d` fix(lightbox): session 37 phase 3 — route text-only tweet to LargeTextCardScaler (eliminates open-swap jump)
- prod deploys: `4b01a066` → `1c1fbbf4` → `d262bb34` → `https://booklage.pages.dev`
