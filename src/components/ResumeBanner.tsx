import { Link } from 'wouter'
import { useCatalog } from '../db/useCatalog.ts'
import type { SessionRecord } from '../domain/records.ts'
import { sessionTitle } from '../features/history/sessionTitle.ts'

/** "Upper in progress · Resume" card. Shown on Today and on template screens. */
export function ResumeBanner({ session }: { session: SessionRecord }) {
  const catalog = useCatalog()
  return (
    <Link href={`/session/${session.id}`} className="btn btn-primary">
      Resume {sessionTitle(catalog, session.templateIds)} session ›
    </Link>
  )
}
