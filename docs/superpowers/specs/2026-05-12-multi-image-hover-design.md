# I-07 複数画像 / 動画 ホバー切替 — 設計

- **日付**: 2026-05-12 (セッション 13 brainstorm)
- **対応元アイデア**: [IDEAS.md L1355-1361 (I-07)](../../private/IDEAS.md)
- **TODO 連動**: [docs/TODO.md](../../TODO.md) §「新機能アイデア」 I-07

## 0. ゴール

X / Bluesky の **複数画像投稿** に対して、 ムードボード上のカードでマウスホバーの X 位置から画像枚を切り替えて閲覧でき、 Lightbox 内でもカルーセル風に複数枚見られるようにする。

「整理ツール」 ではなく「表現ツール」 のミッションに直結。 ユーザーが頻繁に出会う「あれ、 この X 投稿、 4 枚あるはずなのに 1 枚しか見えない」 を解消。

## 1. スコープ

### MVP 対象
- **X (Twitter)** — 既存の syndication proxy を改修。 最大 4 枚画像対応。
- **Bluesky** — 新規 proxy `public.api.bsky.app` 経由。 最大 4 枚画像対応。

### バックログ (将来対応、 優先度低)
- Reddit (gallery 構造の特殊性により別検討)
- Mastodon (federation: instance ごとに proxy 必要)
- Instagram / Threads (公式 API なし、 bookmarklet 強化スレッド)
- Tumblr / Misskey 等の長尾プラットフォーム
- PiP 内での複数画像表示 (board / Lightbox のみで MVP)
- モバイル swipe gesture

### 非ゴール
- 動画 + 画像 mixed media 投稿 (X / Bluesky 双方とも 1 投稿に画像 4 枚 OR 動画 1 本のいずれかなので存在しない)
- カード上での動画の連続再生切替 (動画は既存通り Lightbox で 1 本)

## 2. 主要決定事項

| # | 論点 | 採用案 |
|---|---|---|
| 1 | データ保存戦略 | **IDB に `photos: readonly string[]` を persist** (一度保存したら hover 即時動作。 オフラインも OK) |
| 2 | Lightbox 内 nav | **ドット indicator クリック + キーボード ↑↓** (メディア領域クリックは動画 play と衝突するため不採用) |
| 3 | カード側「複数画像あるよ」 表示 | **hover で出るドット行** (既存 MediaTypeIndicator と同じ minimal sibling パターン) |
| 4 | 画像 preload タイミング | **初回ホバー時 lazy preload** (eager 全カード preload は PiP / Lightbox の帯域に干渉するため不採用) |
| 5 | backfill タイミング | **Lightbox open 時の自然なフロー** (board 起動時に一括取得しない) |
| 6 | 失敗時の挙動 | **既存単一画像表示にフォールバック** (新機能で既存機能を壊さない) |

## 3. データモデル

### 3-1. IDB スキーマ変更

`BookmarkRecord` (`lib/storage/indexeddb.ts`) に optional field 追加:

```ts
/** v12: 複数画像投稿で取得した全画像 URL の配列。 photos[0] は thumbnail と
 *  一致。 1 枚しかない投稿 / 未対応 SNS では undefined。 X tweet なら
 *  syndication API、 Bluesky なら public API から取得 (取得失敗時は
 *  undefined のまま、 既存単一画像表示に fallback)。 */
photos?: readonly string[]
```

- `DB_VERSION` を **11 → 12** に bump (field 追加のみ、 no-op migration)
- 既存ロー (v11 で書かれたもの) は photos undefined のまま、 hover 切替が起きないだけ
- 全 optional のため downgrade (v12 → v11) も schema 互換

### 3-2. `BoardItem` (in-memory pass-through)

`lib/storage/use-board-data.ts` の `BoardItem` 型にも photos を露出:

```ts
readonly photos?: readonly string[]
```

### 3-3. `TweetMeta` (Lightbox 用 in-memory)

`lib/embed/types.ts`:

