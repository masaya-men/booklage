# 次セッションのゴール (= セッション 19)

> このファイルは Claude が維持する。 セッション開始時に Claude が読み、 ユーザーに「これで進めますか」 と 1 行確認。

---

## ゴール候補

セッション 18 で I-07-#1 (save 時 backfill) は実装済 + 動作裏付けテスト追加で完了。 次の優先度:

**B. I-07-#2 hover 切替演出のリッチ化** (デザイン polish、 推奨)
- 板上カードを hover してマウス位置で画像切替するときの演出を強化
- 候補: cross-fade / blur transition / zoom-pan / GSAP micro animation timeline
- 現状は単純 src swap で味気ない
- 実装場所: `components/board/cards/ImageCard.tsx`
- 規模感: 100-200 行 (CSS + JS) + 視覚承認 gate

**C. I-07-#5 Lightbox テキストパネル mask-reveal-up アニメ** (Phase A 忠実コピー方針)
- Lightbox 右側のテキストパネルが open 時に下から上にスライドして reveal
- destefanis 本家が同じ演出をしているか要確認 (Phase A 忠実コピー優先)
- 実装場所: `components/board/Lightbox.tsx` (textRef 周り)

**D. B-#1/#2/#3 サムネ系** (実用バグ、 ユーザー報告残)
- B-#1 サムネ取得失敗時の空白カード → fallback で読めるカード
- B-#2 サムネ再取得ボタン → 右クリック / hover アクションで再取得
- B-#3 重複 URL でサムネ出ない問題 → 重複表示挙動修正

**E. AllMarks sizing 哲学移行 Phase 2-6** (`docs/specs/2026-05-12-sizing-migration-spec.md`)
- 既存 rem ベース text を px 化、 UI 要素を clamp + vw 化

## 推奨

B を提案。 理由: ユーザーが日常的に体感する hover 切替の質感が上がる、 視覚演出は Phase A 忠実コピー路線とも整合 (destefanis 系の micro animation polish 寄り)、 schema 変更なしで安全。

## 前提・注意

- 本番状態: master HEAD に save 時 backfill 検証テスト追加 (production code 変更なし)
- IDB v13、 schema bump はもう不要
- B は視覚演出なので Claude 単独で完成判断しない。 数値・カーブ調整は実機 screenshot をユーザーに見せて承認 gate (.claude/rules/ui-design.md)
- ローカル dev 検証必須 (`pnpm dev` + Playwright) → 本番 deploy の順序を厳守

## 完了したら

1. TODO.md §I-07 Phase 1 から該当 entry を消す
2. TODO_COMPLETED.md に narrative 追記
3. CURRENT_GOAL.md を次のタスクで上書き
