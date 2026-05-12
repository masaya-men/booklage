# Card Metadata Health Design

**Date**: 2026-05-13
**Session**: 20
**Scope**: B-#1 (空白カード fallback) / B-#2 (再取得ボタン) / Lightbox close 中の wheel 反応 bug
**Status**: Draft — awaiting user review

---

## 背景

セッション 19 末で 「サムネ系 UX バグ 3 本」 をセッション 20 のゴールに据えた。 ユーザーから 4 件の実例 URL の提示を受けて実態調査した結果、 表層的にはどれも 「空白カード」 だが、 **3 つの異なる原因** が混在していることが判明。 これを一貫した 「カード metadata の健全性」 設計として整理する。

### 実測 (2026-05-13)

| URL | og:title | og:image | 真因 |
|---|---|---|---|
| Instagram reel `/reel/DXtv3iwjBVO/` | (取れず、 bot ブロック) | (取れず) | データ薄い |
| labs.noomoagency.com | "Noomo Labs" ✓ | **`/OpenGraph.jpg`** (相対) | scraper bug |
| codepen.io/.../full/... | (空、 サイト側未提供) | (空) | データ薄い |
| pitperform.eu | "PIT \| Perform..." ✓ | **`/images/ogImage.png`** (相対) | scraper bug |

加えてユーザー報告:
- Lightbox を ×/Esc/backdrop で閉じた直後にマウススクロールすると、 close tween 中に nav が反応して隣カードへの遷移アニメが一瞬走って見える。

---

## 設計概要 — 3 状態モデル

カードを metadata の健全性で 3 状態に分類する。

| 状態 | 条件 | 見た目 | UX |
|---|---|---|---|
| **(1) 通常** | thumbnail 取れる or title 取れる | 既存 ImageCard / TextCard | 既存通り |
| **(2) 薄い** | サムネも題名も取れないが **link は alive** (例: CodePen full, Instagram bot 弾き) | 大きい favicon + hostname を主体にした richer TextCard | 読める |
| **(3) 消えた** | リンク先 404/410/接続不能 | 薄グレー + 「リンク切れ」 ラベル + 削除 CTA。 クリックで誤って遷移しないよう onClick 封じ | 削除しやすい |

新規スキーマフィールド:

```ts
// BookmarkRecord 拡張
linkStatus?: 'alive' | 'gone' | 'unknown'  // default: undefined = 'unknown'
lastCheckedAt?: number  // Unix ms, last revalidation timestamp
```

`undefined` を `'unknown'` 扱いとし、 既存レコードは migration なしで自然に振る舞う。

---

## データモデル変更 (IDB)

### Schema bump: v13 → v14

`lib/storage/indexeddb.ts` の `BookmarkRecord` に上記 2 フィールドを **optional** で追加。 既存 v13 record をそのまま読み書きできる (= 実質的に additive)。 ただし IDB version 番号自体は上げないと idb ライブラリが新 schema を認識しないため bump 必須。

### Schema bump リスクと対策

memory `project_idb_irreversibility.md` の教訓: 一度 v14 に上げた DB は v13 build で開けない (`VersionError`)。 deploy 後は rollback できない。

**緩和策**:
- migration は purely additive (新カラム optional)。 既存データ破壊なし
- v14 schema を local dev で v13 → v14 → 通常操作の往復で検証
- production deploy 前に開発用 IDB を完全 clear して v14 cold-start も検証

---

## 機能詳細

### 4.1 og:image 絶対 URL 化 (scraper bug fix)

