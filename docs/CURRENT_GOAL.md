# 次セッションのゴール (= セッション 21)

## ゴール
セッション 20 で実装したカード健全性機構を本番環境で検証 + B-#3 重複 URL bug + Task 12 全件再 check UI 着手。

## やること
1. **セッション 20 を本番反映** — `pnpm build` + `wrangler pages deploy out/ --branch=master --commit-dirty=true` で deploy。 IDB v14 upgrade を本番で実機確認 (ハードリロードで `booklage.pages.dev`)
2. 4 URL bug の本番動作確認 — labs.noomoagency / pitperform = 正常 thumbnail、 Instagram / CodePen = MinimalCard 表示、 Lightbox close 後 wheel で隣カード遷移しない
3. **B-#3 重複 URL でサムネ出ない** — 真因調査 + 修正。 同 URL を 2 回追加した時の挙動確認
4. (任意) **Task 12: 全件再 check 設定 UI** — 設定パネル自体が未実装、 別 spec 起こす形でも可
5. Visual Companion で MinimalCard polish — 64px favicon が S サイズで大きい等の最終調整

## 前提
- master HEAD: `3b83b43` (= Task 1-11 完了 + IDB v14 + filter+gone visual)
- 全 484 vitest + tsc + build clean
- **IDB schema v14** は localで完全テスト済だが本番 deploy 後は不可逆 — deploy 後の rollback 手段なし
