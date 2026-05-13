# 次セッションのゴール (= セッション 27)

## ゴール

**board chrome のミニマル化 + 精密化 sprint**。 ユーザー要望 5 項目 + 拡張機能の作り込みを brainstorming で順序決めしてから実装。

## 前提 (セッション 26 で揃った)

- master HEAD: セッション 26 close-out commit (= 角丸 20 + dashboard 永続化 + IDEAS 追記)
- 本番 `booklage.pages.dev` deploy 済
- 角丸 24 → 20 完了 (= 候補 E)、 ユーザー実機 OK
- `docs/private/dashboard.html` (= 永続ダッシュボード) を毎セッション末更新する運用が `.claude/rules/session-workflow.md` §終了時 に明文化済

## 着工前読み込み必須

- `docs/TODO.md` §未対応バグ・改善 (= B-#13 / B-#17-#3 含む active backlog)
- `docs/private/IDEAS.md` 関連セクション:
  - §2026-04-19 お風呂アイデア (= 常時 dashboard + Focus mode + liquid glass overlap、 ヘッダー要否議論)
  - §セッション 23 D (= スライダー数字表記の遊び) + E (= slow slider 根本治療)
  - §テーマ連動オリジナルマウスカーソル (2026-05-13)
- `docs/private/dashboard.html` (= 全景把握、 大画面で眺めて整理)

## ユーザー要望 (= session 26 末で共有された 5 項目)

1. **ScrollMeter 下配置** — Lightbox と同じ位置に統一、 Lightbox open 時は非表示?
2. **TopHeader 自体の要否** — カードに重なっても良い、 視認性低くてもミニマル UI へ
3. **サイズ・ギャップ slider 最適化** — 精密な動きが出来るように (= 根本治療、 setPointerCapture + movementX × ratio) + 今のムードボードデザインへ馴染ませる
4. **左下 Booklage pin (ブックマーレット導線) 見直し** — 常時表示じゃなくムードボード画面では出さない / 出すタイミングを工夫する
5. **カスタムマウスポインタ** — chrome 作り込みの一環として検討

**+ 拡張機能の作り込み** — 既存の Chrome 拡張 (= ブックマークレット併存)。 ④ と紐付くので brainstorming で同時扱い。

## 着工手順 (= session 27 最初)

1. **brainstorming session を最初に走らせる** (= superpowers:brainstorming スキル使用、 5 項目 + 拡張機能の優先順位 + 各項目の方向性確定)
2. 確定方向を `docs/superpowers/specs/2026-05-XX-board-chrome-minimal.md` (or 類似名) に spec 化
3. spec 確定後、 着手項目を順次実装

## 推奨優先順位 (= 着工前の暫定、 brainstorming で確定)

- **A. ScrollMeter 下配置** (= ① + ② の半分) — Lightbox と同じ視覚言語に揃える、 chrome の方向性が一気に固まる
- **B. TopHeader ミニマル化** (= ②) — A 完了後に「ヘッダー何が残る必要があるか」 を決める
- **C. Slider 根本治療** (= ③) — A/B 確定後、 chrome デザインに馴染ませた slider を再設計
- **D. ブックマーレット pin 導線見直し + 拡張機能 polish** (= ④ + 拡張) — chrome 全体方針確定後、 「ブクマ追加導線」 として最適化
- **E. カスタムマウスポインタ** (= ⑤) — 最後の polish、 テーマ機能と連動するなら別 sprint に切り出す判断もあり

## 着工 NG 条件 (= ユーザー判断で外したもの)

- backdrop blur / Motion One spring の polish (= session 25 で外した)
- 動画 dot 候補から別形を試す (= 採用済「丸の中三角切り抜き」 で確定)
- 候補 A 背景タイポ variant 実装 (= session 26 で扱わず、 27 もデザイン chrome を優先するため後回し)
- 候補 D Lightbox nav ちらつき修正 (= 同上、 後回し)

## 並行 backlog (= 触らない)

- リブランド (= AllMarks ドメイン取得後、 月末 2026-05-31 リマインダー)
- サイズ設計 Phase 2-6
- B-#7 自由サイジング縮小 clipping (= 体感バグ、 後日)
