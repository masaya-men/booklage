# X 複数画像データを保存時に取り込む対応 — 設計

- **日付**: 2026-05-12 (セッション 15 brainstorm)
- **対応元アイデア**: セッション 14 末ユーザー実機 FB (I-07-#1)、 旧 spec §10 オープン問題「既存 X tweet のバックフィル方針」
- **TODO 連動**: [docs/TODO.md](../../TODO.md) §「セッション 14 末ユーザー実機フィードバック」 I-07-#1
- **先行 spec**:
  - [2026-05-12-multi-image-hover-design.md](./2026-05-12-multi-image-hover-design.md) (I-07 Phase 1)
  - [2026-05-12-mixed-media-tweet-design.md](./2026-05-12-mixed-media-tweet-design.md) (mix tweet 対応 — mediaSlots[] 統一型)

## 0. ゴール

X (Twitter) 投稿のブクマで、 **保存ボタンを押した瞬間から複数画像/動画の hover 切替が効く** 状態にする。 ユーザーが「Lightbox を一度開く」 という余計な操作なしで完成済になる。

加えて、 過去に保存した X ブクマ (mediaSlots / photos が未取得な v12 以前のロー) も、 ユーザーが触らずに裏で徐々に完成させる。

## 1. スコープ

### MVP 対象
- **X (Twitter)** 投稿の保存時 syndication 取得
- **既存ブクマの遅延 backfill** (ボード mount 時、 visible なカード限定、 rate-limit 付き)
- **Lightbox open 時 backfill 維持** (Phase 1 で実装済、 最終救済セーフティネットとして残す)

### 非ゴール (本 spec)
- Bluesky 対応 (旧 spec Phase 2 で扱う、 同じ 3 段防御パターンを後で適用)
- 動画+画像 mix tweet 自体の対応 (mediaSlots[] 統一型導入は別 spec で実装、 本 spec はそれを前提とする)
- 削除されたブクマの backfill (= フィルタで非 visible なものは対象外)

## 2. 主要決定事項

| # | 論点 | 採用案 | 根拠 |
|---|---|---|---|
| 1 | いつ取り込むか | **3 段防御**: 保存直後 + ボード mount + Lightbox open (現状維持) | ユーザー判断 (C 案) |
| 2 | 保存時 fetch の発火タイミング | **保存後 fire-and-forget** (UX 遅延ゼロ) | UX 観点で保存 toast は即出す |
| 3 | ボード mount 時の対象 | **現在の filter で visible なカードに限定** | タグ機能完成後の自然な最適化、 「ユーザーが使うものから順に完成」 |
| 4 | rate-limit 戦略 | **並列 3 個 / 200ms 間隔** (Twitter syndication API への過剰 burst 防止) | 仮値、 実装時に Cloudflare proxy のキャッシュ状況見て調整 |
| 5 | 失敗時挙動 | **次の段に持ち越し** (保存時失敗 → mount リトライ → Lightbox 救済) | 多層防御の真価 |
| 6 | 進捗 UI | **無し** (ユーザー意識せず裏で完了する設計) | UX 上「裏で何かしてる」 感を出さない |

## 3. アーキテクチャ

### 3-1. 3 段防御の全体像

```
┌─ Phase A: 保存直後 fetch (新規ブクマ向け) ────────┐
│  bookmarklet / extension が save dispatch       │
│  → IDB に基本データ書き込み (即完了 toast)        │
│  → 裏で syndication fetch (fire-and-forget)     │
│  → mediaSlots[] を IDB update                   │
└──────────────────────────────────────────────┘
         ↓ 失敗時 (rate limit / network)
┌─ Phase B: ボード mount 時 backfill (過去ブクマ + Phase A 失敗の救済) ┐
│  BoardRoot の useEffect (mount 後)             │
│  → visible なカードのうち mediaSlots 未取得を抽出 │
│  → rate-limit (並列 3 個 / 200ms) で順次 fetch  │
│  → mediaSlots[] を IDB update                  │
│  → (rate-limit があるので UI 体感影響ゼロ)       │
└──────────────────────────────────────────────┘
         ↓ さらにすり抜けたケース
┌─ Phase C: Lightbox open 時 fetch (現状 Phase 1 維持) ┐
│  既存実装 (Lightbox.tsx:171-181)              │
│  → 1 ブクマ開いた瞬間に必ず fetch              │
│  → mediaSlots[] を IDB update                 │
└──────────────────────────────────────────────┘
```

### 3-2. データソース優先順位 (描画時)

これは別 spec (mixed-media-tweet) で定義済。 本 spec は「**いつ IDB に書き込むか**」 だけを定義。

## 4. 実装詳細

### 4-1. Phase A: 保存直後 fetch

#### A-1. bookmarklet 経路 ([lib/utils/bookmarklet.ts](../../../lib/utils/bookmarklet.ts))
- bookmarklet IIFE は OGP 抽出までで変更なし (current behavior)
- booklage 側の `/save` 経路 (or postMessage 受信側) で IDB に書き込んだ**直後**、 URL が X 投稿なら syndication fetch を発火:
  ```ts
  // 擬似コード (実装場所未定、 設計時に決める)
  await saveBookmarkToIDB(record)
  showToast('保存しました')  // ユーザーに即フィードバック

  // ここから fire-and-forget
  if (detectUrlType(record.url) === 'tweet') {
    const tweetId = extractTweetId(record.url)
    if (tweetId) {
      void fetchTweetMeta(tweetId).then((meta) => {
        if (meta?.mediaSlots && meta.mediaSlots.length > 0) {
          void persistMediaSlots(record.id, meta.mediaSlots)
        }
      }).catch(() => {})  // 失敗は無視、 Phase B/C で救済
    }
  }
  ```

#### A-2. extension 経路 ([extension/background.js](../../../extension/background.js))
- background.js の save handler で IDB 書き込み後、 同様に syndication fetch を fire-and-forget で発火
- extension は service worker context で chrome.scripting / chrome.offscreen 経由なので、 partition 問題なく fetch 可能

#### A-3. 失敗時挙動
- ネットワークエラー / rate limit / Twitter 凍結 → silent fail、 IDB は基本データのみ
- ユーザーには見えない (toast は既に出てる)
- 次回ボード mount で Phase B が拾う

### 4-2. Phase B: ボード mount 時 backfill

#### B-1. 発火タイミング
- `BoardRoot.tsx` の useEffect、 board data load 完了後に実行
- mount 後 1 度だけ (filter 変更時は別タスクで考慮 — §6 参照)

#### B-2. 対象抽出
```ts
// 擬似コード
const targets = visibleItems
  .filter((item) => detectUrlType(item.url) === 'tweet')
  .filter((item) => !item.mediaSlots || item.mediaSlots.length === 0)
  .filter((item) => !item.photos || item.photos.length === 0)  // 旧 v12 fallback も未取得
```

**「visible」 の定義**: 現在 board に表示されているカード (= フィルタや検索で除外されていない、 削除されていない)。 ブラウザのビューポート (= スクロール可視範囲) ではなく、 **DOM に存在するカード全体**。

#### B-3. rate-limit
- 並列 3 個まで、 各 fetch 間 200ms 間隔
- 例: 100 個ターゲット → 100 / 3 × 200ms = ~6.7 秒で完了
- Cloudflare proxy にバーストを発生させない、 Twitter syndication API への礼儀

実装は p-queue 等のライブラリ or 手動で簡易キュー。 軽量さ優先で後者推奨。

#### B-4. 進捗 UI
- **なし**。 ユーザーが意識しない設計
- 完了したカードはサイレントに hover 切替可能になる (= ドット行が静かに出るようになる)

#### B-5. mount 中の中断
- ユーザーがボード遷移 / ページ閉じる → AbortController で中断
- 次回 mount でやり直し (= 完了してないものだけ再 fetch)

### 4-3. Phase C: Lightbox open 時 backfill (既存維持)
- [Lightbox.tsx:171-181](../../../components/board/Lightbox.tsx#L171-L181) の既存実装をそのまま維持
- Phase A/B でカバーできなかった超レアケース (filter 外のカードを直接 URL でアクセス等) を救済

## 5. データ取得経路 (技術詳細)

### 5-1. fetchTweetMeta() / persistMediaSlots()
- 既存 `fetchTweetMeta` ([lib/embed/tweet-meta.ts](../../../lib/embed/tweet-meta.ts)) を共用 (本 spec で改修なし)
- mixed-media-tweet spec の `persistMediaSlots()` を共用 (= [lib/storage/use-board-data.ts](../../../lib/storage/use-board-data.ts) で実装)

### 5-2. Cloudflare proxy の cache header (オプション最適化)
- [functions/api/tweet-meta.ts](../../../functions/api/tweet-meta.ts) で `Cache-Control: public, max-age=86400` を response header に追加
- 2 度目以降の同 tweet ID は Cloudflare edge cache から即返る (Functions invocation 不要)
- 実装時に既存 header を確認、 未対応なら追加

実装コスト: 数行。 spec 実装中に併せて入れる。

### 5-3. AbortController 統合
- Phase B の rate-limit キューを AbortController で制御
- ユーザーがボードから離れる時に signal.abort() → 進行中の fetch をキャンセル

## 6. 既知の制約・将来課題

### 6-1. filter 変更時の追加 backfill
- 本 spec ではボード mount **直後 1 回のみ** backfill
- ユーザーがタグや検索でフィルタを変更した瞬間に追加 visible になったカードは、 mount 時の対象外
- **将来課題**: filter 変更時 hook で追加 backfill を発火する別 spec
- 現状の救済: そのカードを Lightbox で開けば Phase C で取得される (= UX 上問題なし)

### 6-2. 大量ブクマでの初期遅延
- 1000 個のブクマで mediaSlots 未取得 300 個 → 300 / 3 × 200ms = 20 秒で完了
- ボード mount 直後はサムネのみ表示、 20 秒以内に hover 切替が順次 unlock
- ユーザーはサムネだけ見ていれば気づかない (= ぐるぐる UI 等は出さない)

### 6-3. cache 失効
- Cloudflare edge cache は 24h 後に再 invalidate (Functions 経由で fresh fetch)
- 24h 以内の同 tweet 再 fetch は実質コスト 0

### 6-4. Twitter 削除済 tweet
- syndication API が 404 を返す → mediaSlots は IDB に書かれない、 既存 photoUrl だけ残る
- 表示は thumbnail fallback (= 既存挙動)

## 7. パフォーマンス・コスト見積もり

### 7-1. Cloudflare Pages Functions invocations
| シナリオ | 1 日 invocation 数 | 無料枠 (100k/day) 比 |
|---|---|---|
| 100 ブクマユーザー、 mediaSlots 未取得 30 個、 5 セッション/day | ~150 | 0.15% |
| 1000 ブクマユーザー、 未取得 300 個、 5 セッション/day | ~1,500 | 1.5% |
| 1000 ブクマユーザー + **タグフィルタで visible 200 個** | ~150 | 0.15% |
| **タグ機能後、 通常運用** | **10-50** | **0.05%** |

### 7-2. 帯域
- Cloudflare Pages bandwidth: **完全無制限** (egress 課金なし)
- syndication response: ~5KB/tweet 平均
- 300 ブクマ backfill = ~1.5MB

### 7-3. IDB 書き込み
- ms 単位、 ユーザー体感ゼロ
- 容量: 100 ブクマ × mediaSlots ~500B/record = 50KB 増 (= ブラウザ容量上限の 0.001%)

### 7-4. ユーザー体感
- 保存時: 遅延ゼロ (fire-and-forget)
- ボード mount 時: ぐるぐる UI なし、 サムネは即表示、 hover 切替が 5-20 秒以内に順次 unlock
- 完全無料維持、 100 ユーザー規模まで余裕

## 8. ファイル変更一覧

### Phase A 実装
- [lib/utils/bookmarklet.ts](../../../lib/utils/bookmarklet.ts) — bookmarklet → booklage の save handler に syndication fire-and-forget 追加 (or 受信側で発火)
- [extension/background.js](../../../extension/background.js) — extension save 後の syndication fire-and-forget
- [lib/storage/use-board-data.ts](../../../lib/storage/use-board-data.ts) — `persistMediaSlots()` は mixed-media spec で実装済前提

### Phase B 実装
- [components/board/BoardRoot.tsx](../../../components/board/BoardRoot.tsx) — mount 後の backfill effect、 rate-limit キュー
- **NEW** `lib/board/backfill-queue.ts` — rate-limit キュー実装 (並列 3 / 200ms 間隔、 AbortController 対応)

### Phase C
- 変更なし (既存 [Lightbox.tsx:171-181](../../../components/board/Lightbox.tsx#L171-L181) 維持)

### 共通
- [functions/api/tweet-meta.ts](../../../functions/api/tweet-meta.ts) — `Cache-Control: public, max-age=86400` header 追加 (まだ未対応なら)
- [tests/lib/backfill-queue.test.ts](../../../tests/lib/) — **NEW** rate-limit キューの unit test
- [tests/e2e/board-backfill.spec.ts](../../../tests/e2e/) — **NEW** seed photos 未取得ブクマ → mount → 数秒後に mediaSlots 取得済 verify

## 9. テスト計画

### unit (vitest)
- `backfill-queue`: 並列度 3、 間隔 200ms、 AbortController キャンセル動作
- 「visible なカードを正しく抽出」 — タグ filter 中 / 検索中 / 全表示時

### integration (Playwright E2E)
- Phase A: 新規 X ブクマ保存直後にボード hover → 数秒以内にドット出現
- Phase B: 旧 v12 ブクマ複数 seed → ボード mount → 10 秒以内に全 mediaSlots 取得済
- Phase B + filter: タグで絞った状態で mount → visible のみ backfill、 非 visible は未取得のまま
- Phase C: 上記の網にすり抜けた tweet を Lightbox open → 既存通り backfill 動作

### 視覚回帰
- ボード mount 中もカードはサムネ表示で固まらない
- hover ドットの「途中で出始める」 タイミングが UX 上不自然でない
- ぐるぐる UI / spinner が出ない

## 10. ロールアウト

- mixed-media-tweet spec を先に実装 (前提)
- 本 spec を Phase A → Phase B の順に実装、 別 commit
- Phase C は既存維持 (commit なし)
- 各 phase 完了で deploy + 実機検証
- 1 セッション ~4-6h で全 phase 実装可能

## 11. オープン問題 (実装時に決める)

- rate-limit の具体値 (並列 3 / 200ms は仮、 Cloudflare edge cache の hit 率次第で緩めても OK)
- backfill 中に「ボード mount → 即離脱 → 即再 mount」 した場合の挙動 (AbortController が即発火、 進行中の fetch がキャンセルされる前に再起動するレース) — useEffect cleanup を厳密にすれば防げる、 実装時に確認
- filter 変更時の追加 backfill (本 spec の非ゴール、 将来 spec)
- Bluesky / Mastodon 等の他 SNS 対応 (同パターンを後で適用)

## 12. 関連 memory / 設計判断 (継承)

- [feedback_fact_based](../../../memory) — 無料枠数値・Cloudflare 帯域は事実確認の上、 推測ではなく公式仕様で記載
- [feedback_collaboration_style](../../../memory) — board のコードを先に流用 (Phase C 既存維持)
- [feedback_one_thing_at_a_time](../../../memory) — Phase A → B → C の段階リリース
- [feedback_concise_responses](../../../memory) — 進捗 UI なし、 ユーザー意識せず裏で完了
- [project_duplicate_url_policy](../../../memory) — 重複 URL は別 record として扱う、 backfill 対象も独立

## 13. 旧 spec との関係

旧 I-07 spec §4-3 ・§10 で「Lightbox open 時のみ vs background refresh」 がオープン問題として残されていた。 本 spec はそれを解消し、 「保存時 + mount + Lightbox open」 の 3 段防御へ進化させる。

mixed-media-tweet spec で導入される `mediaSlots[]` 統一型を、 本 spec の 3 段防御で全 IDB ローに行き渡らせる。 2 つの spec はセットで実装することで、 動画+画像 mix tweet も含めて完全対応となる。
