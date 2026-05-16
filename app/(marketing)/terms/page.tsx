import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'AllMarks terms of service — free to use, your data stays in your browser.',
}

export default function TermsPage(): React.ReactElement {
  return (
    <>
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: April 14, 2026</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using AllMarks (&quot;the Service&quot;), you agree to be bound
        by these Terms of Service. If you do not agree, please do not use the Service.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        AllMarks is a free web application that allows you to save bookmarks
        and arrange them as visual collages. All data is stored locally in your
        browser&apos;s IndexedDB. No account or registration is required.
      </p>

      <h2>3. User Responsibilities</h2>
      <ul>
        <li>You are responsible for the content you bookmark and share</li>
        <li>You agree not to use the Service for any illegal purpose</li>
        <li>You agree not to attempt to interfere with or disrupt the Service</li>
        <li>You understand that your data is stored locally and clearing your
          browser data will permanently delete your AllMarks content</li>
      </ul>

      <h2>4. Intellectual Property</h2>
      <p>
        AllMarks respects the intellectual property rights of others. The bookmarks
        you save reference content owned by third parties. AllMarks does not claim
        ownership of any bookmarked content. The AllMarks application, its code,
        design, and branding are the property of the AllMarks team.
      </p>

      <h2>5. Content Sharing</h2>
      <p>
        When you share a collage, the shared data is encoded in the URL.
        You are responsible for the content you choose to share. By sharing,
        you represent that you have the right to share the bookmarked content
        in the manner provided by the Service.
      </p>

      <h2>6. No Warranty</h2>
      <p>
        The Service is provided &quot;as is&quot; and &quot;as available&quot; without
        warranties of any kind, either express or implied. We do not guarantee
        that the Service will be uninterrupted, secure, or error-free.
        We are not responsible for any data loss resulting from browser data
        clearing, device failure, or any other cause.
      </p>

      <h2>7. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, the AllMarks team shall not be
        liable for any indirect, incidental, special, consequential, or punitive
        damages arising from your use of the Service.
      </p>

      <h2>8. Modifications</h2>
      <p>
        We reserve the right to modify or discontinue the Service at any time
        without prior notice. We may also update these Terms from time to time.
        Continued use of the Service after changes constitutes acceptance of
        the revised Terms.
      </p>

      <h2>9. Governing Law</h2>
      <p>
        These Terms are governed by the laws of Japan. Any disputes arising
        from these Terms or the Service shall be subject to the exclusive
        jurisdiction of the courts of Tokyo, Japan.
      </p>

      <h2>10. Contact</h2>
      <p>
        If you have questions about these terms, please visit
        our <a href="/contact">Contact page</a>.
      </p>
    </>
  )
}
