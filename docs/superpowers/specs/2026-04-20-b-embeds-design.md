# B-embeds: Content-Fit Embeds + 白カード解消 — Design Spec

**Date**: 2026-04-20
**Status**: Draft (pending user review)
**Author**: Claude Opus 4.7 + user brainstorming
**Branch**: `master`（worktree 廃止、メインフォルダ直接作業）
**Prerequisite read**:
- `docs/superpowers/specs/2026-04-19-b0-board-skeleton-design.md` — B0 骨組み
- `docs/superpowers/specs/2026-04-20-board-content-sized-reorder-design.md` — content-sized masonry の前提
- `docs/private/IDEAS.md`（非公開） — 参考サイト・差別化方針
- `docs/REBUILD_VISION.md` — リビルド全体方針
- `CLAUDE.md` — コーディング規約・プライバシー絶対ルール

---

## Part A — ユーザー向け要約

### このスプリントで作るもの（B = 埋め込み表示の完成）

ボード上のカードが **「中身に応じた最適なサイズで美しく描画される」** 状態を作る。具体的には：

| URL 種別 | 表示内容 | アスペクト比 | クリック挙動 |
|---|---|---|---|
| **Twitter/X tweet** | `react-tweet` で全文 + 画像 + 引用ツイート | **動的測定**（pretext で予測） | 新タブで開く |
| **YouTube 通常** | 公式サムネ（maxres）+ ▶ 中央 overlay | 16:9 固定 | 新タブで開く |
| **YouTube Shorts** | 公式サムネ + ▶ overlay | 9:16 固定 | 新タブで開く |
| **TikTok** | oEmbed サムネ + ▶ overlay | 9:16 固定 | 新タブで開く |
| **画像 URL** | 現状維持（intrinsic 比） | intrinsic 比 | 新タブで開く |
| **その他（OGP image あり）** | 現状維持の OGP 画像カード | OGP 画像比 | 新タブで開く |
| **その他（OGP image なし）** | **TextCard**（favicon + ドメイン + タイトルをタイポグラフィ装飾） | 4:3 固定 | 新タブで開く |

### 完成したら何が見える？

1. `/board` を開くと、ツイートカードに **そのツイートの全文 + 画像** が美しく描画されている
2. 短いツイートは小さなカード、長文ツイートは縦長カード → moodboard 的視覚リズム
3. YouTube カードはサムネが上下切れず 16:9、▶ overlay で「動画とわかる」
4. TikTok カードは 9:16 縦長、▶ overlay
5. **白カードが消滅** — `r3f.maximeheckel.com/lens2` のような OGP なしサイトも、favicon + タイポグラフィで beautiful な text card として描画
6. 短いタイトル（"Dispersion" 等）は **巨大 display serif** で headline 表示、長めは sans の editorial レイアウト
7. 初回ロードで一瞬 flicker するかもしれないが、IDB キャッシュ後は完全になめらか

### 含まないもの（次フェーズ以降）

- ❌ **C: Multi-playback** — クリックで in-place 再生・複数同時ミックス
- ❌ **A: Lightbox 拡大** — ホバー expand → 中央拡大 spring（recipe は `docs/private/card-interaction-recipes.md`）
- ❌ Instagram embed（規約厳しい、後回し）
- ❌ ツイートカード内のリンク・画像クリック・action button（C 以降）
- ❌ スクショサービス導入（B+ 以降、`microlink` / Cloudflare Browser Rendering 等）

### 成功の定義

- **触ってわかる基準**:
  - どのツイートでも全文が見える（縦切れ・スクロールバー・"...続きを読む" なし）
  - YouTube サムネが上下切れず 16:9 完璧
  - 白カードが消える → text card として美しく成立
  - moodboard の視覚リズムが体感できる
- **内部品質基準**: 全ファイル ≤ 300 行、tsc strict pass、`any` ゼロ、Vitest 21+ 本 + Playwright 6 本 pass、60fps 維持

---

## Part B — 実装仕様（Claude 向け）

### B1. 全体アーキテクチャ — 既存 B0 への拡張

B0 / 直近 masonry スプリントで確立した 6 層構成は **完全踏襲**。CardNode が既に `children` を受け付ける構造（[CardNode.tsx:10](components/board/CardNode.tsx)）なので、URL 種別ごとのカードコンポーネントを **children として渡す** だけで完結する。

