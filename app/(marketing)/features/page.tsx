import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Features',
  description:
    'AllMarks の機能一覧 — ブックマーク保存、ビジュアルコラージュ、メディア埋め込み、プライバシーファースト設計。',
}

export default function FeaturesPage(): React.ReactElement {
  return (
    <>
      <h1>Features</h1>
      <p className="updated">AllMarks でできること</p>

      <h2>1. ブックマーク保存</h2>
      <p>
        ブラウザのブックマークバーに「AllMarks に保存」ブックマークレットを設置するだけで、
        あらゆる Web サイトをワンクリックで保存できます。アカウント登録は不要、
        Google ログインも不要。ブラウザがあれば即始められます。
      </p>
      <ul>
        <li><strong>主要 SNS の自動認識</strong> — X (Twitter)、YouTube、TikTok、Instagram は埋め込みカードに自動変換</li>
        <li><strong>OGP 自動取得</strong> — タイトル・サムネイル・説明文を自動抽出</li>
        <li><strong>一般 Web サイト対応</strong> — ブログ、記事、商品ページ、ポートフォリオ、なんでも保存可能</li>
      </ul>

      <h2>2. ビジュアルコラージュ</h2>
      <p>
        保存したブックマークは、ボード上で自由にコラージュとして並べられます。
        服飾学生のムードボードのように、ビジュアル中心で眺めて楽しむための設計です。
      </p>
      <ul>
        <li><strong>Masonry レイアウト</strong> — カードの高さに合わせて自動的に隙間なく配置</li>
        <li><strong>カードサイズ切替</strong> — S / M / L の 3 段階でカード単位の大きさを変更</li>
        <li><strong>整列 + 自由配置</strong> — クリックひとつで整列、ドラッグで自由配置に切替</li>
        <li><strong>表示モード切替</strong> — Visual（画像中心）/ Editorial（テキスト中心）/ Native（最小装飾）の 3 モード</li>
        <li><strong>右クリックで削除</strong> — 不要になったカードをすぐに整理</li>
      </ul>

      <h2>3. プライバシーファースト</h2>
      <p>
        AllMarks はあなたのデータを <strong>一切サーバーに保存しません</strong>。
        すべてのブックマークはあなたのブラウザ内（IndexedDB）にのみ存在します。
      </p>
      <ul>
        <li><strong>アカウント登録不要</strong> — メールアドレスもパスワードも要求しません</li>
        <li><strong>クラウド同期なし</strong> — データは外部に送信されません</li>
        <li><strong>完全無料</strong> — 機能制限のないフルアクセス</li>
        <li><strong>オープンソース</strong> — <a href="https://github.com/masaya-men/booklage" target="_blank" rel="noopener noreferrer">GitHub</a> で実装を検証可能</li>
      </ul>

      <h2>4. メディア対応一覧</h2>
      <p>各サービスのカード上での挙動は以下の通りです。</p>
      <table className="static-table">
        <thead>
          <tr>
            <th>サービス</th>
            <th>カード表示</th>
            <th>埋め込み再生</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>X (Twitter)</td>
            <td>本文 + 画像 + 動画サムネイル</td>
            <td>○（Lightbox 内）</td>
          </tr>
          <tr>
            <td>YouTube</td>
            <td>動画サムネイル + タイトル</td>
            <td>○（純正プレーヤー）</td>
          </tr>
          <tr>
            <td>YouTube Shorts</td>
            <td>縦サムネイル</td>
            <td>○（9:16 表示）</td>
          </tr>
          <tr>
            <td>TikTok</td>
            <td>動画サムネイル</td>
            <td>○（Lightbox 内）</td>
          </tr>
          <tr>
            <td>Instagram</td>
            <td>サムネイル + 投稿者</td>
            <td>×（Instagram で開く）</td>
          </tr>
          <tr>
            <td>画像 URL</td>
            <td>画像そのまま</td>
            <td>—</td>
          </tr>
          <tr>
            <td>一般 Web サイト</td>
            <td>OGP 画像 + タイトル</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>

      <h2>5. 制約と誠実な開示</h2>
      <p>
        AllMarks は技術的な制約をユーザーに対して隠しません。launch 時点で以下を明示します。
      </p>
      <ul>
        <li>
          <strong>Instagram の埋め込み再生はできません</strong> — Meta 社の API 制約により、
          サードパーティアプリ内での Instagram 動画再生は技術的に不可能です。
          AllMarks では Instagram カードクリック時に「Instagram で開く」リンクを提示します。
        </li>
        <li>
          <strong>データはこのブラウザ内のみ</strong> — 別のブラウザや別の端末にはデータが移りません。
          バックアップが必要な場合は、launch 後にエクスポート機能を提供予定です。
        </li>
        <li>
          <strong>シークレットモードでは保存されません</strong> — IndexedDB はブラウザのプライベートモード終了時に消去されます。
        </li>
      </ul>

      <h2>今すぐ試す</h2>
      <p>
        登録不要で無料です。<Link href="/board">Board を開く</Link> から始められます。
        使い方は <Link href="/guide">Guide</Link> を参照してください。
      </p>
    </>
  )
}
