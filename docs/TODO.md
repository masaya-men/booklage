# 開発ToDo (AllMarks — 旧 Booklage、 2026-05-16 コード rebrand 済)

> 完了済みタスク → [TODO_COMPLETED.md](./TODO_COMPLETED.md)
> アイデア・将来構想・代替案 → `docs/private/IDEAS.md` (非公開、 gitignored)
> 今このセッションのゴール → `docs/CURRENT_GOAL.md` (5〜10 行のみ、 毎回最初に読む)

このファイルは **アクティブな backlog のみ**。 narrative や ✅ 完了は TODO_COMPLETED.md に移動する。

---

## 🔴 月末 (2026-05-31 頃) 必須リマインダー

**ユーザーが「allmarks.app」 ドメインを取得したか確認する。**

- 取得方法: `https://dash.cloudflare.com/` → Domain Registration → allmarks.app → 約 ¥1,600/年
- 取得済 → リブランド実装に進む (詳細は `docs/private/2026-05-11-allmarks-branding-spec.md`)
- 未取得 → 取得を促す

---

## 現在の状態 (次セッションはここから読む)

### 直近の状態 (2026-05-16 セッション 31 — 1 commit 本番 deploy 済)

セッション 31 は **「Lightbox 周りまとめ sprint」** を 1 sprint で完遂:

**セッション 31 の主要変更 (= 1 commit に集約)**:
1. **TextCard 再設計** (= 2 パターン deterministic 分配、 typography 40% 縮小、 reference 画像準拠)
   - `lib/embed/text-card-color.ts` 新規 (djb2 hash で cardId → white | black、 「置かれた色で固定」)
   - `lib/embed/title-typography.ts` 全モード約 40% 縮小 + maxLines 緩和
   - `lib/embed/text-card-measure.ts` を `measureTextCardLayout` に刷新 (9:16 上限で ellipsis)
   - `TextCard.module.css` に `.white` / `.black` variant 追加、 favicon は黒地時馴染ませ
2. **Lightbox 統合** (= Bug A-1 自動解決)
   - `LightboxItem` に `cardId?` 追加 → board と Lightbox で同色 variant 維持
   - `LightboxMedia` の placeholder div を削除、 `.imageBox` aspect wrapper の中で大 TextCard (cardWidth=600) 再描画
   - `DefaultText` に `hideTitle` prop 追加 → text-only card で h1 重複表示抑制
3. **Bug B 震え修正 (= B-b 軽量 fix を適用)**
   - `createLightboxClone` で start rect を `Math.round` 化 + `willChange` + `translateZ(0)` + `backfaceVisibility: hidden`
   - open / close 両 tween の target rect も `Math.round` 化
   - 完全 fix (= B-c transform + radius child 化) は scope 大、 体感残れば次セッションで本格対応

- 本番反映済 → `https://booklage.pages.dev` をハードリロードで確認
- vitest 488 (= flaky channel test 除き全 pass) / tsc / build clean

### 次セッション (= 32) でやること

ゴール: **`docs/CURRENT_GOAL.md`**。 セッション 31 で Lightbox 周りひと段落、 **foundation 3 本柱** から本腰:

1. **サイジング汎用化** (= clamp(MIN, vw, BASE)、 spec `docs/specs/2026-05-12-sizing-migration-spec.md`)
2. **広告 placement 予約 slot** (= board / footer / PiP)
3. **manual tag schema** (= IDB schema bump + tag CRUD + filter)

推奨順 (1) → (2) → (3)。 もしくは Bug B 震えが本番で体感残っていれば **B-c 本格修正** を先に。 次セッション開始時に user 確認。

### foundation 3 本柱 (= セッション 32 以降)

セッション 30 で合意した骨組み:
1. **サイジング汎用化** (= clamp(MIN, vw, BASE)、 spec 既存 `docs/specs/2026-05-12-sizing-migration-spec.md`)
2. **manual tag schema** (= IDB schema bump + tag CRUD + filter)
3. **広告 placement 予約 slot** (= board / footer / PiP)

推奨順 (1) → (3) → (2)。 詳細は `docs/private/IDEAS.md` 既存セクション + 戦略 spec。

### 拡張機能 polish (= セッション 32 以降、 別 sprint)

セッション 30 で 3 項目合意 (詳細 IDEAS.md F 項):
- ✅ PiP 自動常駐 (= 高難度)
- ✅ SNS いいね / ブクマ連動 (X / YouTube から、 設定で挙動切替)
- ❌ 右クリック位置改善は不採用、 代替の ショートカット + floating action button で対応

### リブランド進行: Booklage → AllMarks (= 2026-05-16 コード rebrand 完了)

- 新ブランド: **AllMarks** / メインドメイン: **allmarks.app** (取得は月末 2026-05-31 予定)
- 詳細 spec: `docs/private/2026-05-11-allmarks-branding-spec.md` (gitignored)
- ✅ コード rebrand 完了 (= UI / i18n / 拡張 / docs / 型名 / log prefix 全部 AllMarks)
- 🔒 **意図的に維持**: `DB_NAME='booklage-db'`, deploy URL `booklage.pages.dev`, wrangler `--project-name=booklage`, `package.json` "name", bookmarklet 内 programmatic ID, GitHub repo 名
- 🔜 **ドメイン取得後**: Cloudflare Pages 新 project 作成 → 301 redirect → GitHub repo rename → 拡張機能ストア submit (AllMarks v1.0 として 1 回で)

---

## 🐛 未対応バグ・改善 (active backlog)

完了済バグは TODO_COMPLETED.md に移動済。 ここはアクティブのみ。

### 表示・サムネ系

