# 次セッションのゴール (= セッション 25)

## ゴール
**動画ドット indicator の再デザイン** (= mediaSlots 内の動画 dot は現在「▶ 三角」、 ミニマル感が弱いと過去にユーザー発案)。 IDEAS.md L1386 の保管済 7 候補 (A-G) から **A / B / C の 3 案を実装して board に並べ、 視覚比較**でベスト 1 案を採用 + 全箇所適用。

## 前提 (セッション 24 で揃った)
- master HEAD: セッション 24 末 (= 動画カード aspect 統一 + open animation 揺れ根治 + close-out)
- 本番 `booklage.pages.dev` deploy 済 (`4156d88d`)
- B-#17 関連の体感問題は全て根治、 board card が滑らかに Lightbox に grow する

## 着工前読み込み必須
- `docs/private/IDEAS.md` L1386-1417 の「動画インジケーターの再デザイン候補 (2026-05-13 セッション 21 発案)」 — 候補 A-G の詳細 + Claude 評価 + 関連ファイルパス
- `components/board/cards/ImageCard.module.css` L88-134 — 現 dot 実装
- Lightbox 側の dot 実装箇所 (= board と shape coding 統一を取る場合は同時更新)

## やること

### Phase 1: 3 案実装 (= 視覚比較用)
過去ブレストの推奨に従い、 **A / B / C** を実装:
- **A 横カプセル (lozenge)** — 4×8 px の横長丸角四角。 動画の 16:9 暗示
- **B 二重丸 (ring)** — 外輪 + 内ドット。 録画ボタン連想
- **C 中抜き丸 (hollow)** — 写真 = 塗、 動画 = 輪郭のみ。 最ミニマル

実装方法:
- 各候補を CSS のみで切替可能にする (= data attribute や class で gate)
- `/triage` のような専用 page は要らない、 board 上で複数枚動画カードを並べた状態で 3 案順に切替できれば OK
- もしくは Visual Companion (= 既存の `/glass-lab` 的な lab page) に並べて見せる選択もアリ

### Phase 2: 視覚比較 → 採用判断
- 3 案実装 + deploy → ユーザーが本番でハードリロードして 1 案選ぶ
- 採用案: A or B or C のいずれか (= もし全部いまいちなら D-G を追加実装の判断)

### Phase 3: 採用案を全箇所適用
- 板書 mediaSlots dot indicator (board card)
- Lightbox 側の同様の dot indicator (= 統一を取る場合)
- 関連 vitest テスト (= dot の DOM 構造変化があれば更新)

## 工数見積
2-3h (= 3 案実装 30-45 min × 3 + 視覚比較 + 採用適用 + テスト)。

## 着工 NG 条件
- IDEAS.md L1386 の candidate を読まずに着手しない (= 候補と評価ゼロから議論し直すのは無駄)
- A/B/C 以外の案を最初から実装に入れない (= まず推奨 3 案で視覚判断、 全部いまいちなら D-G を追加検討)

## 並行 backlog (= このセッション内で着手しない、 終了時の TODO 整理で言及)

### 次の次以降の候補

ワクワク系 (= ユーザー希望):
- **動画同時再生 Phase 1 MVP** — Booklage core 差別化、 magic moment。 ただし規模大、 まず brainstorming セッション 1 本入れて scope 確定が筋良い
- **Triage モード MVP** — マッチングアプリ風 swipe、 IDEAS.md L38 に詳細仕様済
- **配置モード切替 (grid / free)** — IDEAS.md §フォルダごとの配置モード
- **背景タイポグラフィでタグ名表示** — 2026-05-14 新規発案 (= IDEAS.md §H 追加済)、 「すべて」 → AllMarks ロゴ、 「すべて」 rename ブレスト含む
- **テーマ連動オリジナルマウスカーソル** — IDEAS.md L1421 詳細仕様済 (リキッドグラス虫眼鏡デフォルト等)
- **テーマ機能の最初の 1 つ実装** (Glass / SF 軍事 / 3D シーン 等)
- **装飾系** (背景タイポ + 数字表記の遊び + slider 精度 Y 案 + ScrollMeter 下配置)

体感問題:
- **B-#7 自由サイジング縮小時の clipping** (= ユーザー認識: いまだに起きる、 原因不明)
- **B-#17-#3 Lightbox 内 nav 切替アニメのちらつき** (= アニメ本体は気に入っているので維持、 ちらつきだけ修正)

## このセッションで触らない
- リブランド (= AllMarks ドメイン取得後、 月末リマインダーは TODO.md 冒頭)
- サイズ設計 Phase 2-6 (= 別 spec)
