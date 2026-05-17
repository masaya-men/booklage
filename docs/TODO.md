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

### 直近の状態 (2026-05-17 セッション 37 — ツイート Lightbox 3 連 fix 完全決着 / 主犯は CSS scoping bug)

セッション 37 で session 36 末に発覚した「ツイート Lightbox で profile image 巨大ガビガビ + 動画ツイート未再生」 を**根本原因 3 つ同時に確定 + 全部 fix**。 4 URL 全て prod で動作確認済:

1. **主犯 (= CSS scoping bug)**: [Lightbox.module.css](components/board/Lightbox.module.css#L190) `.imageBox img` の descendant 選択子が孫要素の `lightboxTextFavicon` まで巻き込んで 32x32 → 464x464 (= 14.5x) 膨張。 X favicon が画面占有して「巨大ガビガビ X ロゴ」 化、 同時に title を overflow:hidden で押し出して「文章表示できてない」 (URL 4) 化。 session 30 の image lightbox 対応で混入、 session 32 で LightboxTextDisplay 追加から罠化していた。 → `.imageBox > img` (直接子) に scope して救済。 通常画像 lightbox は無変更
2. **共犯 1 (= animated_gif 未対応)**: [tweet-meta.ts](lib/embed/tweet-meta.ts) が `'video' / 'photo'` のみ走査、 X の GIF tweet (= mediaDetails[].type='animated_gif', mp4 variant 持ち) を silently drop。 → `pushMediaSlot` helper 切り出し + 統合扱い
3. **共犯 2 (= unified_card 未対応)**: X の今や標準フォーマット、 媒体は `card.binding_values.unified_card.string_value` (= JSON 二重 encode) の `media_entities`。 → `decodeUnifiedCardMediaEntities` で抽出、 mediaDetails 空かつ unified_card のときだけ補完 (= 通常経路無変更、 mix 防止)

**本番反映済** → `https://booklage.pages.dev` 。 commit `560b33f`。 vitest 493/493 (+5 new) / tsc clean / Playwright 4 URL 全 OK。 narrative + 学び詳細は [TODO_COMPLETED.md](./TODO_COMPLETED.md) セッション 37 セクション。

**multi-playback vision との関係**: parser が animated_gif + unified_card の動画 url を取得できるようになったので、 board で動画再生し続ける機能の**土台**が揃った。 board card autoplay loop + 複数選択 UI は別タスク (= IDEAS.md 既存記載)。

### 次セッション (= 38) でやること

選択肢:
1. **multi-playback vision の board card autoplay 着手** — Fix 2, 3 で得た mediaSlots を board 側で活用、 動画カードが板の上で常時再生する render layer。 user の理想の核に向かう本筋
2. **テキストカード Lightbox 構造再設計** — session 36 で持ち越した「テキストのみカードの構造再設計 / Lightbox 右エリア整理」 (= TODO 旧 Item 2 / 4)
3. **B-#3 重複 URL でサムネ等が出ない問題** — 短時間タスク
4. **B-#13 TopHeader brushup (ScrollMeter 下配置)** — 視覚調整系

user 希望次第。 セッション開始時に user に選んでもらう。

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