```ts
readonly photoUrls?: readonly string[]  // 既存 photoUrl は photoUrls[0] と一致
```

既存 `photoUrl` field は段階的廃止候補だが、 後方互換のため当面維持。

## 4. データ取得経路

### 4-1. X (Twitter)

既存 `lib/embed/tweet-meta.ts` の `parseTweetData()` を改修。 syndication API は既に `r.photos: Array<{url, width, height}>` を返しているため、 `[0]` だけ取っている現状の挙動を全配列展開に変えるだけ。

```ts
const photoUrls = r.photos?.map(p => p.url) ?? []
// ...
return {
  ...existing,
  photoUrl: photoUrls[0],  // 後方互換
  photoUrls,
}
```

### 4-2. Bluesky

**新規** `functions/api/bluesky-meta.ts` (Cloudflare Pages Function):

1. クエリパラメータ `?handle=xxx&rkey=yyy` を受け取る (URL から事前抽出済の値)
2. Resolve handle → DID: `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=xxx`
3. Get post thread: `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=at://<did>/app.bsky.feed.post/<rkey>`
4. response の `thread.post.embed.images[].fullsize` を抽出
5. CORS ヘッダ + 24h cache header 付きで JSON 返却

**新規** `lib/embed/bluesky-meta.ts` (client 側):
- `fetchBlueskyMeta(handle, rkey): Promise<BlueskyMeta | null>` で proxy 呼ぶ
- response から photos / text / author / aspectRatio を抽出して返す

**URL 検出** [lib/utils/url.ts](../../lib/utils/url.ts):
```ts
export type UrlType = 'tweet' | 'youtube' | 'tiktok' | 'instagram' | 'bluesky' | 'website'

export function detectUrlType(url: string): UrlType {
  // ...existing...
  if (url.includes('bsky.app')) return 'bluesky'
  // ...
}

export function extractBlueskyPostId(url: string): { handle: string; rkey: string } | null {
  const match = url.match(/bsky\.app\/profile\/([^\/]+)\/post\/([^\/]+)/)
  if (!match) return null
  return { handle: match[1], rkey: match[2] }
}
```

### 4-3. Save flow への組込み

- 新規ブクマ追加時、 X / Bluesky 投稿なら photos を fetch して IDB に書く
- 既存ブクマで photos undefined のもの → Lightbox open 時の tweet/bluesky meta fetch の副産物として IDB backfill (fire-and-forget)
- 失敗時は photos undefined のまま放置 (= 既存挙動継続)

## 5. UX 詳細

### 5-1. カード hover 切替

- カード全体が hover zone
- `pointerX` をカード幅で等分した index にマッピング:
  ```ts
  const N = photos.length
  const ratio = Math.max(0, Math.min(1, (pointerX - cardLeft) / cardWidth))
  const imageIndex = Math.min(N - 1, Math.floor(ratio * N))
  ```
- 該当 index の `<img src>` に切替 (React state は ImageCard 内 local のみ、 上位伝播しない)
- カードから cursor 退出 → `photos[0]` (= thumbnail) に復帰
- 1 枚だけのカード → 何も起きない (現状維持)

#### dot indicator (カード側)
- カード下端から 8-12px 内側に **横並び ●●●● 行** (枚数分)
- 現在 index は白 / 不透明、 非アクティブは 30% opacity
- `pointer-events: none` (カードの hover 領域を奪わない)
- カード hover 開始 → 200ms フェードイン、 退出 → 200ms フェードアウト
- z-index は ResizeHandle 等の chrome より下、 thumbnail の上

### 5-2. Lightbox carousel

- メディア領域には photos[currentImageIndex] を表示
- メディア領域クリックは **画像 nav に使わない** (動画 play との一貫性)
- nav 手段:
  1. **ドット indicator (クリック可能)** — Lightbox メディア下に表示、 該当ドットクリックで jump
  2. **キーボード ↑ ↓** — 前 / 次 image (端で止まる、 折返しなし)
