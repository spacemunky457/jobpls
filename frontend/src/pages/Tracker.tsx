import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckCircle2, Download, ExternalLink, Eye, Send, XCircle } from 'lucide-react'
import { downloadApplication, fetchApplication, fetchApplyAttempts, fetchJobs, Job } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { Container } from '../components/ui/Container'
import { Drawer } from '../components/ui/Drawer'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Spinner'
import { STATUS_CLASS } from '../lib/status'
import { cn } from '../lib/cn'

export default function Tracker() {
  const [openId, setOpenId] = useState<number | null>(null)
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', { status: 'drafted,applied' }],
    queryFn: () => fetchJobs({ status: 'drafted,applied' }),
  })
  const openJob = jobs.find((j) => j.id === openId) ?? null

  return (
    <Container width="lg" className="space-y-4">
      <PageHeader
        title="Track"
        description="Applications you've drafted or already sent."
      />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Send size={28} />}
          title="No applications yet"
          description="Approve jobs and tailor them in Prepare to see them here."
          actionLabel="Go to Prepare"
          actionTo="/applications"
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => <TrackerTile key={job.id} job={job} onOpen={() => setOpenId(job.id)} />)}
        </div>
      )}

      <TrackerDrawer job={openJob} onClose={() => setOpenId(null)} />
    </Container>
  )
}

function TrackerTile({ job, onOpen }: { job: Job; onOpen: () => void }) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      className="tile tile-interactive min-h-[140px] animate-fade-up"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-700">
          {(job.company || '?').charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{job.company}</span>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', job.status === 'applied' ? 'bg-green-500' : 'bg-purple-500')} />
      </div>
      <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-ink">{job.title}</h3>
      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <span className={cn('badge', STATUS_CLASS[job.status])}>{job.status}</span>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <a
            href={job.url} target="_blank" rel="noreferrer" title="Open posting"
            className="grid h-7 w-7 place-items-center rounded-lg text-brand-600 transition-colors hover:bg-brand-50"
          >
            <ExternalLink size={14} />
          </a>
          <button
            onClick={() => downloadApplication(job.id)} title="Download CV"
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Download size={14} />
          </button>
          <button
            onClick={onOpen} title="View draft"
            className="grid h-7 w-7 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <Eye size={14} />
          </button>
        </div>
      </div>
    </article>
  )
}

function TrackerDrawer({ job, onClose }: { job: Job | null; onClose: () => void }) {
  const { data: app } = useQuery({
    queryKey: ['application', job?.id],
    queryFn: () => fetchApplication(job!.id),
    enabled: !!job,
  })
  const { data: attempts = [] } = useQuery({
    queryKey: ['attempts', job?.id],
    queryFn: () => fetchApplyAttempts(job!.id),
    enabled: !!job,
  })

  return (
    <Drawer
      open={!!job}
      onClose={onClose}
      title={job?.title}
      subtitle={job?.company}
      footer={job && (
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => downloadApplication(job.id)}>
            <Download size={14} /> Download CV
          </button>
          <a href={job.url} target="_blank" rel="noreferrer" className="btn">
            <ExternalLink size={14} /> Open posting
          </a>
        </div>
      )}
    >
      {job && (
        <div className="space-y-4">
          <span className={cn('badge', STATUS_CLASS[job.status])}>{job.status}</span>

          {attempts.length > 0 && (
            <div className="rounded-xl bg-surface-muted p-3 ring-1 ring-ink/5">
              <p className="label">Apply history</p>
              <ul className="space-y-1.5">
                {attempts.map((a, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs">
                    {a.state === 'submitted'
                      ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
                      : <XCircle size={14} className="mt-0.5 shrink-0 text-amber-600" />}
                    <span className="text-ink">
                      <span className="font-medium">{a.state}</span>
                      <span className="text-ink-muted"> · {a.method}</span>
                      {a.detail && <span className="text-ink-muted"> — {a.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {app ? (
            <>
              <div className="rounded-xl bg-surface-muted p-3 ring-1 ring-ink/5">
                <p className="label">Cover email</p>
                <pre className="whitespace-pre-wrap font-sans text-sm text-ink">{app.email_draft}</pre>
              </div>
              <div className="rounded-xl bg-surface-muted p-3 ring-1 ring-ink/5">
                <p className="label">Tailored CV</p>
                <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm text-ink">{app.cv_text}</pre>
              </div>
            </>
          ) : (
            <Skeleton className="h-40 w-full rounded-xl" />
          )}
        </div>
      )}
    </Drawer>
  )
}
