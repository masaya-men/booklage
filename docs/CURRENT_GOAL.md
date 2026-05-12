# 次セッションのゴール (= セッション 18)

> このファイルは Claude が維持する。 セッション開始時に Claude が読み、 ユーザーに「これで進めますか」 と 1 行確認。

---

## ゴール候補 (ユーザーが選ぶ、 または Claude から提案)

セッション 17 で動画 tweet FLIP + ▶ dot 統一 + 作業習慣 brushup までやり切った。 動画 tweet 系の不具合は全部解消。 次の優先度は以下から選ぶ:

**A. I-07-#1 save 時 backfill** (UX 改善大、 効果見えやすい)
- 新規 X tweet 保存時に syndication API を 1 回叩いて mediaSlots を IDB に書き込む
- 結果: 初回ボード mount 時に既存ブクマも含めて hover swap / ▶ dot が即出る
- 現状は Lightbox 開かないと mediaSlots backfill されない
- 実装場所: `app/save-iframe/SaveIframeClient.tsx` の save 直後、 fire-and-forget で fetchTweetMeta + persistMediaSlots

**B. I-07-#2 hover 切替演出のリッチ化** (デザイン polish)
- 板上カードを hover してマウス位置で画像切替するときの演出を強化
- 候補: cross-fade / blur transition / zoom-pan-pan / GSAP micro animation timeline
- 現状は単純 src swap で味気ない
- 実装場所: `components/board/cards/ImageCard.tsx`

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
- ノート PC〜ウルトラワイドまで pixel-perfect 同じ密度で届ける

## 推奨

A を提案。 理由: ユーザー実機で「現状ボード再 mount しないと dot 出ない」 → 「保存直後から見える」 へ大きな UX 改善になる、 実装も 50 行程度で小さい、 schema 変更なしで安全。

## 前提・注意

- 本番状態: master HEAD に動画 tweet FLIP 修正 + 縦動画 aspect 修正 + ▶ dot 統一が反映済
- IDB v13、 schema bump はもう不要 (mediaSlots は v13 に追加済)
- 次回 schema bump 系は `feedback_irreversible_pause` + `project_idb_irreversibility` のトリガーに従う
- ローカル dev 検証必須 (`pnpm dev` + Playwright) → 本番 deploy の順序を厳守

## 完了したら

1. TODO.md §未対応バグ から該当 entry を消す
2. TODO_COMPLETED.md に narrative 追記
3. CURRENT_GOAL.md を次のタスクで上書き