- chevron-rail (左右の ‹ › ボタン) は既存通り **カード間 nav** で不変
- `←` `→` キーも既存通り **カード間 nav**
- Lightbox open 時に photos.length > 1 なら currentImageIndex = 0、 chevron-nav でカード変わったら 0 リセット
- 画像 1 枚 / 動画 / テキストのみ → dots 出ない、 ↑↓ 無効 (= 既存挙動と完全同じ)

#### dot indicator (Lightbox 側)
- メディア下端のすぐ外側に配置 (メディア表面を侵食しない)
- 見た目はカード側と同じ ●●●● (サイズだけ少し大きめ、 16px diameter)
- ヒット枠 24×24 (memory: 大きいマウスポインタ前提)
- アクティブドットは白、 非アクティブは 30% 不透明
- hover で非アクティブも軽くハイライト (clickable hint)

## 6. パフォーマンス・非ブロッキング保証

### 6-1. 画像 preload
- **採用**: 初回ホバー時 lazy preload。 ImageCard で hover 開始 → `new Image()` で photos[1..N-1] を裏で fetch
- **不採用**: board 起動時の eager preload (50 cards × 4 images = 200 リクエスト同時で PiP / Lightbox 帯域競合)
- ブラウザ HTTP cache が以降 instant に hit

### 6-2. backfill
- board 起動時に photos undefined を一括補填することは **しない**
- 既存「Lightbox open 時に tweet / bluesky meta fetch」 のフローで自然に貯まる
- PiP は独立 document context、 multi-image hover preload は **board document の中だけ**で実行

### 6-3. State 管理
- カード hover の image index は ImageCard 内 useState のみ
- BoardRoot / CardsLayer には伝播せず、 masonry 再計算は起きない
- Lightbox の image index も Lightbox 内 useState

### 6-4. 失敗時 graceful fallback

| 失敗ケース | 挙動 |
|---|---|
| Bluesky API ダウン | photos undefined のまま → 既存単一画像表示 |
| 画像 URL が dead | `<img onError>` で次の画像にスキップ、 全滅したらカード thumbnail に戻る |
| IDB schema 不整合 | photos field を読めない場合は undefined 扱い (Zod ガード) |
| PiP / Lightbox を開いている最中の backfill 完了 | 既に開いてる UI を変更しない (silent IDB update のみ) |
| Syndication / Bluesky API のレート制限 | proxy 側で Cloudflare cache 利用、 client は IDB cache 優先 |

## 7. ファイル変更一覧

### データ層 (Phase 1 / 2 共通)
- [lib/constants.ts](../../lib/constants.ts) — `DB_VERSION` 11 → 12
- [lib/storage/indexeddb.ts](../../lib/storage/indexeddb.ts) — `BookmarkRecord.photos` 追加、 v12 migration (no-op)
- [lib/storage/use-board-data.ts](../../lib/storage/use-board-data.ts) — `BoardItem.photos` pass-through、 `persistPhotos()` 関数追加
- [lib/embed/types.ts](../../lib/embed/types.ts) — `TweetMeta.photoUrls` 追加

### Phase 1 (X tweet 対応、 1 セッション ~8h)
- [lib/embed/tweet-meta.ts](../../lib/embed/tweet-meta.ts) — `parseTweetData()` で全 photos 配列展開
- [components/board/cards/ImageCard.tsx](../../components/board/cards/ImageCard.tsx) — hover 位置マッピング + image swap + lazy preload + dots
- [components/board/cards/ImageCard.module.css](../../components/board/cards/ImageCard.module.css) — dots スタイル
- [components/board/Lightbox.tsx](../../components/board/Lightbox.tsx) — `TweetMedia` 拡張、 carousel state、 dots、 キーボード ↑ ↓
- [components/board/Lightbox.module.css](../../components/board/Lightbox.module.css) — Lightbox dots スタイル
- [lib/utils/bookmarklet.ts](../../lib/utils/bookmarklet.ts) (and `extension/content.js`) — 保存時に photos も含める
- [tests/lib/tweet-meta.test.ts](../../tests/lib/tweet-meta.test.ts) — multi-image parse 確認
- **NEW** `tests/e2e/board-i-07-multi-image.spec.ts` — E2E (seed → hover swap → Lightbox carousel)

