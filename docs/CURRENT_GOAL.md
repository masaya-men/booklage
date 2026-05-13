# 次セッションのゴール (= セッション 26)

## ゴール

**ユーザー判断で 1 つ選ぶ**。 セッション 25 で大物 (= dot + 背景タイポ + Lightbox clone 構造根治) 完了、 次は中規模 polish / 新機能 / バグ修正のどれかから 1 つ。

## 前提 (セッション 25 で揃った)

- master HEAD: セッション 25 close-out (= dot 三角切り抜き + 背景タイポ + Lightbox 3 層構造 = backdrop dim + clone + stage)
- 本番 `booklage.pages.dev` deploy 済 (`0ed947f5` 系)
- destefanis 本家との残差 (= backdrop blur 無し + Motion One spring 無し) は polish しない確定、 spec から外す

## 着工前読み込み必須

- `docs/TODO.md` の §現在の状態 + §未対応バグ・改善 (active backlog)
- `docs/private/IDEAS.md` の関連セクション (= ユーザーの選択肢に応じて)

## 候補 (= ユーザーが選ぶ)

### A. 背景タイポの animation variant 1 つ実装 (= polish 系、 ワクワク)
- IDEAS.md §H 「動く街並みテーマ (車テーマ)」 の隣に、 dvd-bounce / glitch / multi / marquee / card-wind の 5 候補既記載
- `BoardBackgroundTypography.tsx` の `variant` prop と CSS の `data-variant=...` selector slot に実装入れるだけ、 URL query `?bgtypo=<variant>` で即試せる
- 推奨: **dvd-bounce** か **glitch** から、 雰囲気を見ながら 1 つずつ
- 工数: ~1h × 1 variant

### B. B-#7 自由サイジング縮小時の clipping 修正 (= 体感バグ、 既存 backlog)
- セッション 13 で root cause 特定済 (= skyline masonry が discrete に reflow burst)
- 案 (a) リサイズ中固定 / (b) FLIP tween 再チューニング / (c) skyline ヒステリシス / (d) 受容
- ユーザー希望: 周囲「ぬるっと」 維持 = 案 a (固定) は最終手段
- 工数: 中 (調査含めて 2-3h)

### C. テーマ機能の最初の 1 つ実装 (= 大物、 アプリの一段ステップアップ)
- 現状テーマは default のみ、 テーマ切替 UI も無し
- 最初の 1 つは: **動く街並みテーマ (車テーマ)** (= IDEAS.md 2026-05-14 ユーザー発案) or **SF 軍事スタイル** (= IDEAS.md 2026-05-06) or **Glass theme** (= 既存 LiquidGlass spec)
- テーマ切替 UI から作るか、 default に上書きで proof of concept か
- 工数: 大 (= 1 セッションでは収まらない、 まず brainstorming + spec)

### D. B-#17-#3 Lightbox 内 nav 切替アニメちらつき修正 (= 体感バグ、 既存 backlog)
- open/close は B-#17 で clone-based に移行済、 ただし wheel scroll で隣カード切替するときの **既存 transform:scale ロジック**にちらつきが残る
- 「アニメ本体は気に入っているのでちらつきだけ修正したい」 (= ユーザー)
- 工数: 中 (~1h)

### E. 角丸 24 → 20 検討 (= 視覚 polish、 短時間)
- 全カード border-radius を 24px → 20px に変えて視覚比較
- B-#17 落ち着いた現時点でやって良い
- 工数: 小 (~30 min)

## 推奨

私の推奨は **A の dvd-bounce** (= 背景タイポを楽しく遊べる variant 1 つ追加、 ユーザーが具体イメージ言ってくれた中で最も実装が手軽 + 楽しい)。 ただ「**ワクワク 1 つ + 体感バグ 1 つ**」 の組合せで A + D (= 30 min variant 追加 + 1h ちらつき修正) も可。

## 着工 NG 条件

- backdrop blur / Motion One spring の polish に着手しない (= ユーザー判断で外した)
- 動画 dot 候補 A-G から別形を試さない (= 採用済「丸の中三角切り抜き」 で確定)

## 並行 backlog (= 触らない)

- リブランド (= AllMarks ドメイン取得後、 月末 2026-05-31 リマインダー)
- サイズ設計 Phase 2-6
