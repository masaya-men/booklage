# Share System — Design Spec

> **Date**: 2026-05-05
> **Status**: Approved (pending user review)
> **Source**: `docs/private/launch-plan-2026-04.md` Plan B + 2026-05-05 brainstorming session
> **Implementation**: TBD next session via `superpowers:writing-plans` → execution

---

## 1. Goal

Booklage の核となるバイラル機能を実装する。ユーザーが自分のブクマコレクションから「シェア用ムードボード」を組み立て、**画像 + URL の両方**として SNS に投稿できる。受信者はブラウザで同じコラージュを閲覧でき、任意で自分のボードへ取り込める。

### Why this matters
- 「ブクマ管理ツール」と「ビジュアル表現ツール」と「バイラルシェア」の 3 点融合が Booklage の差別化軸。Share がその拡散経路。
- launch-plan 上、Phase 1 収益（広告 + アフィリ）は流入量に直結するため、Share による viral pickup 必須。

---

## 2. User Flow

### 2.1 Sender flow（送り手）

1. **Trigger**: ボード上の Toolbar にある「Share」ピル（FilterPill / DisplayModeSwitch と並ぶ位置）をクリック
2. **Composer modal opens**:
   - 初期状態は **viewport snapshot**（現在画面に映っているカードがそのまま枠内に再現される）
   - アスペクト比初期値は **「全体」**（viewport の自然な比率に追従）
3. **アスペクト切替**: 「全体 / 1:1 / 9:16 / 16:9」のピルを選択
   - 切替時、シェア枠が選択比率に変わり、中身のカードが column-masonry で再配置される
4. **カードの追加・削除**:
   - 下部にソースリスト（横スクロール）— ボード上の全カードのサムネ
   - クリックでシェア枠に追加 / 削除トグル（オレンジ枠で選択中表示）
   - ショートカット 2 種:
     - **「全部入れる」** — 1 クリックで board の全カードを枠に詰める
     - **「表示中のみ」** — 現在の filter / mood で見えてるカードだけ詰める
5. **シェア枠内の編集**（board と完全パリティ）:
   - drag で位置変更
   - S/M/L サイズ変更
   - 削除（右クリック or × ボタン）
6. **ウォーターマーク**は出力時に右下へ自動付加（プレビューでも見える）
7. **Confirm**: 「画像 + URL でシェア」ボタン
8. **Action sheet**:
   - 「画像をダウンロード」(PNG)
   - 「URL をコピー」(クリップボード)
   - 「X で投稿」(Web Intent — 画像はユーザー手動添付、URL + 「Booklage で見る」テキスト自動)

### 2.2 Recipient flow（受け取り手）

1. URL を開く（`https://booklage.pages.dev/share#d=<encoded>`）
2. **新しい `/share` ルート**で view-only renderer がデコード → 描画
3. 画面: シェアされたコラージュを board と同じ視覚言語で表示（ただし **編集不可**）
   - カードクリックで Lightbox 表示は OK（埋め込みメディア再生も OK）
4. **画面下部に floating CTA**: 「自分のボードに追加 +」
5. クリックで **Import Confirm Modal** 開く:
   - 「N 件のブクマを追加します」
   - フォルダ選択（既存 mood / 新規 mood）
   - 「追加」/「キャンセル」
6. 「追加」押下: IndexedDB に書き込み → `/board` に遷移

---

## 3. Architecture / Components

### 3.1 New components

| Component | Path | Purpose |
|---|---|---|
| `<ShareComposer>` | `components/share/ShareComposer.tsx` | Top-level modal. Manages aspect / cards / preview state |
| `<ShareFrame>` | `components/share/ShareFrame.tsx` | シェア枠の中身。CardsLayer を再利用してムードボードと同じ見た目に |
| `<ShareSourceList>` | `components/share/ShareSourceList.tsx` | 下部の source 横スクロール |
| `<ShareActionSheet>` | `components/share/ShareActionSheet.tsx` | 確定後の DL / Copy / X intent |
| `<SharedView>` | `components/share/SharedView.tsx` | Recipient が見る view-only renderer |
| `<ImportConfirmModal>` | `components/share/ImportConfirmModal.tsx` | Recipient の取り込み確認 |
| `lib/share/encode.ts` | — | board → JSON → brotli → base64url |
| `lib/share/decode.ts` | — | 逆変換 + バリデーション |
| `lib/share/validate.ts` | — | セキュリティバリデーション |
| `lib/share/png-export.ts` | — | dom-to-image-more wrapper + watermark 合成 |
| `app/(app)/share/page.tsx` | — | Recipient ルート |