```
BoardRoot
└─ CardsLayer
   └─ CardNode (既存、汎用 wrapper)
      └─ <pickCard(item)> (新規、URL 種別 router)
         ├─ TweetCard         (新規)
         ├─ VideoThumbCard    (新規) — YouTube + TikTok
         ├─ ImageCard         (新規 wrapper、現状の OGP 画像挙動を抜き出し)
         └─ TextCard          (新規) — favicon + タイポグラフィ
```

### B2. ファイル構成

#### 新規ファイル

| ファイル | 行数目安 | 責務 |
|---|---|---|
| `components/board/cards/TweetCard.tsx` | ~120 | `react-tweet` ラッパー、measurement トリガ、エラーフォールバック |
| `components/board/cards/TweetCard.module.css` | ~60 | Booklage tone の override（react-tweet default を一切使わない） |
| `components/board/cards/VideoThumbCard.tsx` | ~80 | YouTube + TikTok 共通、サムネ + ▶ overlay |
| `components/board/cards/VideoThumbCard.module.css` | ~50 | ▶ オーバーレイの styling、hover lift |
| `components/board/cards/ImageCard.tsx` | ~50 | 既存 OGP 画像カードの抽出、intrinsic 比対応 |
| `components/board/cards/TextCard.tsx` | ~140 | favicon + タイポグラフィ、3 モード自動切替 |
| `components/board/cards/TextCard.module.css` | ~80 | headline / editorial / index 各モードの styling |
| `components/board/cards/index.ts` | ~30 | URL 種別 → カードコンポーネント router (`pickCard` pure fn) |
| `lib/embed/tweet-meta.ts` | ~80 | Twitter syndication API でメタ取得（`react-tweet` の `getTweet` を client 側で利用） |
| `lib/embed/tweet-meta.test.ts` | ~80 | 削除済 / private / rate limit / 正常 |
| `lib/embed/predict-tweet-height.ts` | ~120 | pretext + chrome 高さ + media → 予測高さ |
| `lib/embed/predict-tweet-height.test.ts` | ~150 | 8 ケース（短文 / 140char / 280+ / 画像 / 動画 / 引用 / poll / 削除） |
| `lib/embed/youtube-thumb.ts` | ~50 | maxres → hqdefault → mqdefault → 0.jpg fallback chain |
| `lib/embed/youtube-thumb.test.ts` | ~60 | 4 ケース（maxres URL / fallback / shorts / 無効 ID） |
| `lib/embed/tiktok-meta.ts` | ~50 | TikTok oEmbed API |
| `lib/embed/tiktok-meta.test.ts` | ~50 | 正常 / fail / cache |
| `lib/embed/favicon.ts` | ~30 | Google s2 URL 生成、cache 対応 |
| `lib/embed/title-typography.ts` | ~100 | pretext 測定 → `{ mode, fontSize, lineCount }` 純関数 |
| `lib/embed/title-typography.test.ts` | ~120 | 6 ケース（headline / editorial / index 境界 / 絵文字 / 多言語 / 空文字） |
| `lib/embed/measurements-cache.ts` | ~60 | IDB `cards.aspectRatio` への書き込みヘルパ |
| `lib/embed/types.ts` | ~40 | 共通型（`TweetMeta`, `VideoMeta`, `MeasuredCard`, `TitleMode` 等） |

合計新規: 11 prod + 5 test ファイル、~1,150 行（テスト込み）

#### 既存ファイルの修正

| ファイル | 変更内容 |
|---|---|
| `components/board/CardsLayer.tsx` | 描画時に `pickCard(item)` を呼び、children として CardNode に渡す |
| `components/board/CardNode.tsx` | 既に children 対応済 → 変更不要（thumbnailUrl 引数も互換 fallback として残置） |
| `lib/board/aspect-ratio.ts` | tweet branch のヒューリスティックは **placeholder** として残す。コメントで「測定前 / 測定失敗時 fallback」と注記 |
| `lib/storage/use-board-data.ts` | `computeAspectRatio` は既に `c?.aspectRatio` cache を読む実装 → 変更最小。`persistMeasuredAspect(cardId, ratio)` を新規 expose |
| `lib/storage/indexeddb.ts` | スキーマ変更**不要**（`cards.aspectRatio` 既存）。`updateCard` API で `aspectRatio` 単独 update 可能なことを確認 |
| `messages/ja.json` | `board.tweet.deleted`, `board.tweet.error`, `board.video.thumbnail.alt` 等の i18n キー追加 |
| `package.json` | `react-tweet`, `@chenglou/pretext`, `fast-average-color` を dependencies に追加 |

