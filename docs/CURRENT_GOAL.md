# 次セッションのゴール (= セッション 39)

## ゴール

**ScrollMeter ガチャガチャ動く問題を解決する** (= B-#20)。 user 仮説 (= Lightbox 時も場所一緒 + クロスフェード) をベースに、 他 chrome と干渉しないかチェックしながら実装。

## 開始時の動き

1. user と挨拶 + session 38 close-out 確認 (= booklage.pages.dev で「閉じる時 X がぽんと出る」 が消えてるかハードリロード確認)
2. ScrollMeter の現状実装場所を読む (= Grep / Read):
   - 板での描画位置・state
   - Lightbox 開閉時の表示遷移ロジック
   - 他 chrome (Lightbox header, 矢印 nav, close button, backdrop) との z-index / 位置関係
3. user 仮説の検証 + 干渉チェック結果を提示
4. 設計合意 → 実装 → tsc + vitest → prod deploy → user 確認

## 月末リマインダー (= 2026-05-31 約 2 週間後)

`allmarks.app` ドメイン取得確認。

## 引き継ぎ resources

- [docs/TODO.md](docs/TODO.md) §B-#20 — 仕様メモ
- [docs/TODO_COMPLETED.md](docs/TODO_COMPLETED.md) セッション 38 セクション — close jump 解消 narrative
- memory `project_board_header_brushup.md` — TopHeader 配置の brushup 方針

## 余裕があれば backlog

- multi-playback vision (board card autoplay)
- テキストカード Lightbox 構造再設計
- B-#3 重複 URL サムネ問題
- B-#13 TopHeader brushup 全体 (ScrollMeter 下配置含む)