### 3.2 Modified components

| Component | Change |
|---|---|
| `components/board/Toolbar.tsx` | Share pill を FilterPill / DisplayModeSwitch と並べる位置に追加 |
| `components/board/BoardRoot.tsx` | Share state（modal open / close）を保持、ShareComposer をマウント |

---

## 4. Data Flow

### 4.1 Share data structure (in URL)

```ts
type ShareData = {
  v: 1                   // schema version
  cards: ShareCard[]
  aspect: 'free' | '1:1' | '9:16' | '16:9'
  bg?: 'dark' | 'light'  // future: theme
}

type ShareCard = {
  u: string              // bookmark URL (http(s):// only)
  t: string              // title (max 200 chars)
  d?: string             // description (optional, max 280 chars)
  th?: string            // thumbnail URL (optional, http(s):// only)
  ty: 'tweet' | 'youtube' | 'tiktok' | 'instagram' | 'image' | 'website'  // re-detected on import
  // Frame layout
  x: number              // position x in frame (0-1 normalized)
  y: number              // position y
  w: number              // width
  h: number              // height
  s: 'S' | 'M' | 'L'     // size preset
  r?: number             // rotation deg (-3..3)
}
```

### 4.2 Encoding pipeline (sender)

```
ShareData (object)
  → JSON.stringify
  → gzip compress (CompressionStream API, native)
  → base64url encode
  → URL fragment: #d=<base64url>
```

ブラウザ側だけで完結（サーバ不要）。

**圧縮アルゴリズム選定**: launch-plan には "brotli" とあったが、ブラウザの `CompressionStream` は brotli compression 未対応（decode のみ fetch 経由でサポート）。MVP では **gzip** を採用:

- `new CompressionStream('gzip')` / `new DecompressionStream('gzip')` でネイティブ対応
- Chrome 80+ / Safari 16.4+ / Firefox 113+ で動作（target audience に十分）
- 圧縮率は brotli の 80% 程度だが、JSON テキストでは実用上 4KB URL 制限内に収まる
- 将来必要になれば `brotli-wasm` (~70KB) を追加して切替可能

### 4.3 Decoding pipeline (recipient)

```
location.hash の #d= を抜き取る
  → base64url decode
  → DecompressionStream('gzip') で解凍
  → JSON.parse
  → validate.ts でバリデーション（NG なら error 表示）
  → SharedView に渡す
```

### 4.4 Hash-based, not query

URL は `?d=` ではなく **`#d=`**（fragment）を使う。理由:

- fragment はサーバーに送信されない → Cloudflare ログにも残らない、プライバシー保護
- 共有データはユーザーのものであって、サービス側で観測すべきでない（Privacy First の thesis に整合）
- 副作用: SSR 時に hash は読めないので、`SharedView` は client-only component（`'use client'`）で書く

---

## 5. Security Requirements (MUST implement)

| # | Requirement | Implementation |
|---|---|---|
| 1 | URL スキーム allowlist | `validate.ts` で bookmark.u を `http://` / `https://` のみ許可。それ以外（`javascript:`, `data:`, `file:` 等）は丸ごと拒否 |
| 2 | XSS 防御 | Share / import 関連モジュール内で `dangerouslySetInnerHTML` を一切使わない。React default escape のみに依存 |
| 3 | 埋め込みタイプ再判定 | デコード後の `ty` フィールドを盲信せず、`detectUrlType(card.u)` で再判定して上書き |
| 4 | 件数・サイズ上限 | `validate.ts` で:<br>- bookmarks 数 ≤ 100<br>- decoded JSON サイズ ≤ 50KB<br>- URL fragment ≤ 4KB（base64url 後）<br>超過時は error 画面 |
| 5 | 文字列長制限 | title ≤ 200 文字、description ≤ 280 文字、URL ≤ 2048 文字。超過は truncate（拒否しない、UX 配慮） |
| 6 | サムネイル経由の IP リーク | MVP は許容。Phase 2 で `/api/img-proxy` 経由化。SharedView 描画時に「外部画像が読み込まれる」旨の小さい注記をモーダルに |
| 7 | URL fragment（#）使用 | `?d=` ではなく `#d=`。サーバーログに残らない |