### B3. データフロー（Tweet measurement）

```
カード mount (CardsLayer 内)
  ↓
1. pickCard(item) → TweetCard 確定
  ↓
2. cards.aspectRatio (IDB cache) があるか？
  ├─ ある → そのまま使う、masonry 配置確定 ✅ FIN
  └─ ない ↓
3. estimateAspectRatio (heuristic) で初期 placeholder
  ↓
4. masonry 仮配置（5-7 で書き換わる）
  ↓
5. requestIdleCallback 内で:
   - getTweet(id) (Twitter syndication API) でメタ取得
   - pretext で text 高さ測定
   - media metadata（has_image, video aspect, poll）で高さ加算
  ↓
6. 予測 aspectRatio 確定 → persistMeasuredAspect(cardId, ratio)
  ↓
7. items state update → masonry 自動再計算 (既存 useEffect)
  ↓
8. react-tweet 本体描画（既に正しいサイズの container 内）
```

**flicker は最大 1 フレーム**（5-7 のステップ合計 < 50ms / cached なら step 1 のみ）。

### B4. URL 種別 → カードコンポーネント router

```typescript
// components/board/cards/index.ts
import type { ComponentType } from 'react'
import type { BoardItem } from '@/lib/storage/use-board-data'
import { detectUrlType } from '@/lib/utils/url'
import { TweetCard } from './TweetCard'
import { VideoThumbCard } from './VideoThumbCard'
import { ImageCard } from './ImageCard'
import { TextCard } from './TextCard'

export type CardComponent = ComponentType<{ readonly item: BoardItem }>

export function pickCard(item: BoardItem): CardComponent {
  const type = detectUrlType(item.url)
  switch (type) {
    case 'tweet':
      return TweetCard
    case 'youtube':
    case 'tiktok':
      return VideoThumbCard
    case 'image':
      return ImageCard
    default:
      return item.thumbnail ? ImageCard : TextCard  // 白カード解消
  }
}
```

### B5. TweetCard 内部設計

```typescript
// components/board/cards/TweetCard.tsx (概略)
'use client'

import { Tweet } from 'react-tweet'
import { useEffect, useRef } from 'react'
import { useTweetMeasurement } from '@/lib/embed/tweet-meta'
import styles from './TweetCard.module.css'

export function TweetCard({ item }: { readonly item: BoardItem }): ReactNode {
  const tweetId = extractTweetId(item.url)
  const containerRef = useRef<HTMLDivElement>(null)

  // 測定が完了してなければ idle で測定 → IDB persist
  useTweetMeasurement({
    tweetId,
    cardId: item.cardId,
    cachedAspect: item.aspectRatio,  // cache hit なら no-op
    containerWidth: /* derive from masonry context */,
  })

  if (!tweetId) {
    return <TextCardFallback item={item} reason="invalid-tweet-url" />
  }

  return (
    <div ref={containerRef} className={styles.tweetContainer}>
      <Tweet id={tweetId} fallback={<TweetSkeleton />} />
    </div>
  )
}
```

**重要な設計ポイント**:
- `react-tweet` の default styling は使わない → CSS Module で完全 override（Booklage tone）
- 測定 hook は **idle callback** で動かす（main thread を塞がない）
- 削除済 / private tweet は `<Tweet>` 内部で 404 → onError で TweetCardFallback へ
- viewport culling 内で測定優先順位制御（`useTweetMeasurement` 内で IntersectionObserver 使用）

### B6. VideoThumbCard 内部設計

```typescript
// components/board/cards/VideoThumbCard.tsx (概略)
export function VideoThumbCard({ item }: { readonly item: BoardItem }): ReactNode {
  const urlType = detectUrlType(item.url)
  const thumbUrl = urlType === 'youtube'
    ? getYoutubeThumb(item.url)        // maxres → hq → mq fallback chain
    : getTikTokThumb(item)              // oEmbed cached

  return (
    <div className={styles.videoCard}>
      <img
        src={thumbUrl}
        onError={(e) => fallbackThumb(e)}
        className={styles.thumb}
        alt=""
        draggable={false}
      />
      <div className={styles.playOverlay}>
        <PlayIcon />
      </div>
      <div className={styles.titleBar}>{item.title}</div>
    </div>
  )
}
```

