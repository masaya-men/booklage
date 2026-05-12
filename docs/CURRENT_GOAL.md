# 次セッションのゴール (= セッション 20)

> このファイルは Claude が維持する。 セッション開始時に Claude が読み、 ユーザーに「これで進めますか」 と 1 行確認。

---

## ゴール候補

セッション 19 で I-07-#5 (Lightbox text reveal) 実装 + 3 polish iterations を完了 deploy 済。 I-07 系の Phase 1 改善はこれで全部消化。 次の優先度:

**A. B-#1/#2/#3 サムネ系** (実用バグ、 推奨)
- **B-#1 サムネ取得失敗時の空白カード** — 最新サイト等でサムネ取れず文字も出ない空白箱になる。 fallback (ドメイン名 / favicon 大きく / siteName のみ) で「読めるカード」 に改善
- **B-#2 サムネ再取得ボタン** — 各カードに右クリックメニュー or hover アクションで再取得を提供
- **B-#3 重複 URL でサムネ等が出ない問題** — 同 URL 重複追加時の表示挙動を確認・修正
- 規模: 3 個まとめても 1 セッションで完結する範囲、 ただし B-#1 が一番影響大 (= 普段から出会う UX 破綻)
- 実装場所予想: `components/board/cards/*.tsx`, `lib/scraper/`, `lib/storage/`

**B. AllMarks sizing 哲学移行 Phase 2-6** (`docs/specs/2026-05-12-sizing-migration-spec.md`)
- 既存 rem ベース text を px 化、 UI 要素を clamp + vw 化
- 段階的に Phase 2 から進める。 各 Phase はサイズ計算ファイル整理 + 適用箇所変更で 1 セッション弱
- ユーザー視覚への影響は小さく、 内部整備系

**C. B-#7 自由サイジング 縮小時の clipping** (UX 改善案件、 保留中)
- セッション 13 調査済、 root cause = skyline masonry の bin-packing リフロー
- 代替案 (a)-(d) は memory `project_pip_size_decision.md` 周辺で評価済、 まだ未決
- 触る前に「どの案で行くか」 を user と合意する必要あり

## 推奨

**A (B-#1/#2/#3 サムネ系)** を推奨。 理由:

1. **ユーザーが普段触る UX 破綻** = 価値高い (Phase A 大筋完成後、 「実際に使えるアプリ」 にしていく段階)
2. **3 個まとめても 1 セッション完結圏内** (各々はそれほど大きくない)
3. **次のリブランド (AllMarks 取得待ち) までの間にサイズ系構造改修より使用感改善が優先**

B-#1 から着手すれば B-#2 / B-#3 の DOM / data path 把握も自然にできるので、 順に B-#1 → B-#2 → B-#3 が無難。 もし「全部やる前に一旦休む」 なら B-#1 だけで切るのも OK。

## 前提・注意

- 本番状態: master HEAD = I-07-#5 deploy 済、 `https://booklage.pages.dev` v13 build
- text reveal は destefanis 準拠 overlap + 16px / 0.6s で確定、 5 つの CSS token で後から数値変更可能
- IDB v13、 schema bump は当面不要
- サムネ系の修正は **読み取り側 (display fallback)** か **取得側 (scraper)** どちらを触るか、 タスク開始時に確認する
- ユーザー希望が変わって C (B-#7) or B (sizing) を選んだ場合も対応可能

## 完了したら

1. TODO.md §未対応バグ §表示・サムネ系 から該当 entry を削除
2. TODO_COMPLETED.md に narrative 追記
3. CURRENT_GOAL.md を次のタスクで上書き
