# 次セッションのゴール (= セッション 36)

## ゴール

**URL 有無による title font ジャンプを決着**。 session 35 で「文字カード hybrid scale-host」 + zoom 化 + cardWidth tier 揃いまで完成、 残る swap 瞬間の「かくっ」 は board (URL あり) / `.media` (URL なし、 omitMeta) の layout 差が原因 (= user 仮説、 妥当)。

## 背景 (= 開始時にこれを読む)

session 35 で完成した hybrid:

- 外側 clone (width/height tween) = 本家 destefanis と同方式
- 内側 scale-host with CSS `zoom` = 文字 crisp で「box と一緒に拡大」
- `cardWidth=280` ハードコード削除 → source の実 width で typography tier 揃った

残課題: `.media` (LargeTextCardScaler) は `omitMeta=true` で URL 行非表示、 アニメ clone (= cloneNode of source) は URL 行表示 → swap 瞬間に layout が「URL 行あり → なし」 で変化 → title の `flex: 1` で container サイズが変わって text 位置 / line layout が「かくっ」。

## 開始時の動き

1. user と挨拶
2. 3 案から user と相談して決める:

| 案 | 内容 | tradeoff |
|---|---|---|
| **A** | `.media` でも URL 表示 (= omitMeta 撤去) | シンプル、 右パネルと URL 重複 |
| **B** | アニメ clone から URL 行 strip (= cloneNode 後 metaTop/metaBottom 削除) | 重複なし、 click 瞬間に URL 消失 |
| **C** | URL 行 cross-fade (opacity tween) + typography 揺れ別調整 | リッチ、 工数大 |

session 35 の感覚: **A が筋**。 ただし board → lightbox の文脈遷移 / 右パネル情報重複を user と議論してから確定。

3. 決まったら実装 → tsc + vitest → 本番 deploy → user 実機確認

## 残課題 (= URL fix 後)

Item 2 / 4 (= テキストのみカード構造再設計、 Lightbox 右エリア整理) は時間あれば。

## 月末リマインダー (= 2026-05-31 約 2 週間後)

`allmarks.app` ドメイン取得確認。 残り約 2 週間。

## 引き継ぎ resources

- `docs/TODO_COMPLETED.md` セッション 35 セクション — narrative + 残課題詳細
- memory `reference_destefanis_visual_spec.md` — 本家実装の最新事実 (width/height tween、 transform:scale 不使用)
- memory `reference_flip_scale_compensation.md` — transform:scale FLIP 不採用確定 + hybrid scale-host 設計
- `components/board/Lightbox.tsx`:
  - `wrapCloneWithScaleHost` (≈ line 291)
  - OPEN tween (≈ line 884) / CLOSE tween (≈ line 626)
  - `LargeTextCardScaler` (≈ line 2017)
  - cardWidth fix (≈ line 1830)