**YouTube サムネ fallback chain** (`lib/embed/youtube-thumb.ts`):
```typescript
export function getYoutubeThumb(url: string, level: 0 = 0): string {
  const id = extractYoutubeId(url)
  if (!id) return PLACEHOLDER_THUMB
  const variants = ['maxresdefault', 'hqdefault', 'mqdefault', '0']
  return `https://i.ytimg.com/vi/${id}/${variants[level]}.jpg`
}
// onError で level++ で再取得、全部 fail で TextCard fallback
```

### B7. TextCard — 白カード解消 + タイポグラフィ自動バリアント

#### 3 モード自動切替

| モード | 条件 | 見た目 |
|---|---|---|
| **Headline** | タイトル ≤ 24 char、1 行に収まる | Display serif（Fraunces / Playfair）、カード高さの 60-70% を占める巨大 headline。favicon + ドメインは下部 chip |
| **Editorial** | 25–80 char、2-3 行に収まる | Sans（Inter / General Sans）22px、行間 1.4、上部 favicon + ドメイン pill |
| **Index** | 81+ char、4-5 行 | Mono or small sans、古書インデックス風、タイトル全文を visible に |

#### 純関数で mode 判定

```typescript
// lib/embed/title-typography.ts
export type TitleMode = 'headline' | 'editorial' | 'index'

export type TitleTypographyResult = {
  readonly mode: TitleMode
  readonly fontSize: number
  readonly lineHeight: number
  readonly maxLines: number
}

export function pickTitleTypography(input: {
  readonly title: string
  readonly cardWidth: number
  readonly cardHeight: number
}): TitleTypographyResult {
  const charCount = [...input.title].length  // grapheme-aware
  // pretext で「headline 候補のフォントサイズで 1 行に収まるか」判定
  // editorial / index への分岐は char count + 測定結果で決定
  // ...
}
```

#### Brand color（背景 gradient）

```typescript
// lib/embed/favicon.ts
export function getFaviconUrl(host: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
}

// fast-average-color で平均色抽出 → IDB cache
// カード背景に opacity 8-12% で乗算 gradient
```

### B8. エラー・フォールバック連鎖（統合表）

| ケース | 挙動 | 実装場所 |
|---|---|---|
| Tweet 削除 / private (404) | TextCard fallback、メッセージ "このツイートは削除または非公開です" | `TweetCard.tsx` onError |
| Tweet API rate limit | ヒューリスティック aspect で描画、backoff 5 分後再試行 | `tweet-meta.ts` |
| Tweet メタ network fail | 同上 | 同上 |
| YouTube maxres 404 | hqdefault → mqdefault → 0.jpg → TextCard fallback | `youtube-thumb.ts` |
| YouTube 動画削除済 | サムネ全 404 → TextCard fallback | 同上 |
| TikTok oEmbed fail | 9:16 brand gradient プレースホルダー + ▶ overlay | `tiktok-meta.ts` |
| Favicon 404 | Google s2 デフォルト地球 icon が返る（99.9% safe） | `favicon.ts` |
| タイトル / URL 欠損 | ブクマ除外（既存挙動） | `use-board-data.ts` |

**原則**: カードが **「壊れて見える」状態を絶対に作らない**。常に何かが美しく描画される。

### B9. パフォーマンス予算

| 指標 | 目標 |
|---|---|
| 初回ロード（100 tweet 混在 board） | TTI < 2s、visible tweets の測定完了 < 1s |
| 測定済 board の再ロード | 測定 API 呼び出しゼロ（全 IDB cache） |
| 同時 tweet API リクエスト | ≤ 6（HTTP/1.1 limit）、残りは viewport 入場順 queue |
| pretext 測定 per card | < 2ms |
| masonry 再計算 per measurement update | < 5ms（1000 cards で < 16ms = 60fps 維持） |
| 既存 ドラッグ UX | 60fps 完全維持（measurement は idle callback で実行） |

**戦略**: **viewport culling 優先測定**。1-screen buffer 内 tweet から測定、外側は viewport 入場時に開始。

### B10. デザイン仕様 — Shopify.design tier 維持

既存 Sidebar / Toolbar のクオリティラインに合わせる：

- **TweetCard**: hairline border (`1px rgba(0,0,0,0.08)`)、subtle shadow (`0 1px 3px rgba(0,0,0,0.04)`)、hover で `transform: translateY(-1px)` lift。`react-tweet` default style は一切使用しない
- **VideoThumbCard ▶ overlay**: 直径 56px、`background: rgba(0,0,0,0.15)`、`backdrop-filter: blur(4px)`、白三角 SVG。hover で `scale(1.08)` + 透過度 0.25 へ
- **TextCard headline**: Display serif（Fraunces 700 italic or Playfair 700）、`letter-spacing: -0.02em`、文字色 `#0a0a0a`
- **TextCard editorial**: Inter 22px / 600、行間 1.4、`color: #1a1a1a`
- **TextCard index**: JetBrains Mono 14px、`color: #2a2a2a`、古書脚注風
- **全カード共通**: `border-radius: var(--corner-radius-inner)` (= 6px、既存)、subtle `backdrop-filter: blur(2px)` の glass