### Phase 2 (Bluesky 対応、 0.5-1 セッション ~4h)
- **NEW** `lib/embed/bluesky-meta.ts` — client
- **NEW** `functions/api/bluesky-meta.ts` — Cloudflare Pages Function proxy
- [lib/utils/url.ts](../../lib/utils/url.ts) — `'bluesky'` 追加、 `extractBlueskyPostId()`
- [tests/lib/url.test.ts](../../tests/lib/url.test.ts) — Bluesky URL detect
- **NEW** `tests/lib/bluesky-meta.test.ts` — parse 確認
- [tests/e2e/board-i-07-multi-image.spec.ts](../../tests/e2e/board-i-07-multi-image.spec.ts) — Bluesky パスも追加

## 8. テスト計画

### unit (vitest)
- `parseTweetData()` の photos 配列取得 (1 枚 / 4 枚 / 0 枚)
- Bluesky meta parse (typical response / no images / API failure)
- URL detection: `bsky.app/profile/X/post/Y` → `'bluesky'`
- `extractBlueskyPostId()` の正規 URL / 異常 URL

### integration (Playwright E2E)
- 4 枚画像の X tweet を seed → board → カードホバー (X 位置 25%/50%/75%/100%) で画像が切り替わる
- 同カードを Lightbox open → dots クリックで画像切替 → ↑↓ で nav
- 1 枚しかないカードでは dots 出ない、 hover で何も起きない
- Bluesky 4 枚 post 同様

### 視覚回帰
- セッション 12 までの既存挙動 (Lightbox open/close、 chevron-nav between cards) が壊れないこと
- ResizeHandle / CardCornerActions / MediaTypeIndicator との z-index 衝突なし

## 9. ロールアウト

- Phase 1 / Phase 2 は **それぞれ独立に shipping 可能**
- 各 Phase 内も「データ層 + parse」 と「UI」 を別 commit
- `photos` field は全 optional なので、 IDB v12 で書いた後に v11 へ rollback しても (使わないだけで) 既存機能は壊れない
- Phase 1 で UI 問題が出た時のエスケープハッチ: ImageCard 側で `photos.length > 1` の処理を環境変数 or 一時 hard-code false で既存挙動に戻れる
- 各 phase 完了時に本番 deploy → ユーザー実機検証 → OK ならコミット

## 10. オープン問題 (実装時に決める / 将来課題)

- カード側 dots のフェードイン / アウトの正確な duration (200ms 仮、 実機調整)
- Lightbox 側 dots の正確な位置 (メディア外 vs メディア内オーバーレイ、 実機で見て決める)
- 画像 lazy preload で並列度を絞るか (Promise.all vs 順次)、 実機計測してから判断
- Bluesky DID 解決のキャッシュ TTL (Cloudflare proxy 側で 24h 仮、 user 名が変わると stale だが頻度は低い)
- 既存 X tweet のバックフィル方針 (Lightbox open 時のみ vs background refresh、 後者を入れるなら別 spec)
- (将来) モバイル swipe gesture
- (将来) PiP 内 multi-image 対応

## 11. 関連 memory / 設計判断 (継承)

- [feedback_minimal_card_affordances.md](../../../memory) — hover-revealed sibling indicators 採用
- [reference_twitter_syndication_cors.md](../../../memory) — Cloudflare Pages Function 経由 proxy 必須
- [feedback_large_pointer.md](../../../memory) — dot のヒット枠 24×24px
- [feedback_free_size_decided.md](../../../memory) — 既存 ImageCard / SizePicker 仕様は壊さない
- [project_bookmarklet_persistence.md](../../../memory) — bookmarklet 経路も保守継続
- [feedback_one_thing_at_a_time.md](../../../memory) — Phase 1 → Phase 2 の段階リリース方針