#### 問題
- [`functions/api/ogp.ts:101`](functions/api/ogp.ts#L101) — `extractMeta(html, 'og:image')` が相対パスを素通し。
- [`extension/lib/ogp.js:12`](extension/lib/ogp.js#L12) — 同じく相対パス素通し (Chrome 拡張経由の保存)。
- [`extension/lib/dispatch.js`](extension/lib/dispatch.js) — `extractOgp` の inline 複製。 同じ修正が必要。
- [`lib/utils/bookmarklet.ts`](lib/utils/bookmarklet.ts) — bookmarklet 経由の `extractOgpFromDocument`。 確認要。

#### 修正
`extractFavicon` と同じ URL 解決ロジックを共通化して og:image にも適用:

```ts
function resolveMaybeRelative(href: string, baseUrl: string): string {
  if (!href) return ''
  if (href.startsWith('http')) return href
  if (href.startsWith('//')) return `https:${href}`
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
```

これを og:image / twitter:image / favicon の 3 経路で使う。

#### 既存 IDB レコードの backfill
過去に相対パスで保存された record は thumbnail field がそのままなので、 board 起動時に以下を実行:

- thumbnail field が `/` または `./` で始まる → URL 単位で hostname と組み合わせて絶対化
- 結果を IDB に persist
- これは 1 回限りの cleanup migration として実装 (v14 onUpgrade 内で全 record scan)

### 4.2 「薄い」 カード fallback デザイン

#### 現状
[`TextCard.tsx:43`](components/board/cards/TextCard.tsx#L43) は既に `item.title || hostname || item.url` の文字フォールバックを持つ。 だが favicon サイズが小さく、 ホスト名が小さい補助情報扱い → 「読めるカード」 感が弱い。

#### 変更
TextCard 内に新しい variant `'minimal'` を追加 (typography.mode と並列の判定軸、 または別 component `MinimalCard` として切り出し)。 適用条件:

- `item.title` が空 or `item.url` と一致 (= 取得失敗)
- かつ `item.thumbnail` も空

このとき、 通常の TextCard レイアウトの代わりに:
- 中央に大きい favicon (64-96px)
- その下に `hostname` を中サイズで
- 下端に短縮 URL (`/path...`) を控えめに

詳細レイアウト・余白・タイポは実装時に Visual Companion で 2-3 mockup 提示してユーザー選択。

### 4.3 リンク切れ検出機構

#### 検出戦略 (viewport + 経年)

```
カードが viewport に入る
  ↓
lastCheckedAt が 30 日以上前 OR null か?
  ↓ yes
revalidation queue に push (max 3 concurrent / sec)
  ↓
/api/ogp 経由で再 scrape
  ↓
- 200 OK + data 改善 → record 更新、 linkStatus='alive'
- 200 OK + data 変化なし → linkStatus='alive', lastCheckedAt のみ更新
- 404 / 410 / network error → linkStatus='gone'
  ↓
lastCheckedAt = now
```

#### Cloudflare Workers 負荷試算

- 10,000 ブクマ x 30 日に 1 回 = 平均 333 req/日 (理論値)
- 実際は viewport-driven なので、 ユーザーが見ない古いカードは check されない → さらに少ない
- Cloudflare Pages 無料枠: 100,000 req/日 → 1 ユーザー 0.3% 消費

10k ブクマでも重くない、 と回答した根拠。

#### 並列度・debounce
- 同時 fetch 上限 3 (browser side concurrency limit)
- viewport 入場 → 200ms debounce してから check (短時間でスクロール通過するカードは除外)

### 4.4 再取得ボタン (B-#2)

#### UI
カード hover で出現する 「↻」 ボタン (右上 16-20px)。
- Pointer-large 配慮で touch target 32×32px (memory `feedback_large_pointer.md`)
- カード自体の onClick とは独立 (event.stopPropagation)

#### 動作
- age guard を無視して即 `/api/ogp` 叩く
- ローディング中は ↻ を spin animation
- 成功: 結果でカード更新 + 「↻」 が一瞬チェック ✓ に変わって消える
- 失敗: linkStatus='gone' に降格 + カードが (3) 状態へ遷移

### 4.5 全件再 check (設定画面)

#### 動機
B-#1 の relative path bug で過去に壊れたままの thumbnail を一括で healing したい・ ユーザーが大量に古いブクマを掃除したい瞬間がある。

#### UI
設定画面 (or 一時的に header メニュー) に 「全ブクマを再チェック」 ボタン。 押すと:
- 確認ダイアログ: 「N 件を裏で順次チェックします。 ~M 分かかります。 タブを閉じても進行が保存され、 次回開いたら続きから再開します」
- 並列度 3、 1 req/sec で background 実行
- 進捗バーを header に小さく表示

#### 進捗の永続化
IDB の `boardConfig` store に `revalidationQueue: { remainingIds: string[], startedAt: number }` を追加。 タブ閉じ → 再起動 → 残りから resume。

### 4.6 Lightbox close 中 wheel 抑止 (independent polish)

#### 問題
[`Lightbox.tsx:564-580`](components/board/Lightbox.tsx#L564-L580) の wheel listener は `closingRef.current` を見ていない。 close tween は ~500ms 走るので、 その間に発生した wheel が `nav.onNav()` を発火させてしまう → 隣カードへの遷移アニメが一瞬走る。

#### 修正
```ts
const onWheel = (e: WheelEvent): void => {
  if (closingRef.current) return  // ← 追加
  // ... 既存処理
}
```

同様の懸念がある Arrow key listener ([`Lightbox.tsx:529-557`](components/board/Lightbox.tsx#L529-L557)) にも同じガードを追加。

---

## UX / フィルタ統合

### 「リンク切れだけ表示」 フィルタ

#### 設計判断 — タグではなくフィルタ
当初 「リンク切れ system タグ自動付与」 で議論したが、 コード調査の結果:
- 既存 `tags: string[]` は実体が **mood ID 配列**
- フィルタ型 `BoardFilter = 'all' | 'inbox' | 'archive' | `mood:${id}``
- 「リンク切れ」 を mood として混ぜると mood 一覧が汚染される

→ より自然な解として **`BoardFilter` 型に `'dead'` を追加**。 `applyFilter` で `linkStatus === 'gone'` を選別する。 UI 上は mood 一覧の下に system filter として 「リンク切れ N 件」 を表示。 多言語化はフィルタラベル翻訳のみで完結 (system タグ文字列を翻訳する複雑性を回避)。

UX としてはユーザーが期待する 「1 クリックで切れたものだけ表示」 と完全一致。

### gone カードの操作
- クリックしても外部遷移しない (= 既に消えてる URL を開いても 404 を見るだけ)
- カード上に 「削除」 ボタンを目立たせる
- 一括選択モードで gone フィルタと組み合わせて 「全部消す」 が 3 クリックで完結

---

## 実装ステップ案

優先度順、 各 step は独立 deploy 可能。

1. **Step 1** (低リスク、 即効): scraper の og:image 絶対化 (4.1)
2. **Step 2** (低リスク、 small): Lightbox wheel guard (4.6)
3. **Step 3** (中、 IDB bump): v14 schema migration + 既存相対パス backfill (4.1 + 4.3 のスキーマ準備)
4. **Step 4** (中): viewport-driven revalidation + linkStatus 更新 (4.3 中核)
5. **Step 5** (中): 再取得ボタン UI (4.4)
6. **Step 6** (デザイン判断要): 「薄い」 カードレイアウト (4.2) — Visual Companion 使用予定
7. **Step 7** (中、 任意): フィルタに `'dead'` 追加 + gone カード見た目 (4.5 系)
8. **Step 8** (任意、 大): 設定画面の 「全件再 check」 (4.5)

Step 1〜3 をセッション 20 で必達、 Step 4〜7 は体力次第。 Step 8 は別セッションでも可。

---

## リスク・前提

### IDB v14 bump 1 回しかチャンスがない
- 一度 deploy したら rollback 不能 (memory `project_idb_irreversibility.md`)
- additive のみで設計しているので破壊リスクは低いが、 必ず local で **v13 → v14 → 操作 → close → reopen** を実機確認してから deploy

### Worker 課金
- 無料枠 100k req/日。 1 ユーザー (= 現在のソロ運用) では絶対超えない
- 将来 100 ユーザーが同時に 「全件再 check」 を回したら一瞬で枯渇する → Step 8 の UI には 「他ユーザーに迷惑になる可能性」 という文言入れる、 または rate limit を Worker 側で実装する選択肢を残す (TODO に記録)

### og:image 絶対化で過去 IDB record を書き換える
- backfill 中に書き込み race condition が起きないよう、 startup 1 回限りの sequential cleanup として実装
- backfill 対象: thumbnail が `/` または `./` で始まる record のみ

### gone と判定する閾値
- HTTP 404 / 410 → 確定 gone
- HTTP 403 / 5xx / timeout → `linkStatus` を変えない (= 一時的かもしれない)
- 連続 3 回失敗で gone 確定、 という案もあるが MVP では「404/410 のみ即 gone」 のシンプル方針

### 関連だが scope 外
- B-#3 「重複 URL でサムネが出ない」 — 真因未特定。 本 spec では扱わない (別 session で個別調査)。
- 「再取得しても改善しない」 カード (data 薄いまま) は 「薄い」 状態のまま留まる。 ユーザーが見て削除判断する。

---

## 完了基準

- 上記 4 件の実例 URL のうち、 noomo / pitperform は通常状態 (1) で正常表示される
- Instagram / CodePen は (2) 薄いカードとして大 favicon + hostname で識別可能に表示される
- 上記 URL が将来消えたら viewport 入場 30 日後に自動で (3) gone 状態へ降格、 「リンク切れ」 フィルタで surface される
- Lightbox を閉じた直後の wheel で隣カードへの遷移アニメが走らない