### B11. テスト計画

#### Vitest（純関数）

| ファイル | テスト本数 | 内容 |
|---|---|---|
| `predict-tweet-height.test.ts` | 8 | 短文 / 140 char / 280+ char / 画像付き / 動画付き / 引用 / poll / 削除済 |
| `title-typography.test.ts` | 6 | headline 判定 / editorial 判定 / index 判定 / 境界値 / 絵文字混在 / 多言語（CJK） |
| `youtube-thumb.test.ts` | 4 | maxres URL / fallback chain / shorts 判定 / 無効 ID |
| `tweet-meta.test.ts` | 4 | 正常 / 削除済 / rate limit / cache hit |
| `tiktok-meta.test.ts` | 3 | 正常 / fail / cache hit |
| `aspect-ratio.test.ts`（既存拡張） | +3 | 測定キャッシュ優先 / 測定失敗時 heuristic / user resize 保護 |

合計 **28 本** vitest（既存 86 + 28 = 114 本）。

#### Playwright（E2E）

| シナリオ | 検証内容 |
|---|---|
| 実 tweet（短文 / 140char / 画像 / 動画）4 種 | 全カード全文 visible、scrollbar なし |
| 実 YouTube（通常 + shorts）2 種 | 16:9 / 9:16 比、サムネ上下切れず、▶ overlay |
| 実 TikTok 1 種 | 9:16 サムネ + ▶ overlay |
| 白カード元: r3f.maximeheckel.com/lens2 + 短タイトル URL × 2 | TextCard headline / editorial で美しく描画 |
| 削除済 tweet URL | TextCard fallback で「削除済」 |
| 既存 1000 カード perf spec | 60fps 維持（既存 perf spec の 1 本を改変なし） |

合計 **6 本** Playwright（既存 + 6）。

### B12. デプロイ要件

- ⚠️ **`public/sw.js` の `CACHE_VERSION` を bump 必須** — 新 component が増えるので旧 cache を完全フラッシュ
- `npx wrangler pages deploy out/ --project-name=booklage --branch=master --commit-dirty=true`
- デプロイ後、本番 `booklage.pages.dev` で実 tweet / YouTube / TikTok / r3f.maximeheckel.com の各カードを目視確認

### B13. 完成定義（Acceptance Criteria 統合版）

#### 機能

- [ ] Tweet card で全文 visible（短文 / 140char / 280+char / 画像付き / 動画付き / 引用 / poll / 削除済 = 8 ケース）
- [ ] YouTube 通常 = 16:9、Shorts = 9:16、サムネ上下切れず、▶ overlay
- [ ] TikTok = 9:16、サムネ + ▶ overlay
- [ ] 白カード消失 → TextCard が headline / editorial / index いずれかで美しく描画
- [ ] 全カード click で新タブ open（現状維持）
- [ ] 測定結果 IDB cache、2 回目以降は flicker ゼロ
- [ ] 全フォールバック連鎖が動作

#### 品質

- [ ] TypeScript strict、`any` ゼロ、新規全ファイル ≤ 300 行
- [ ] Vitest 28 本 pass（合計 114 本）
- [ ] Playwright 6 本 pass
- [ ] 1000 カード 60fps 維持（既存 perf spec 改変なし）
- [ ] tsc clean、ビルド通過、`pnpm build` の静的書き出し成功

