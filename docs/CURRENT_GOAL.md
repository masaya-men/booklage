# 次セッションのゴール (= セッション 38)

## ゴール

**user 選択**。 session 37 でツイート Lightbox 3 連 bug は完全決着 + prod 反映済、 次は user の vision (= multi-playback) に向かう本筋か、 残課題消化かを user に選んでもらう。

## 開始時の動き

1. user と挨拶 + session 37 close-out 状況確認 (= booklage.pages.dev で動画 tweet 再生 / テキスト tweet 表示 が直っているかハードリロードで実機確認してもらう)
2. 次タスク 4 候補を提示して user に選んでもらう:

### 候補 A (= 本筋推奨): multi-playback vision — board card autoplay 着手

Fix 2, 3 で `BoardItem.mediaSlots` に動画 url が入るようになった。 次は board の動画カード上で **video autoplay loop muted** 再生する render layer を作る。 user の核心 vision「板の上で動画が再生され続ける」 に向かう本筋。 後続に「複数選択 + 同時再生 UI」 が控える大き目タスク。

### 候補 B (= 持ち越し): テキストカード Lightbox 構造再設計

session 36 で持ち越した「テキストのみカードの構造再設計 / Lightbox 右エリア整理」 (= 旧 TODO Item 2 / 4)。 視覚比較しながら整える系。

### 候補 C (= 短時間): B-#3 重複 URL でサムネ等が出ない

未調査 bug。 真因調査 → fix。 1 セッションで終わる規模感。

### 候補 D (= 視覚調整): B-#13 TopHeader brushup (ScrollMeter 下配置)

memory `project_board_header_brushup.md` 参照。 Lightbox の表現と統一する方向。

## 月末リマインダー (= 2026-05-31 約 2 週間後)

`allmarks.app` ドメイン取得確認。

## 引き継ぎ resources

- [docs/TODO_COMPLETED.md](docs/TODO_COMPLETED.md) セッション 37 セクション — 3 連 fix 詳細 + 学び
- [docs/TODO.md](docs/TODO.md) — 現状一覧 + 候補 backlog
- memory [project_allmarks_vision_multiplayback.md](C:/Users/masay/.claude/projects/c--Users-masay-Desktop--------/memory/project_allmarks_vision_multiplayback.md) — core vision、 候補 A 着手時に必読
