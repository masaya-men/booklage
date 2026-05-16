# 次セッションのゴール (= セッション 34)

## ゴール

**テキストカード周りを完全な状態にする sprint** の **残 3 項目 (= Item 2-4)** を順に。 セッション 33 で Item 1 (= 矢印 + Hit Zone リデザイン) は本番反映 OK。 次はテキストカード本体の構造再設計。

## 残 3 項目 (= user 起点、 セッション 33 の冒頭で確定)

### Item 2: テキストのみカードの基本サイズ固定 + 構造シンプル化

- **対象**: webpage (OGP image 取得不可) + tweet (テキストのみ)
- **方針**: 現在は board の `TextCard` と Lightbox 専用の `LightboxTextDisplay` で **2 つ別実装**。 これを **1 つの共通カード**に統合する方向で user 合意済 (= 「基本カードサイズを決めてしまって、 それをそのままカードとして扱う」)
- 既存ファイル: `lib/embed/text-card-color.ts` (= white / black 色振り分け、 user IDE で session 33 開始時開いていた)、 `components/board/cards/TextCard.tsx`、 `components/board/Lightbox.tsx` の `LightboxTextDisplay`

### Item 3: board のツイート文のみカードを black / white ランダム化

- **対象**: 文のみツイート (= `hasPhoto: false && hasVideo: false`) を board に出した時のカード
- **方針**: 既存の `pickTextCardColor(cardId)` (= djb2 hash で white / black 2 variant deterministic に振り分け) を **tweet 経路にも適用**、 webpage TextCard と統一
- 関連: board 側で tweet 文のみカード描画する箇所を grep して特定 → 同じ 2 色振り分けを適用

### Item 4: テキストのみカードを Lightbox にそのまま (= 同じカード) 移動 + 右エリアに元ページ遷移 / アカウント情報

- **方針**: Item 2 で統合した共通テキストカードを Lightbox の左側にもそのまま表示 (= 「写真のように board card を拡大」 ではなく、 既存のテキストカード視覚をそのまま使う)。 右エリア (`.text`) には:
  - 元ページを開くボタン
  - アカウント情報 (= tweet なら author handle / name、 webpage ならドメイン)
- 既存の `LargeBoardCardClone` / `LargeTextCardScaler` / `LightboxTextDisplay` の 3 経路を整理 (= 廃止 or 統合)

## 月末リマインダー (= 2026-05-31 約 2 週間後)

**`allmarks.app` ドメイン取得確認**。 Cloudflare Dashboard → Domain Registration → 約 ¥1,600/年。 取得後は新 Pages project → 301 redirect → GitHub repo rename → 拡張ストア submit。

## 開始時の動き

1. user の最初の発言を待つ (= 揺れ確認 / Item 2 直行 / 別方向)
2. Item 2 から進めるなら、 まず **現在の TextCard と LightboxTextDisplay の構造比較** + **「基本サイズ」 値の合意** から
3. 大きい変更 (= 共通カード化、 component 統合、 100 行 + refactor) は必ず方針相談 (= memory `feedback_consult_before_big_changes`)
4. 想像で進めない、 事実確認 (= memory `feedback_fact_based`)
5. 4 項目は順番に (= memory user は混乱しやすい、 1 つずつ完成させる方針)

## セッション 33 で得た教訓

- z-index レイヤー方式は数値座標方式より圧倒的にシンプル (= user 提案で複雑度激減)
- Visual Companion で画面スクショ + overlay は強力 (= base64 埋め込みで 5MB HTML、 bash concat で生成)
- backdrop / stage の position: fixed 化は副作用小 (= clone host が canvasWrap 内のままで rect 計算は viewport ベースなので問題なし)

## セッション 33 で残った残課題 (= Item 2-4 完了後に再着手)

- **Bug B 震えの「別の原因」 仮説調査** (= blur 以外の重い計算が原因仮説)
- **必要なら 開閉アニメ自体の見直し** (= Option B = fade のみ、 大変更要相談)
- **foundation 3 本柱** (= サイジング汎用化 / tag schema / 広告 slot)

## Visual Companion 副産物 (= 整理候補)

`.superpowers/brainstorm/6093-1778926800/content/` に 5.2MB × 4 個 ≈ 20MB の HTML 残存 + PNG 1 枚 (`サンプル用画像.png` / `lightbox.png`)。 gitignored だが ローカルディスク使用。 開始時に `rm -rf` してよい。