#### デザイン

- [ ] Tweet card が Booklage tone（AI 感 / react-tweet default 感ゼロ）
- [ ] TextCard headline モードが Are.na / Figma Brand tier の美しさ
- [ ] Moodboard 的視覚リズム（短文小、長文縦長、動画横長 / 縦長）が体感できる

### B14. 未解決項目（実装中にユーザー確認が必要）

実装段階で判断が分かれた場合のフォールバック候補：

1. **react-tweet の theme**: `react-tweet` は light/dark theme prop を持つ → Booklage の theme 切替（B0 の dotted-notebook / grid-paper）と連動するか？ **推奨**: B では light 固定、theme 連動は polish スプリントで
2. **Twitter syndication API の domain**: `getTweet` は内部で `cdn.syndication.twimg.com` を叩く → Cloudflare Pages からの fetch で CORS issue 出るか実装時確認 **推奨**: 出たら client side proxy（自前 Cloudflare Worker）を別 spec で
3. **TikTok oEmbed が遅い**: TikTok の oEmbed API はレスポンス遅い場合あり → タイムアウト 3s で諦めて 9:16 placeholder + ▶ overlay。ユーザーは何が起きたか分からないかも → メッセージ表示する？ **推奨**: タイムアウト時は静かに placeholder（過剰表示しない）
4. **TextCard の display font 採用**: 既存プロジェクトに Playfair / Fraunces / GT Super 等が入ってるか確認 → なければ Google Fonts 経由で追加（バンドルサイズ +10-30KB）。**推奨**: Fraunces (variable) 1 本に絞り、italic/regular で headline / editorial 両用
5. **favicon が真っ白の場合の brand color**: fast-average-color が "ほぼ白" を返す → background gradient が見えない。**推奨**: HSL の彩度 < 0.05 ならデフォルト neutral gradient (`#f5f5f5 → #e8e8e8`) に fallback

これら 5 点は writing-plans 段階で再確認、または実装中にユーザー判断を求める。

---

## Part C — Out of Scope（明確な非対象）

本 spec の対象外。別スプリントで独立した spec を書く。

- **C: Multi-playback** — クリックで in-place 再生、複数同時再生、音声競合 UX、iframe パフォーマンス管理、ミックス共有
- **A: Lightbox 拡大** — ホバー expand → 中央拡大 spring、recipe は `docs/private/card-interaction-recipes.md`
- **B+ スクショサービス**: TextCard を本物のスクショに置換可能にする migration path（microlink / Cloudflare Browser Rendering）
- **Instagram embed**: 規約厳しい、後回し
- **ツイート内インタラクション**: link クリック、画像拡大、action button（C 以降）
- **theme 連動**: react-tweet の light/dark を Booklage theme と連動（polish スプリント）

---

## Part D — 参照

- `components/board/CardNode.tsx` — 既に children 対応済の generic wrapper
- `lib/board/aspect-ratio.ts` — heuristic system（fallback として残置）
- `lib/board/column-masonry.ts` — aspect-driven layout（変更不要）
- `lib/storage/use-board-data.ts::computeAspectRatio` — 既に IDB cache 優先 → 測定結果書き込み API のみ追加
- `lib/storage/indexeddb.ts` — `cards.aspectRatio` 既存 → schema migration 不要
- `docs/superpowers/specs/2026-04-19-b0-board-skeleton-design.md` — B0 6 層構成
- `docs/superpowers/specs/2026-04-20-board-content-sized-reorder-design.md` — content-sized masonry
- `docs/REBUILD_VISION.md` — リビルド全体方針
- `docs/private/IDEAS.md`（非公開） — 参考サイト・差別化方針
- `CLAUDE.md` — コーディング規約・プライバシー絶対ルール
- `docs/private/card-interaction-recipes.md` — A スプリント用（B では未使用）
- `docs/private/shopify-design-full-recipe.md` — UI chrome の数値レシピ参照
- 外部:
  - `react-tweet` — https://github.com/vercel/react-tweet
  - `@chenglou/pretext` — https://github.com/chenglou/pretext
  - `fast-average-color` — favicon → background brand color
  - Google s2 favicon service — `https://www.google.com/s2/favicons?domain=...&sz=64`