- **B-#3 重複 URL でサムネ等が出ない問題** — 同 URL 重複追加時の表示挙動を確認・修正 (セッション 20 では真因未調査、 個別 session で着手)
- **MinimalCard polish** — 64px favicon が S サイズ (160px) で大きく見える可能性。 Visual Companion でモック比較してサイズ判定 (セッション 20 で実装後、 視覚調整は次回)
- **Task 12: 全件再 check 設定 UI** — viewport revalidation で日常運用は OK だが、 ユーザーが 「いま全件チェック」 を 1 クリックで kick できる設定パネル。 設定パネル自体が未実装なので別 spec 立ち上げ要

### Lightbox animation 系 (セッション 23-24 で B-#17 open/close/動画 + 揺れ完成、 残課題あり)

- **B-#17-#3 internal nav (wheel scroll で隣カード) の clone-based 移行** (中期) — open/close は clone-based に移行済だが、 Lightbox 内で wheel scroll した時の隣カード切替は **既存 transform:scale ロジックのまま**。 動作確認まだ。 open/close が本番で安定したのを受けて、 次に着手するならここ

- **角丸 24 → 20 検討** (= B-#17 落ち着いた現時点でやって良い視覚比較) — 短時間タスク

### カード操作・PiP

- **B-#7 自由サイジング 縮小時の clipping ポイント** — サイズ 3 付近で「がくっ」 と変わる感触あり
   - セッション 13 で調査済 (修正 revert、 持ち越し)
   - root cause: 縮小カード自身は滑らかだが**周囲カードの reflow burst** が原因 (skyline masonry が discrete に bin-packing)
   - 計測スクリプト: `C:\Users\masay\AppData\Local\Temp\playwright-test-resize-neighbors.js` / `-enlarge.js`
   - 保留中の代替案: (a) リサイズ中は周囲固定、 release で reflow / (b) FLIP tween 再チューニング (duration / ease) / (c) skyline ヒステリシス / (d) 受容
   - ユーザー希望: 周囲の「ぬるっと」 質感は維持、 完全固定 (案 a) は最終手段
- **B-#8 PiP click → カードへスクロール の見切れ** — カードサイズによって画面外で止まる、 画面中央付近で止まる scroll に変更
- **B-#12 拡大時 viewport overflow 破綻** (セッション 13 で観測) — 自由リサイズで viewport を超える幅まで拡大すると skyline が破綻、 他カードが画面外に押し出される
   - root cause 仮説: `computeSkylineLayout` の containerWidth clamp が単一カードの超過時に未定義
   - 対策候補: (a) `maxCardWidth` を絞る / (b) skyline 側で width > containerWidth カードを単独行 / (c) ResizeHandle で max を明示

### レスポンシブ (★ユーザー希望で最後に回す)

- **B-#10 モバイル UX 本格チューニング** (セッション 9 末ユーザー報告)
   - モバイルでカード列数が多すぎる + テキストカード縦伸び
   - デフォルトでモバイルは ~3 列にする
   - ピンチ操作でカード size 変更 (将来機能)
   - 実装方針: A 案 (即効) = `lib/board/size-levels.ts` で viewport-aware column / B 案 = mobile 起動時 level 2 default / C 案 (本格) = モバイル専用 SizeLevel テーブル
   - テキストカード縦伸び: `TextCard.tsx` に `max-height` or `aspect-ratio` クランプ + overflow:hidden

### TopHeader / chrome

- **B-#13 TopHeader brushup** (memory `project_board_header_brushup.md` 参照)
   - 暫定配置、 将来 brushup 方向: **ScrollMeter を下配置** (Lightbox の表現と統一)

---

## ✨ 新機能アイデア (詳細は IDEAS.md)

`docs/private/IDEAS.md` 参照。 ここはタグだけ:

- X 自動翻訳取り込み + 原文切替 (Lightbox 内)
- テーマ案: SF 軍事スタイル (ガンプラ / 戦闘機パネル分け / デカール / 墨入れ質感)
- ギャップスライダー (カード間 gap 無段階) + 背景タイポ
- PiP 内広告
- SNS Share ボタン連携 (X / YouTube)
- ブラウザ完結 AI 自動タグ付け
- ✅ 複数画像 / 動画ホバー切替 (mediaSlots 実装中、 セッション 17 deploy 済)

---

## 📐 サイズ設計移行 (Phase 2-6 残)

- Phase 1 完了 (セッション 15、 `app/globals.css` :root に `--fs-*` namespace 追加、 参照ゼロ = 見た目変化なし)
- Phase 2-6 は `docs/specs/2026-05-12-sizing-migration-spec.md` 参照
- 全プロジェクト共通思想: `C:\Users\masay\.claude\design-philosophy-sizing.md`

---

## 過去の試行・教訓 (消すな、 同じ轍を避けるため)

### IDB schema bump は不可逆
- 一度 v12 → v13 に上げた IDB は v12 コードで開けない (VersionError)
- rollback は schema bump を含む deploy では事実上不可
- **bump 前にローカル dev で v12 → v13 を実機検証**することが**絶対**必要
- 恒久対策の 3 本柱は `docs/specs/2026-05-12-idb-launch-readiness.md` 参照

### Lightbox `.media` の rect 計測
- FLIP open/close アニメは `.media` の `getBoundingClientRect()` ベース
- `.media` の子に explicit width のない wrapper を置くと intrinsic 依存で rect が崩れる
- `<img>` は intrinsic dim を持つので安定、 `<div>` wrapper は要 explicit width

### 拡張機能 sideload
- `<all_urls>` host_permission を加えたら **再 sideload 必須** (Chrome は既存承認を upgrade しない)
- 検証手順は TODO_COMPLETED.md にアーカイブ済