これらは **lint ルール / vitest テスト** で実装漏れを防ぐ:

- `lib/share/validate.test.ts`: 上記 #1, #3, #4, #5 の境界値テスト
- ESLint custom rule（または README 上の方針として）: `dangerouslySetInnerHTML` を share/import モジュール内で禁止

---

## 6. Aspect Presets

MVP に入れる 4 種:

| ID | 表示名 | 比率 | 用途 |
|---|---|---|---|
| `free` | 全体 | viewport ratio | ボード全体を切らずにキャプチャ。ブログ、Booklage 自体の宣材 |
| `1:1` | 正方形 | 1:1 | Instagram 投稿、X 投稿 |
| `9:16` | 縦長 | 9:16 | Instagram Story / Reels / TikTok / YouTube Shorts |
| `16:9` | 横長 | 16:9 | X 投稿（横）、YouTube サムネ、OGP |

**`4:5`（Instagram 縦投稿）は post-launch で追加候補**。MVP からは省く（`9:16` と近似で UI 散漫を避ける）。

---

## 7. Watermark

PNG 出力時に右下へ合成する。

### 7.1 Variant A — テキストのみ（MVP デフォルト）

- フォント: Geist 600
- サイズ: 11px
- 文字: `Booklage`
- 背景: 単色 `rgba(0,0,0,0.55)`（**`backdrop-filter: blur` は PNG 書き出しに反映されないため使わない**。視認性は背景 alpha だけで担保）
- パディング: 4px 9px
- 角丸: 4px
- 文字色: `rgba(255,255,255,0.85)`
- マージン: 右下から 12px

### 7.2 Variant B — テキスト + URL（強いドメインを取得後）

- 上段: `Booklage`（11px, 600）
- 下段: `booklage.com`（8.5px, 400, opacity 0.55）
- 縦並び、右寄せ
- 背景・パディング・色は A と同じ

### 7.3 Switching logic

- `lib/share/watermark-config.ts` に const として定義
- 環境変数 or build-time flag（`NEXT_PUBLIC_WATERMARK_VARIANT='A' | 'B'`）で切替
- ドメイン取得後に flag を `B` に変更してデプロイで完了

### 7.4 Implementation note

Watermark はシェア枠 DOM 内に吸収させず、`png-export.ts` 内で:
1. dom-to-image-more で枠中身を render（scale: 2）
2. その出力に対し `<canvas>` 上で右下にウォーターマーク要素を重ね描き
3. 最終 dataURL を吐き出す

これにより:
- ウォーターマークが必ず PNG に焼き付く（DOM 書き換えで除去不可）
- スケール変更時もサイズが意図通り
- コラージュ枠の masonry 計算にウォーターマークが影響しない

---

## 8. Toolbar Share Button

### 8.1 Layout

既存の `<Toolbar>` の右端に追加:

```
[All ▼] [Visual] [Share ↗]
```

- 既存 FilterPill / DisplayModeSwitch と同じピル style
- 文字: `Share`（または `↗ Share`）
- アクセントカラー: 主張しすぎず、ほかのピルと同じ background opacity
- hover で opacity 上がる（既存パターン）

### 8.2 アクション

- click → `setShareComposerOpen(true)` を BoardRoot で受け、ShareComposer をマウント
- 動画再生中の場合、composer を開く前に動画を pause（再生中でもキャプチャは取れるが視覚的混乱を避けるため）

---

## 9. Receive flow detail (Recipient)

### 9.1 Routing

新規ルート `/share`:
- `app/(app)/share/page.tsx` で SSR は最小（client-only redirect）
- `app/(app)/share/SharedView.tsx` が `'use client'` で hash デコード + 描画
- URL: `https://booklage.pages.dev/share#d=<base64url>`

### 9.2 View-only mode の制限

- カードクリック → Lightbox は OK（埋め込みメディア再生も既存通り）
- カードのドラッグ・サイズ変更・削除は **無効化**（read-only view）
- BoardRoot の InteractionLayer は使わず、シンプルな viewport-fitted CardsLayer のみ

### 9.3 Import confirm modal

- 表示要素:
  - ヘッダー: 「N 件のブクマを追加します」
  - リスト: 各 bookmark のタイトル + URL（プレビュー）
  - フォルダ選択: dropdown（既存 mood + 「新規作成」）
  - 注記: 「外部 URL のサムネイルを読み込みます」（IP リーク開示）
  - ボタン: 「追加」（primary）/「キャンセル」
