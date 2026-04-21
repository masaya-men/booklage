import { SeedDemos } from '@/components/dev/SeedDemos'

/**
 * Dev tool: one-click seed a handful of real-world URLs into the user's IDB
 * so B-embeds visual verification covers TikTok / YouTube Shorts / Instagram
 * without requiring a working bookmarklet. Not linked from the public UI.
 */
export default function SeedDemosPage(): React.ReactElement {
  return <SeedDemos />
}
