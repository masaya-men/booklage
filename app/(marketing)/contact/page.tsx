import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact the AllMarks team — questions, feedback, and support.',
}

export default function ContactPage(): React.ReactElement {
  return (
    <>
      <h1>Contact</h1>

      <h2>お問い合わせ</h2>
      <p>
        AllMarks に関するご質問、フィードバック、バグ報告などは
        以下の方法でご連絡ください。
      </p>

      <h2>GitHub Issues</h2>
      <p>
        バグ報告や機能リクエストは GitHub Issues が最も確実です。
      </p>
      <p>
        <a href="https://github.com/masaya-men/booklage/issues" target="_blank" rel="noopener noreferrer">
          github.com/masaya-men/booklage/issues
        </a>
      </p>

      <h2>X (Twitter)</h2>
      <p>
        開発の進捗や最新情報は X で発信しています。
        お気軽にメンションやDMでご連絡ください。
      </p>

      <h2>フィードバック</h2>
      <p>
        AllMarks をより良くするためのアイデアやご意見を歓迎します。
        「こんな機能が欲しい」「ここが使いにくい」など、
        どんな小さなことでもお聞かせください。
      </p>

      <h2>セキュリティ</h2>
      <p>
        セキュリティに関する問題を発見された場合は、
        GitHub Issues ではなく、直接ご連絡をお願いします。
        責任ある開示に感謝いたします。
      </p>
    </>
  )
}