- 「追加」押下時:
  - validate.ts で再バリデーション
  - 既存 bookmarks との url 重複チェック → 重複は skip（counter で「N 件追加 / M 件スキップ」表示）
  - IndexedDB に書き込み（`addBookmark` 使用、bulk 化）
  - 完了後 `/board` に遷移、Toast で「追加されました」表示

---

## 10. Out of Scope (Post-launch)

| 機能 | 説明 |
|---|---|
| カード重ね（true collage） | 現在 masonry の整然レイアウトのみ。重ね・回転・透過の自由なコラージュ表現は **B1 装飾レイヤー**で別途検討 |
| **スライダー型カード拡縮** | S/M/L 離散値ではなく連続値スライダーで個別カードを滑らかにリサイズ。**B1 装飾レイヤーの優先機能**として TODO に登録（Share とは別タスク） |
| サムネ画像プロキシ | IP リーク完全防御。MVP は受信者の自衛で許容 |
| view-only mode の deep link | 個別カード単位の URL 共有 |
| 4:5 Instagram 縦アスペクト | 9:16 と近似。MVP は省略 |
| Multi-page Idea Pin 形式 | 1 シェアで複数枚のスライドを送る |
| ブクマ ID マージ | 受信者の既存ブクマと URL 重複時のマージ戦略強化（MVP は skip） |
| Source list の検索・フィルタ | board が大きい時の絞り込み UI |

---

## 11. Testing

### 11.1 Unit tests

- `lib/share/encode.test.ts`
  - round-trip: encode → decode が一致する
  - サイズが上限内に収まる（100 cards / 4KB）
- `lib/share/validate.test.ts`
  - 各セキュリティ要件 #1-5 の境界値
  - malformed JSON で graceful failure
- `lib/share/png-export.test.ts`
  - dom-to-image-more の mock で出力サイズが期待通り
  - watermark が付く

### 11.2 Integration tests

- `ShareComposer` レンダリング + アスペクト切替 + カード追加削除
- `SharedView` decode + render
- `ImportConfirmModal` IndexedDB 書き込みまでの flow

### 11.3 E2E (Playwright)

- 送信側: Toolbar Share クリック → composer → confirm → DL クリックで PNG ダウンロード確認
- 受信側: 共有 URL を直接開く → SharedView 表示 → 「追加」→ /board に遷移

---

## 12. Effort estimate

実装規模の目安（次セッションで `writing-plans` skill で正式に分解）:

| Phase | 内容 | 工数感 |
|---|---|---|
| 1 | `lib/share/encode.ts` + `decode.ts` + `validate.ts`（テスト含む） | 半日 |
| 2 | `<ShareComposer>` + `<ShareFrame>` + `<ShareSourceList>`（既存 CardsLayer 流用） | 1 日 |
| 3 | `lib/share/png-export.ts`（watermark 合成） + Action sheet | 半日 |
| 4 | `<SharedView>` + `<ImportConfirmModal>` + `/share` ルート | 半日 |
| 5 | Toolbar Share pill + BoardRoot 統合 | 2 時間 |
| 6 | E2E + polish + watermark 微調整 | 半日 |
| **合計** | | **3-4 日（集中して）** |

---

## 13. Dependencies

| 既存 | 使う |
|---|---|
| `dom-to-image-more` | PNG 書き出し |
| `idb` | IndexedDB（既存 indexeddb.ts） |
| `CompressionStream` / `DecompressionStream` API | brotli（modern browser ネイティブ） |
| `next/navigation` | URL hash 読取 |
| 既存 `<CardNode>` | Composer / SharedView の描画再利用 |
| 既存 `lib/board/column-masonry.ts` | Composer 内のレイアウト計算 |
| 既存 `detectUrlType` | 埋め込みタイプ再判定 |

新規依存追加なし（dom-to-image-more は既に package.json にあり）。

---

## 14. Open questions (next session)

- ✅ ブランド名再考は **Share 実装完了後の別 brainstorming** で扱う（ウォーターマークと metadata の name は変数化済なので一括置換で対応可能）
- ⏸ Watermark variant B 切替タイミング = ドメイン取得後
- ⏸ X Web Intent の文面プレースホルダー（実装時に確定）

---

## 15. Sign-off

- 設計: 2026-05-05、Claude + ユーザー対話により合意
- 次工程: `superpowers:writing-plans` で具体的タスク分解（次セッション）
