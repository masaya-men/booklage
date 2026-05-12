# 次セッションのゴール

> **このファイルは Claude が維持する**。 ユーザーが書く必要なし。
> セッション終了時に Claude が「次は何をやるか」 を 5〜10 行で残す。
> セッション開始時に Claude が最初にこれを読んで着手する。

---

## 次セッション: 動画 tweet アニメ bug の調査と修正

**ゴール**: 動画を含む X tweet をクリックして Lightbox を開く / 閉じる時、 中央へのスライドアニメが動かない bug を修正する。 写真 tweet では動作している。

**やること**:
1. `pnpm dev` でローカル dev 起動
2. Playwright で動画 tweet クリック → `.media` の `getBoundingClientRect()` を計測 (open useLayoutEffect 時点)
3. 仮説確認: `TweetVideoPlayer` の wrapper が explicit width なし → intrinsic 依存で rect が card と近すぎ → FLIP が無効化
4. 修正案検証: wrapper に `width: 'min(920px, 60vw)'` (= maxWidth と同値) を明示
5. 写真 / 単一動画 / mix / テキスト 4 種で open/close 全部動作確認
6. ▶ dot サイズを ● dot に揃える (Lightbox の `.lightboxImageDot[data-slot-type='video']` の border サイズ縮小)
7. ボードカード上の動画 dot 表現を ▶ に統一 (`ImageCard.module.css` 修正)
8. Playwright 回帰テスト追加: 4 種全てで open/close FLIP rect 計測
9. tsc + vitest 全通過確認 → 1 commit → 本番 deploy

**前提・注意**:
- schema bump はもう済んでいる (v13)、 純粋なコード修正のみ → 不可逆性なし
- 安全 deploy 可、 ただし memory `feedback_irreversible_pause` のとおりリスク 3 つ列挙は実施
- ユーザーは「ローカルで全部検証してから本番」 を強く望んでいる (セッション 17 の教訓)

**完了したら**: TODO.md §未対応バグ から B-#14 (動画 tweet アニメ不発) を消す、 TODO_COMPLETED.md に追記、 CURRENT_GOAL.md を次のタスク (例: I-07-#1 save 時 backfill / B-#7 自由サイジング縮小 etc.) で上書き
