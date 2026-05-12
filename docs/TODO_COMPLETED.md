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

