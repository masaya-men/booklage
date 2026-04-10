# Booklage 開発ToDo

> 完了済みタスクは [TODO_COMPLETED.md](./TODO_COMPLETED.md) に移動済み

---

## 現在の状態（次セッションはここから読む）

- **ブランチ**: master
- **注意**: mainブランチが空のまま。masterで開発中
- **進捗**: MVP Week 1 全18タスク完了（2026-04-10）
- **確認済み**: アーキテクチャ検証完了。サーバー費¥0・Worker依存最小化の方針確定

### 次にやること（最優先）
1. **仕様書の修正**（MYCOLLAGE_FULL_SPEC.md + CLAUDE.md）
   - R2スナップショット共有 → URL圧縮エンコード方式に変更
   - 技術スタックからR2・KV削除、Workersを「任意」に変更
   - コスト表を¥0固定に修正
   - アーキテクチャ図からR2・KV削除
   - 不要になるファイル（api/share/route.ts, lib/storage/share.ts, [id]/page.tsx）の削除
2. Week 2 計画策定（brainstormingスキルで練る）
3. LP + デザイン磨き → デプロイ準備

---

## 確定した設計方針（2026-04-10 確認）

- サーバー費¥0（Cloudflare Pages無料枠のみ）
- ユーザーデータ一切非保持（IndexedDBのみ）
- ブックマークレットが主導線（Worker不要でOGP取得）
- URLペーストはフォールバック（Worker失敗時はURLのみでカード作成）
- 画像は外部サイトから直接表示（端末保存不要）
- PNG書き出し: 大半のサイトで問題なし（CORS非対応サイトは一部画像が抜ける程度）

## バグ・不具合（要修正）

（なし）

## 未着手（次にやること）

- [ ] Week 2 計画策定
- [ ] ブックマークレットUI実装（SavePopup — 仕様書の主導線）
- [ ] LPページ（多言語対応）
- [ ] デザイン磨き（超モダン・コラージュ感）
- [ ] Privacy, Terms, FAQ, About, Contact
- [ ] Cloudflare Pagesデプロイ

## 未着手（将来）

- [ ] 残り13言語のi18n対応
- [ ] Remotionプロモ動画
- [ ] OGP画像生成（Satori）
- [ ] PiPドロップゾーン（v1.2）
- [ ] Web Share Target（PWA共有）

## アイデア・やりたいこと

（思いつきを即メモする場所）
