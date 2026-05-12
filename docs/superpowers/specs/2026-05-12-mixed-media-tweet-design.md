# 動画+画像 mix tweet 対応 — 設計

- **日付**: 2026-05-12 (セッション 15 brainstorm)
- **対応元アイデア**: セッション 14 末ユーザー実機 FB (I-07-#3)
- **TODO 連動**: [docs/TODO.md](../../TODO.md) §「セッション 14 末ユーザー実機フィードバック」 I-07-#3
- **先行 spec**: [2026-05-12-multi-image-hover-design.md](./2026-05-12-multi-image-hover-design.md) (I-07 Phase 1)

## 0. ゴール

X (Twitter) の **動画 1 本 + 画像 N 枚** が混在する tweet に対して、 board / Lightbox で X 本家と同じく **順序付き carousel** で全メディアを切替えて閲覧できるようにする。

旧 I-07 spec の §1 では「mixed media は存在しない」 と非ゴールに置いたが、 セッション 14 末のユーザー実機検証で **mixed media tweet が API 上実在する** ことを確認 (例: tweet `1842217368673759498` は `mediaDetails: [video, photo, photo]` を返す)。 仕様抜けの修正。

## 1. スコープ

### MVP 対象
- **X (Twitter)** — 動画 1 + 画像 N (N≧1) の混合投稿
- **既存パスの統一化** — 単一画像 tweet / 単一動画 tweet / 複数画像 tweet も同じデータモデルに乗せる (現状の photos[]+videoUrl 並列管理を mediaSlots[] 統一型に集約)

### 非ゴール (本 spec)
- Bluesky 対応 (旧 spec Phase 2 で扱う、 mediaSlots[] 型を共有可能)
- 板上 (board) でのインライン動画再生 — 将来の B1 マイルストーン (multi-playback vision)、 本 spec は **データモデルだけ将来の動画再生機能と接続できる形に整備** する
- モバイル swipe gesture
- PiP 内 carousel

### 将来との接続
- 板上で複数動画を同時再生する機能 (= [core differentiator](https://github.com/anthropics/claude-code/issues) と memory 記載のミッション) を後で入れる時、 mediaSlots[i].type === 'video' を共通インタフェースで扱える設計
- 単一動画 tweet と mix tweet の動画スロットを同じ MediaSlot 型で表現 → 再生ロジックを 1 つに統一

## 2. 主要決定事項

| # | 論点 | 採用案 | 根拠 |
|---|---|---|---|
| 1 | carousel 構造 | **X 本家踏襲** = mediaDetails の API 順序通り 1 つの順序付き carousel | ユーザー Q1: A |
| 2 | 動画再生中の nav | **動画自動一時停止 + 切替**、 currentTime は維持 (戻ったら続きから) | ユーザー Q2: A |
| 3 | ドット見た目 | **板上 = 全 ● + 動画スロット薄い赤アクセント色**、 **Lightbox = ▶ (動画) + ● (画像) 形状区別** | ユーザー Q3: D + [feedback_minimal_card_affordances](../../../memory) |
| 4 | データモデル | **mediaSlots[] 統一型へ移行** (photos[] は読み取り fallback として併存、 数ヶ月後別 spec で廃止) | ユーザー指摘 (将来の動画再生機能で diff 最小) |
| 5 | 旧データ移行 | **Lightbox open 時の自然な backfill** (board 起動時の一括は I-07 Phase 1 と同じ理由で却下) | I-07 Phase 1 と同じ方針 |
| 6 | 失敗時 | **旧 photos[] へ fallback、 さらに無ければ thumbnail のみ** | 既存機能を壊さない |

## 3. データモデル

### 3-1. MediaSlot 型 (新)

```ts
// lib/embed/types.ts
export type MediaSlot = {
  readonly type: 'video' | 'photo'
  /** photo の場合: 画像 URL。 video の場合: poster 画像 URL */
  readonly url: string
  /** type='video' の時のみ。 best-bitrate mp4 URL */
  readonly videoUrl?: string
  /** type='video' の時のみ。 縦横比 (mediaDetails.original_info から計算) */
  readonly aspect?: number
}
```

### 3-2. IDB スキーマ変更

`BookmarkRecord` (`lib/storage/indexeddb.ts`) に optional field 追加:

```ts
/** v13: 動画+画像 mix tweet 対応の統一 media 配列。 mediaDetails の API
 *  順序通り。 単一画像も単一動画も複数画像も mix も全てこの 1 配列で表現。
 *  v12 の photos field は読み取り fallback として併存 (新規書き込みなし)、
 *  将来別 spec で完全廃止。 */
mediaSlots?: readonly MediaSlot[]
```

- `DB_VERSION` を **12 → 13** に bump (field 追加のみ、 no-op migration)
- 既存ロー (v12 で書かれた photos[] のみ) は mediaSlots undefined のまま、 表示は photos[] fallback で動く
- v12 → v13 自動 backfill は **しない** (Lightbox open 時の自然 backfill で gradual)

### 3-3. TweetMeta (in-memory)

```ts
// lib/embed/types.ts に追加
readonly mediaSlots?: readonly MediaSlot[]
```

既存 `photoUrl` / `photoUrls` / `videoUrl` / `videoPosterUrl` / `videoAspectRatio` は **後方互換のため当面維持** (mediaSlots から派生計算で埋める)。 数ヶ月後別 spec で deprecate。

### 3-4. BoardItem (use-board-data.ts)

`BoardItem` 型に `mediaSlots?: readonly MediaSlot[]` を pass-through。 `persistMediaSlots()` 関数を追加 (既存 `persistPhotos()` と同パターン)。

## 4. データ取得経路

### 4-1. parseTweetData() の改修

[lib/embed/tweet-meta.ts](../../../lib/embed/tweet-meta.ts) を改修。 mediaDetails 配列を**順序通り**走査:

```ts
const mediaSlots: MediaSlot[] = (r.mediaDetails ?? []).flatMap((m) => {
  if (m.type === 'video') {
    const videoUrl = pickBestMp4(m.video_info?.variants)
    if (!videoUrl || !m.media_url_https) return []
    const aspect = m.original_info
      ? m.original_info.width / m.original_info.height
      : undefined
    return [{ type: 'video' as const, url: m.media_url_https, videoUrl, aspect }]
  }
  if (m.type === 'photo' && m.media_url_https) {
    return [{ type: 'photo' as const, url: m.media_url_https }]
  }
  return []  // 未知 type は skip
})
```

派生フィールドの計算 (後方互換維持):
- `photoUrl` = mediaSlots の最初の photo の url (なければ undefined)
- `photoUrls` = mediaSlots の全 photo の url 配列
- `videoUrl` = mediaSlots の最初の video の videoUrl (なければ undefined)
- `videoPosterUrl` = mediaSlots の最初の video の url (= poster)
- `videoAspectRatio` = mediaSlots の最初の video の aspect
- `hasPhoto` = mediaSlots に photo が 1 つ以上ある
- `hasVideo` = mediaSlots に video が 1 つ以上ある

これで既存コード (派生フィールドを使ってる箇所) は無改修で動く。 新コードは mediaSlots を直接見る。

### 4-2. Cloudflare proxy 側

`functions/api/tweet-meta.ts` は **変更不要**。 syndication API のレスポンスをそのまま転送するだけなので、 client 側の parseTweetData だけで対応完結。

### 4-3. Save flow への組込み

- 新規ブクマ追加時 (bookmarklet / extension 経由) → save 直後の syndication fetch で mediaSlots を IDB に書き込む
- 既存 v12 ブクマ (mediaSlots undefined) → Lightbox open 時の tweet meta fetch 副産物として `persistMediaSlots()` で IDB backfill (fire-and-forget)
- 失敗時は mediaSlots undefined のまま放置 (= 旧 photos[] fallback で動く)

## 5. UX 詳細

### 5-1. ボード側 (ImageCard)

[components/board/cards/ImageCard.tsx](../../../components/board/cards/ImageCard.tsx) を改修:

- **データソース**: mediaSlots[] 優先、 なければ photos[] にフォールバック (型変換: `photos.map(url => ({type:'photo', url}))`)
- **初期表示**: mediaSlots[0].url (mix tweet なら動画 poster になる、 X 本家と同じ自然な挙動)
- **ホバー切替**: pointerX をカード幅で N 等分 (N = mediaSlots.length)、 該当 index の `.url` に img src を切替 (Phase 1 と同じ仕組み)
- **mediaSlots.length === 1 のカード**: ドット出さない、 ホバー切替なし (= 既存挙動)
- **板上では動画再生しない**: 動画スロットでも `<img src={slot.url}>` (poster) を表示するだけ。 将来 B1 マイルストーンでインライン再生対応する時に切替

#### ドット行
- カード下端から 8-12px 内側に **横並び ● 行** (mediaSlots.length 個)
- 全 ● で形は統一、 **動画スロットだけ薄い赤アクセント色** (CSS var `--media-slot-video-tint` で定義、 仮 `#ff6b6b` の 40% 不透明) — 微妙に「動画あり」 を示す
- 現在 index は不透明、 非アクティブは 30% opacity
- `pointer-events: none` (カードの hover 領域を奪わない)
- カード hover 開始 → 200ms フェードイン、 退出 → 200ms フェードアウト
- 配置 z-index は ResizeHandle 等の chrome より下、 thumbnail の上

### 5-2. Lightbox carousel

[components/board/Lightbox.tsx](../../../components/board/Lightbox.tsx) の `TweetMedia` を改修:

- **データソース**: meta.mediaSlots > item.mediaSlots > photos[] fallback (型変換) > 単一画像 fallback
- **現在 slot**: currentImageIdx で参照 (Phase 1 の state を流用)
- **動画スロット (slot.type === 'video')**: 既存 `<TweetVideoPlayer>` に slot を渡す (videoUrl, posterUrl=slot.url, aspect=slot.aspect)
- **画像スロット (slot.type === 'photo')**: 既存 `<img src={slot.url}>` (cover で envelope に着地)
- **slot 切替時 (↑↓ or ドットクリック)**:
  - 現在 slot が動画なら **`video.pause()` を呼んで一時停止** (currentTime は触らない)
  - 表示を新 slot に切替
  - 戻ってきた slot が動画なら、 元の currentTime / paused state を維持 (TweetVideoPlayer の内部 state を保つには key で同じ slot index を残す必要あり — 実装注意)

#### ドット行 (Lightbox 側)
- メディア下端の外側 (現状 I-07-#4 修正で `.frame` の子として絶対配置)
- mediaSlots 順に並べる
- **動画スロット = ▶ (CSS で三角形 or SVG icon)、 画像スロット = ●**
- アクティブドットは白、 非アクティブは 30% 不透明
- hover で非アクティブも軽くハイライト
- ヒット枠 24×24px (memory: 大きいマウスポインタ前提)

### 5-3. キーボード nav
- ↑ / ↓: 前 / 次 slot (端で止まる、 折返しなし)
- ← / →: 既存通り カード間 nav (slot とは無関係)
- Esc: 既存通り Lightbox close

## 6. 失敗時・移行期挙動

### 6-1. フォールバックチェーン

| データ状態 | 挙動 |
|---|---|
| mediaSlots[] あり (新型 v13) | mediaSlots を使う |
| mediaSlots[] なし、 photos[] あり (旧型 v12) | photos[].map で MediaSlot に型変換して使う (動画なし扱い) |
| mediaSlots[] なし、 photos[] なし、 thumbnail あり | thumbnail のみ表示 (= 元の挙動) |
| 何もなし | placeholder (= 元の挙動) |

### 6-2. API 失敗時
- Lightbox open で syndication 再 fetch が失敗 → mediaSlots は IDB に書き込まれない、 既存 fallback で動き続ける
- 動画スロットの mp4 が dead → TweetVideoPlayer 既存の "Watch on X" fallback

### 6-3. IDB schema 不整合
- mediaSlots field を読めない場合 (Zod ガード失敗) → undefined 扱い、 photos[] fallback

### 6-4. 数ヶ月後の cleanup
- 旧 photos[] field を BookmarkRecord から削除する別 spec を作成 (Phase A: deprecation 警告 → Phase B: 削除)
- 同時に派生フィールド (photoUrl, photoUrls, videoUrl, videoPosterUrl, videoAspectRatio, hasPhoto, hasVideo) も deprecate

## 7. ファイル変更一覧

### データ層
- [lib/constants.ts](../../../lib/constants.ts) — `DB_VERSION` 12 → 13
- [lib/storage/indexeddb.ts](../../../lib/storage/indexeddb.ts) — `BookmarkRecord.mediaSlots` 追加、 v13 migration (no-op)、 Zod schema 更新
- [lib/storage/use-board-data.ts](../../../lib/storage/use-board-data.ts) — `BoardItem.mediaSlots` pass-through、 `persistMediaSlots()` 関数追加
- [lib/embed/types.ts](../../../lib/embed/types.ts) — `MediaSlot` 型 export、 `TweetMeta.mediaSlots` 追加

### データ取得
- [lib/embed/tweet-meta.ts](../../../lib/embed/tweet-meta.ts) — `parseTweetData()` で mediaDetails 順次走査、 派生フィールドを mediaSlots から計算

### UI 層
- [components/board/cards/ImageCard.tsx](../../../components/board/cards/ImageCard.tsx) — mediaSlots 優先データソース、 ドット動画アクセント色
- [components/board/cards/ImageCard.module.css](../../../components/board/cards/ImageCard.module.css) — `--media-slot-video-tint` CSS var、 動画スロット ドットスタイル
- [components/board/Lightbox.tsx](../../../components/board/Lightbox.tsx) — TweetMedia の mediaSlots 対応 (動画スロット ⇄ 画像スロット切替)、 LightboxImageDots の動画 ▶ 表示、 動画 pause-on-nav
- [components/board/Lightbox.module.css](../../../components/board/Lightbox.module.css) — Lightbox 側 dots の動画 ▶ スタイル

### Save flow
- [lib/utils/bookmarklet.ts](../../../lib/utils/bookmarklet.ts) — save 時に mediaSlots も含める (parseTweetData 経由)
- [extension/content.js](../../../extension/content.js) — 同上

### テスト
- [tests/lib/tweet-meta.test.ts](../../../tests/lib/tweet-meta.test.ts) — mix tweet (video+photo+photo) / 単一動画 / 単一画像 / 複数画像 各ケースで mediaSlots 検証
- **NEW** `tests/e2e/board-mixed-media.spec.ts` — seed mix tweet → ボード hover で video poster ↔ photo 切替 → Lightbox open → ↑↓ で carousel → 動画再生中切替で pause 確認 → 戻って currentTime 維持確認

## 8. テスト計画

### unit (vitest)
- `parseTweetData()`:
  - 動画+画像 mix (1 video + 2 photos) → mediaSlots 3 要素 [video, photo, photo]
  - 単一動画 → mediaSlots 1 要素 [video]
  - 単一画像 → mediaSlots 1 要素 [photo]
  - 複数画像 (4 枚) → mediaSlots 4 要素 [photo×4]
  - 派生フィールド (photoUrl, videoUrl 等) が後方互換で正しく計算される
- IDB v12 → v13 migration: 既存 photos[] row が読める

### integration (Playwright E2E)
- Mix tweet を seed → ボード上カードで X 位置 33%/66%/100% hover で video poster → photo1 → photo2 切替
- Mix tweet を Lightbox open → 初期表示は動画 (再生可能)
- ドットクリック (画像 1) → 動画 pause、 画像 1 表示
- ↑ で動画スロットに戻る → currentTime 維持 (続きから再生可能)
- ↓↓ で範囲外 → 端で止まる (折返しなし)
- 旧 v12 ブクマ (photos[] のみ) → Lightbox open 後に mediaSlots backfill 確認、 board リロード後に hover 切替が動く

### 視覚回帰
- Phase 1 単一画像 hover 切替が壊れていない
- 単一動画 tweet の Lightbox 表示が壊れていない (mediaSlots[0] を使うが動画 1 本なのは変わらず)
- ResizeHandle / CardCornerActions / MediaTypeIndicator との z-index 衝突なし

## 9. ロールアウト

- 1 セッション ~6-8h で実装可能
- データ層 + parse 改修 → UI 改修 → backfill 確認の 3 段階で commit
- mediaSlots field は optional なので v13 → v12 rollback も schema 互換 (使わないだけ)
- UI 問題が出た時のエスケープハッチ: ImageCard / TweetMedia で `mediaSlots.length > 1` の処理を環境変数 or 一時 hard-code で旧パスに戻れる
- 完了時に本番 deploy → ユーザー実機検証 → OK で merge

## 10. オープン問題 (実装時に決める / 将来課題)

- ボード ドット 動画アクセント色の正確な値 (`--media-slot-video-tint`、 仮 `rgba(255, 107, 107, 0.4)`、 実機で調整)
- Lightbox ▶ ドットの正確な形状 (CSS triangle vs SVG vs ▶ unicode、 実機で見て決める)
- TweetVideoPlayer の `key` 戦略 — slot 切替時に内部 state (currentTime, paused) を維持するため、 mount/unmount を避ける必要あり。 実装時に試す: (a) 動画スロットを keep-mounted で hide、 (b) Player に restorable な ref を渡して切替時に currentTime を save/restore
- 動画 + 画像 mix tweet が API 上どれくらいの頻度で出るか (実例は 1 つだけ確認済、 他のケースで mediaSlots がどう構造化されるかは実装中に追検証)
- (将来) Bluesky でも同じ mediaSlots 統一型を共有
- (将来) B1 マイルストーンでボード上動画インライン再生を入れる時、 MediaSlot.type === 'video' をフックして再生制御

## 11. 関連 memory / 設計判断 (継承)

- [feedback_minimal_card_affordances](../../../memory) — ボードのドットは控えめ、 サムネ上に always-on overlay を出さない
- [project_booklage_vision_multiplayback](../../../memory) — ボード上で複数動画同時再生が core differentiator、 mediaSlots[] 統一型はこれの土台
- [reference_twitter_syndication_cors](../../../memory) — Cloudflare Pages Function proxy 経由 (本 spec では proxy 変更なし、 既存利用のみ)
- [feedback_large_pointer](../../../memory) — Lightbox 側 ドットのヒット枠 24×24px
- [feedback_one_thing_at_a_time](../../../memory) — Mix tweet 対応は I-07 Phase 1 の続編、 Bluesky (旧 Phase 2) は別 spec で進める
- [feedback_no_internal_ids_alone](../../../memory) — タスク参照は内部 ID 単独でなく中身が分かる日本語で
