# 次セッションのゴール (= セッション 33)

## ゴール

**Lightbox 周りの実装方針 を頭の中で整理してから再着手**。 セッション 32 で複数の修正を試みたが、 user/Claude 双方が混乱して何度も deploy 直し → ようやく user 同意の方向が見えてきた段階で session close。 次セッションでは「セッション 32 末に decided な方向」 を素直に深堀りする。

## セッション 32 末で decided / deployed (= 本番反映済)

- **webpage は OG image 有無に関わらず全部「テキストカード風」 表示** (= LightboxTextDisplay 専用 component)
- **左右ナビ矢印 (navChevron) は常時表示 + クリック可能** (= 元の hover-reveal を廃止、 stage の pointer-events:none を override)
- **navChevron 背景は元の控えめ 10% で復元** (= user 「濃すぎる」 報告)
- **navChevron + embedOpenBadge + tweetWatchOnXBadge の backdrop-filter blur 削除** (= 高 DPR 環境で動く clone 背後の paint 負荷削減 = 揺れ部分減効果)
- **clone の border-radius を hardcode 24px → var(--lightbox-media-radius) (= 20px)** (= 過去 7bb0529 で取りこぼされた移行を完成)
- **X ツイートの OGP title boilerplate (「Xユーザーの 〜 さん:「本文」 / X」) を strip** (= cleanTitle 共通化、 board + Lightbox 両方適用)
- **Tweet text-only 判定を meta.hasPhoto / hasVideo flag ベース に変更** (= photoUrl に profile pic 混入する誤判定を回避)
- **Bug B 震えは modifier 削除 = session 31 軽量 fix 状態** (= 「smooth float 微震え」 残、 user 「気になる」)

## セッション 32 の主な失敗 (= 次セッションで繰り返さない教訓)

- **大きい変更を user 相談なしに進めた** (= ResizeObserver scaler / clone をそのまま `.media` 化 等、 user 「怖い」 と)
  - 教訓: memory `feedback_consult_before_big_changes` 参照
- **想像で修正を進めた** (= clone の borderRadius=24px は session 31 から残ってたのに、 私が「session 31 で 24→20 にした」 と誤った推測で説明)
  - 教訓: 必ず git log / コード で事実確認してから報告
- **動かない実装を続けて deploy** (= ResizeObserver scale wrapper / clone 案 が user 環境で何度も壊れた、 最後に「専用 component を新規」 で安定)

## セッション 33 でやりたいこと

### 必須 (= 残課題)

1. **Bug B 震えの「別の原因」 仮説調査** (= user 仮説: 「ブラーや計算重さが原因」)
   - 既に削除済 blur: backdrop / navChevron / embedOpenBadge / tweetWatchOnXBadge
   - 残候補: scroll position 計算、 react re-render、 transform matrix、 等
   - 平易な言葉で user と一緒に推測 + 検証

2. **(必要なら) 開閉アニメ廃止** (= user 「ピクセル固定」 が文字通りなら、 開閉 morph 自体を廃止して即 hand-off + fade に変える Option B)
   - これは大変更なので必ず user 相談してから

### 残りのバグ (TODO.md 既存)

- B-#3 重複 URL バグ、 B-#7 サイジング縮小 clipping、 B-#8 PiP click scroll 中央寄せ、 B-#12 拡大時 viewport overflow 破綻、 B-#10 モバイル UX、 B-#13 TopHeader brushup

### foundation 3 本柱 (= 元々セッション 32 で着手予定だった)

- サイジング汎用化 (Phase 2-6)、 広告 placement 予約 slot、 manual tag schema
- Lightbox 揺れが decided されてから着手で OK

## 月末リマインダー (= 2026-05-31)

**`allmarks.app` ドメイン取得確認**。 セッション開始時に user に確認を促す。

## セッション 33 開始時の進め方

1. user の最初の発言を待つ (= 揺れ確認結果 / 別 issue / 別方向 等)
2. もし揺れ確認 → user と一緒に「重い計算がどこにあるか」 を平易に推測
3. **大きい変更前は必ず方針確認** (= memory `feedback_consult_before_big_changes`)
4. 事実確認なしに「想像で」 修正しない (= memory `feedback_fact_based`)
