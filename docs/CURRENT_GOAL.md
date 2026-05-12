# 次セッションのゴール (= セッション 19)

> このファイルは Claude が維持する。 セッション開始時に Claude が読み、 ユーザーに「これで進めますか」 と 1 行確認。

---

## ゴール候補

セッション 18 で I-07-#1 (save 時 backfill 検証) + I-07-#2 (hover クロスフェード + brightness lift) を実装・deploy 完了。 次の優先度:

**C. I-07-#5 Lightbox テキストパネル mask-reveal-up アニメ** (Phase A 忠実コピー方針、 推奨)
- Lightbox 右側のテキストパネルが open 時に下から上にスライドして reveal
- destefanis 本家が同じ演出をしているか **要事前確認** (Phase A 忠実コピー優先)
- 実装場所: `components/board/Lightbox.tsx` (textRef 周り)
- 規模感: 100-150 行 (GSAP + CSS) + 視覚承認 gate
- destefanis 側に同等の演出があるか確認してから設計に入る

**D. B-#1/#2/#3 サムネ系** (実用バグ、 ユーザー報告残)
- B-#1 サムネ取得失敗時の空白カード → fallback で読めるカード
- B-#2 サムネ再取得ボタン → 右クリック / hover アクションで再取得
- B-#3 重複 URL でサムネ出ない問題 → 重複表示挙動修正

**E. AllMarks sizing 哲学移行 Phase 2-6** (`docs/specs/2026-05-12-sizing-migration-spec.md`)
- 既存 rem ベース text を px 化、 UI 要素を clamp + vw 化

## 推奨

C を提案。 destefanis に同等演出があれば Phase A 忠実コピーとして実装、 無ければ「無し」 (= 現状維持) で完了扱い。 セッション 18 の hover swap polish と並んで Lightbox 系の最後のミクロな polish になる。 destefanis 本家を一度確認するだけで方針確定するので、 セッション開始時に最初に確認。

## 前提・注意

- 本番状態: master HEAD に hover swap polish 反映済、 `https://booklage.pages.dev` v13 build
- IDB v13、 schema bump はもう不要
- C は視覚演出なので Claude 単独で完成判断しない。 GSAP timeline の curve / duration は実機 screenshot をユーザーに見せて承認 gate
- ローカル dev で hover 系の確認したい場合は IDB に test data 不在 → 本番で確認推奨 (セッション 18 学び)

## 完了したら

1. TODO.md §I-07 Phase 1 から該当 entry を消す
2. TODO_COMPLETED.md に narrative 追記
3. CURRENT_GOAL.md を次のタスクで上書き
