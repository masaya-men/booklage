# IDB 公開前恒久対策 spec

> **位置付け**: 一般公開 (世界に向けたローンチ) **前に必ず実装**する 3 本柱。
> 現在 `lib/storage/indexeddb.ts` に置いている auto-reload セーフティネットは、
> 開発者個人 (= masaya) が再 deploy を試すための **一時的な応急処置**であり、
> 公開時点ではこの spec の対策で置き換えて削除する。

---

## 背景

セッション 16 (2026-05-12) で v12 → v13 schema bump 中、 別タブの古い接続が居残って
新接続が永久 `blocked` 状態になり、 board に何も表示されなくなる事故が発生。
ユーザーには Chrome 完全終了 + 再起動という手動復旧を強いた。

`onblocked` / `onblocking` ハンドラ + auto-reload を入れて (セッション 17) 一時しのぎ
した。 しかし**そもそも壊れない構造**で公開しないと、 第三者ユーザーは Chrome
再起動など手順を踏めず、 ブクマが消えたと錯覚してそのまま離脱する。

---

## 3 本柱

### 1. Service Worker `skipWaiting` + `clientsClaim`

新 build を deploy したとき、 旧 build chunk のキャッシュが clients に居残ると、
古いコードで開いた IDB 接続が新コードからの upgrade を block する。

- 新 SW を install したら即 `skipWaiting()` で activate
- activate 時 `clients.claim()` で全タブを新 SW 配下に強制移行
- 古いタブも `controllerchange` を listen し、 必要なら `location.reload()` で
  新 build を読ませる (ユーザー無操作で安全に切替)

これで「古いコードが居残ったまま新コードと衝突する」 シナリオ自体を消す。

### 2. IndexedDB Export / Import 機能

ブクマの JSON dump / restore 機能を board UI に追加する。

- 「データを書き出す」 ボタン: 全ブクマ + cards + moods + preferences を 1 JSON で download
- 「データを読み込む」 ボタン: JSON を投入、 IDB に merge or replace
- schema bump 前にユーザーがバックアップを取れる
- 万一 IDB が壊れても、 export 済 JSON があれば別ブラウザ / 別 PC でも復活
- 副次的効果: 端末間移行手段になる (本来 IndexedDB は端末ローカル)

### 3. Schema 凍結方針

公開後の schema bump は **致命的な互換性破壊**しか許容しない。

- 「ちょっと field 1 つ足したい」 を頻発させない → 既存 record を read 時に
  defaults を補う「**遅延 backfill** パターン」で吸収する
- どうしても bump する場合は:
  - 事前にユーザーへ通知 (アプリ内 banner)
  - 自動 export を促す
  - bump 中の `blocked` UX を実機検証してから deploy

---

## 実装順序 (公開前 TODO)

1. **IDB Export / Import** を最優先 (= 公開前の精神的セーフティネット)
2. **Service Worker** 配備 (現状 Next.js Static Export で SW なし、 新規追加が必要)
3. **schema 凍結** ポリシーを CLAUDE.md / コードコメントに明記

完了後:
- `lib/storage/indexeddb.ts` の `handleDBBlocked` / `handleDBBlocking` を削除
- `tests/lib/idb-blocked.test.ts` を削除
- このセーフティネット由来の sessionStorage キー `booklage:idb-blocked-reload-at`
  を排除

---

## メモ

- 一時的セーフティネットは feature branch `feat/mediaslots-mix-tweet-backfill`
  にて追加 (セッション 17)
- 削除予定: 上記 3 本柱完成後 (時期未定、 公開前)
