# 次セッションのゴール (= セッション 22)

## ゴール
destefanis 方式 Lightbox refactor の **spec 起こし** + 残課題 (B-#3 重複 URL bug 等) のどちらを優先するか合意。 必要なら refactor 着手。

## やること
1. **destefanis 方式リファクタ spec 作成** — `docs/specs/2026-05-14-lightbox-clone-refactor.md` に書く
   - 核心: `lightboxClone = sourceCard.cloneNode(true)` を body に append、 width/height + translate3d で animate
   - カバー範囲: open / close / Lightbox 内 nav (wheel scroll で隣カード) の 3 経路
   - 保持必須: ボードカードのリッチ機能 (mediaSlots ホバー切替、 将来の動画同時再生)
   - 課題点: ツイート / 動画 / TikTok card の特殊 .media 表現と clone 後の swap タイミング、 ホバー cross-fade 中のクリックでクローンが微妙な状態を焼き付ける可能性
   - 工数見積 4-6h、 別 spec → 専用セッションで取り組み
2. **B-#3 重複 URL でサムネ出ない** — 真因調査 + 修正
3. (任意) Task 12 全件再 check 設定 UI / MinimalCard polish

## 前提
- master HEAD: `3f2115c` = セッション 21 close anim revert 済の安定状態
- 本番 `booklage.pages.dev` deploy 済、 close 動き正常 (ただし角丸 AA 差はわずかに残存)
- 全 484 vitest + tsc + build clean
- destefanis 本家 (`https://github.com/destefanis/twitter-bookmarks-grid` app.js L270-459) は調査済、 source は `C:/Users/masay/AppData/Local/Temp/destefanis-app.js` にも保存済
- ユーザーから「ボードのリッチ機能維持 + Lightbox animation 最高品質」 の方針確定済
