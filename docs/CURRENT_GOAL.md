# 次セッションのゴール (= セッション 37)

## ゴール

**ツイート (X) Lightbox 経路の集中対応**。 session 36 末 user 発覚: ツイートカードを Lightbox で開くと profile image (= X ロゴ等) が巨大ガビガビ表示、 動画ツイートでも動画が出ない。 文字 jump 系は session 36 で完全決着済。

## 開始時の動き

1. user と挨拶
2. user 提示の再現 URL を board に投入して **実機 + DevTools 観察**:
   - https://x.com/konrad_designs/status/2054511169461727508
   - https://x.com/EnterProAI/status/2046946956455379344
   - https://x.com/lovart_ai/status/2049735758127276237
3. board 上で何のカード経路 (TextCard / ImageCard / VideoThumbCard / Tweet 専用) で描画されているか確認
4. Lightbox で開いた時に **どこで profile image fallback に落ちているか** を特定 (= TweetMedia / LightboxImageWithFallback / mediaSlots のいずれか)
5. 修正方針を user と合意してから実装 (= session 36 反省 = 独断 A 推しで失敗した経験から、 視覚に影響する変更は事前に「画面でどう見えるか」 を user に確認)

## 調査の出発点 (= ファイル参照)

- [components/board/Lightbox.tsx](components/board/Lightbox.tsx) `LightboxMedia` (≈ 1794) — 経路 routing
- ツイート専用: `isTweet` (= 412) + `TweetMedia` (= 1431 付近) + `mediaSlots` 関連
- 一般 webpage: `LightboxImageWithFallback` (= 2089) — 256px 未満 fallback 閾値
- mediaSlots 解析: [lib/embed/](lib/embed/) 配下の tweet-meta + oEmbed 経路
- thumbnail 解析: BoardItem.thumbnail / BoardItem.mediaSlots / BoardItem.photos

## 残課題 (= ツイート fix 後、 時間あれば)

- Item 2 / 4 = テキストのみカードの構造再設計 / Lightbox 右エリア整理 (= TODO.md 参照)

## 月末リマインダー (= 2026-05-31 約 2 週間後)

`allmarks.app` ドメイン取得確認。

## 引き継ぎ resources

- [docs/TODO_COMPLETED.md](docs/TODO_COMPLETED.md) セッション 36 セクション — narrative + 学び
- memory [reference_cardwidth_dual_management.md](C:/Users/masay/.claude/projects/c--Users-masay-Desktop--------/memory/reference_cardwidth_dual_management.md) — cardWidth 二重管理罠 (= session 37 でも参考になる: ツイートカードでも同様の「IDB 保存値 vs 実 rendering」 ズレが隠れている可能性)
- memory [feedback_user_observation_reveals_intent.md](C:/Users/masay/.claude/projects/c--Users-masay-Desktop--------/memory/feedback_user_observation_reveals_intent.md) — 撤去前に why を再点検
