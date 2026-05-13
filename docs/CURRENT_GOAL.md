# 次セッションのゴール (= セッション 25)

## ゴール
**B-#17 関連の最後の残課題を仕上げて、 Lightbox 周りを完全に「これで終わり」 にする**。
具体候補:
- **A**: B-#17-#3 internal nav (= Lightbox 内 wheel scroll / chevron で隣カード切替) を clone-based に移行
- **B**: 角丸 24 → 20 視覚比較 (= 短時間タスク、 「もう少し控えめ」 にするかの最終判断)
- **C**: B-#17 残課題ではない別 backlog に進む (= TopHeader brushup / レスポンシブ / PiP scroll 見切れ等)

## 前提 (セッション 24 で揃った)
- master HEAD: セッション 24 末 (= 動画カード aspect 統一 + backdrop blur 削除 + close-out)
- 本番 `booklage.pages.dev` deploy 済 (`4156d88d`)
- B-#17 open/close/動画/揺れ の体感は完成、 ユーザー満足 (= 「とてもよくなりました!!」)
- 残るのは internal nav (= wheel scroll 隣カード) と細かい brushup

## やること候補別 詳細

### A. B-#17-#3 internal nav の clone-based 移行
- 現状: Lightbox 内で wheel scroll / chevron / arrow key で隣カードに移ると、 既存 transform:scale + opacity ロジックで「3D physical slide」 が走る (= Lightbox.tsx L857 以降の `useLayoutEffect` で実装)
- 課題: 動作確認まだ、 体感も検証されていない (= セッション 23 では open/close のみ clone-based 化、 nav は触らず)
- 移行する場合の方針: open/close と同じ clone-based pattern を適用 — 旧 frame snapshot を残しつつ、 新 frame を clone-based で grow
- 工数: 2-3h 級 (= clone host を流用、 既存 3D slide の代替 or 共存)
- ただし「動作してるなら触らない」 選択もアリ — open/close で十分体感満足してるなら nav は brushup ではなく後回しでも問題なし

### B. 角丸 24 → 20 視覚比較
- 現状: `--card-radius: 24px` / `--lightbox-media-radius: 24px` 統一 (セッション 22 で確定)
- セッション 23 末の plan で「B-#17 落ち着いたら視覚比較」 と置き残し
- 試し方: `--card-radius: 20px` で 1 commit + deploy → ユーザー視覚確認 → 採用 or 戻す
- 工数: 30 min (= 変更 1 行 + deploy + 視覚判定)

### C. 別 backlog の選択肢
- **B-#7 自由サイジング 縮小時の clipping ポイント** — root cause 既調査済、 案 a/b/c/d から選んで実装
- **B-#10 モバイル UX 本格チューニング** (ユーザー希望で最後に回す方針)
- **B-#13 TopHeader brushup** — ScrollMeter 下配置への移行検討
- **B-#3 重複 URL サムネ問題** — セッション 20 で真因未調査
- **MinimalCard polish** — 64px favicon が S サイズで大きい可能性
- **Task 12 全件再 check 設定 UI** — 設定パネル自体が未実装

## 着工 NG 条件
- ユーザーが次セッションで何を進めたいか未確認のうちは選択肢 A-C のうち 1 つに着工しない (= まず方向性合意)

## このセッションで触らない backlog
- リブランド (= AllMarks ドメイン取得後に一気に。 月末リマインダーは TODO.md 冒頭)
- サイズ設計 Phase 2-6 (= 別 spec)
- 新機能アイデア (= IDEAS.md)
