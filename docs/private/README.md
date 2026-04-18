# docs/private/ — センシティブ情報専用

> このディレクトリ配下は **README.md を除き git-ignored**。GitHub に一切上がりません。

## ここに置くもの

- 収益計画・価格戦略・ローンチ戦略
- 個人情報（メアド、電話番号、住所、契約情報）
- 競合分析（手の内を見せたくないもの）
- ベンダー・契約情報
- Paid サービスの認証情報メモ（実際の鍵は `.env.local` 系）
- どう扱うか迷ったもの全て（とりあえずここ）

## ここに置かないもの

- 公開 OK な設計ドキュメント → `docs/` 直下
- 技術的な TODO → `docs/TODO.md`
- プロダクトアイデア・機能仕様 → `docs/REBUILD_VISION.md` 等

## 安全装置（多層防御）

1. このディレクトリ全体が `.gitignore` 済み（この README のみ追跡）
2. `.husky/pre-commit` で gitleaks が API キー系を検知
3. `.husky/pre-commit` でカスタム検知（メアド・戦略キーワード）
4. GitHub Secret Scanning + Push Protection（サーバー側最終防衛）
5. CLAUDE.md の絶対ルールで「迷ったら private/ 優先」

## 迷ったら

public で良いか 100% 確信できないものは、**必ずここに置く**。後で public 判定なら移動すればいい。逆は GitHub 履歴から消すのが面倒。
