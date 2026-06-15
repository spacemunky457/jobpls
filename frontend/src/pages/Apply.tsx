import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Check, CheckCircle2, Download, ExternalLink, Eye, FileText, Mail, Rocket,
  Save, Send, Sparkles,
} from 'lucide-react'
import {
  applyBatch, applyJob, ApplyResult, downloadApplication, fetchApplication, fetchApplyAttempts,
  fetchConfig, fetchJobs, ingestTailor, Job, prepareTailor, runApprovals, setStatus,
  updateApplication,
} from '../api/client'
import { runTasks } from '../ai/ollamaBrowser'
import { useActivity } from '../components/workflow/ActivityContext'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Container } from '../components/ui/Container'
import { Drawer } from '../components/ui/Drawer'
import { Textarea } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Spinner'
import { ProgressBanner } from '../components/workflow/ProgressBanner'
import { STATUS_CLASS } from '../lib/status'
import { cn } from '../lib/cn'

// --- The kit: a 4-step mini-stepper inside the editor (Tailor → Edit → Export → Done) ---

function StepRow({
  n, title, desc, done, children,
}: {
  n: number; title: string; desc: string; done?: boolean; children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className={cn(
          'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors',
          done ? 'bg-green-100 text-green-700' : 'bg-brand-100 text-brand-700',
        )}
      >
        {done ? <Check size={14} /> : n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-ink-muted">{desc}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ApplicationKit({ job }: { job: Job }) {
  const qc = useQueryClient()
  const drafted = job.status === 'drafted' || job.status === 'applied'
  const { data: app, isLoading } = useQuery({
    queryKey: ['application', job.id],
    queryFn: () => fetchApplication(job.id),
    enabled: drafted,
  })
  const [cv, setCv] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [savedOnce, setSavedOnce] = useState(false)
  const [downloaded, setDownloaded] = useState(false)

  const save = useMutation({
    mutationFn: () => updateApplication(job.id, { cv_text: cv ?? app?.cv_text, email_draft: email ?? app?.email_draft }),
    onSuccess: () => { setSavedOnce(true); qc.invalidateQueries({ queryKey: ['application', job.id] }) },
  })
  const mark = useMutation({
    mutationFn: (status: string) => setStatus(job.id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['stats'] }) },
  })
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const apply = useMutation({
    mutationFn: (opts?: { headless?: boolean }) => applyJob(job.id, opts),
    onSuccess: (r) => {
      setApplyResult(r)
      qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error & { message?: string }) =>
      setApplyResult({ job_id: job.id, method: 'manual', state: 'failed', detail: e?.message || 'apply failed' }),
  })
  const applied = job.status === 'applied'

  if (!drafted) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-brand-600">
          <Sparkles size={20} />
        </span>
        <div>
          <p className="font-medium text-ink">{job.title}</p>
          <p className="mt-1 max-w-sm text-sm text-ink-muted">
            Shortlisted and ready. Hit &ldquo;Tailor shortlist&rdquo; above to generate a tailored CV and cover email.
          </p>
        </div>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="space-y-3">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </Card>
    )
  }
  if (!app) return null

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-ink">{job.title}</h2>
          <p className="truncate text-sm text-ink-muted">{job.company} · {job.location}</p>
        </div>
        <span className={cn('badge shrink-0', STATUS_CLASS[job.status] ?? '')}>{job.status}</span>
      </div>
      <div>
        <label className="label flex items-center gap-1.5"><FileText size={13} /> Tailored CV</label>
        <Textarea className="h-56 font-mono text-xs leading-relaxed" value={cv ?? app.cv_text} onChange={(e) => setCv(e.target.value)} />
      </div>
      <div>
        <label className="label flex items-center gap-1.5"><Mail size={13} /> Cover email</label>
        <Textarea className="h-32 text-xs leading-relaxed" value={email ?? app.email_draft} onChange={(e) => setEmail(e.target.value)} />
      </div>

      <div className="overflow-hidden rounded-xl bg-surface-muted/60 ring-1 ring-ink/5">
        <div className="flex items-center justify-between px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Review, then send</p>
        </div>

        <div className="divide-y divide-line bg-surface px-4">
          <StepRow n={1} title="Review & edit" desc="Tweak the CV and email above so you're happy with them." done={savedOnce}>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save size={15} /> {save.isPending ? 'Saving…' : 'Save edits'}
            </Button>
          </StepRow>

          <StepRow n={2} title="Download a copy" desc="The tailored CV for this job, as PDF or Word." done={downloaded}>
            <div className="flex items-center gap-2">
              <button className="btn" onClick={() => { downloadApplication(job.id, 'pdf'); setDownloaded(true) }}>
                <Download size={15} /> PDF
              </button>
              <button className="btn" onClick={() => { downloadApplication(job.id, 'docx'); setDownloaded(true) }}>
                <Download size={15} /> DOCX
              </button>
            </div>
          </StepRow>
        </div>

        <div className="space-y-3 border-t border-line px-4 py-4">
          {applied ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 size={16} /> Sent — see it in the Sent tab.
            </span>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Apply now</p>
                  <p className="text-xs text-ink-muted">
                    Jobpls opens the application form and submits it using your applicant details (Setup → You).
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button onClick={() => apply.mutate({ headless: false })} disabled={apply.isPending}
                    title="Open a visible browser so you can watch (and step in) while it applies">
                    <Eye size={15} /> Watch it
                  </Button>
                  <Button variant="primary" onClick={() => apply.mutate(undefined)} disabled={apply.isPending}>
                    <Send size={15} className={apply.isPending ? 'animate-pulse' : ''} />
                    {apply.isPending ? 'Applying…' : 'Apply now'}
                  </Button>
                </div>
              </div>

              {applyResult && applyResult.state !== 'submitted' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p className="font-medium">
                    {applyResult.state === 'skipped' ? 'Couldn’t start' : 'Couldn’t finish automatically'} ({applyResult.method})
                  </p>
                  <p className="mt-0.5">{applyResult.detail}</p>
                  {applyResult.trace && applyResult.trace.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer select-none font-medium text-amber-900">What the bot did ({applyResult.trace.length} steps)</summary>
                      <ol className="mt-1.5 space-y-1 border-l-2 border-amber-300 pl-3">
                        {applyResult.trace.map((step, i) => (
                          <li key={i} className="text-amber-900/90"><span className="text-amber-500">{i + 1}.</span> {step}</li>
                        ))}
                      </ol>
                    </details>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <a className="btn" href={job.url} target="_blank" rel="noreferrer">
                      <ExternalLink size={13} /> Open posting
                    </a>
                    <button className="btn" onClick={() => mark.mutate('applied')}>
                      <CheckCircle2 size={13} /> I applied manually
                    </button>
                  </div>
                </div>
              )}
              {applyResult && applyResult.state === 'submitted' && applyResult.trace && applyResult.trace.length > 0 && (
                <details className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                  <summary className="cursor-pointer select-none font-medium">Submitted — see what the bot did ({applyResult.trace.length} steps)</summary>
                  <ol className="mt-1.5 space-y-1 border-l-2 border-green-300 pl-3">
                    {applyResult.trace.map((step, i) => (
                      <li key={i}><span className="text-green-500">{i + 1}.</span> {step}</li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-line pt-3">
        <Button variant="ghost" onClick={() => mark.mutate('assessed')}>
          <ArrowLeft size={15} /> Send back to review
        </Button>
      </div>
    </Card>
  )
}

// --- In progress tab: picker + kit ---

function InProgress() {
  const qc = useQueryClient()
  const [progress, setProgress] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const provider = config?.AI_PROVIDER || 'ollama_browser'

  const { data: allApproved = [], isLoading } = useQuery({
    queryKey: ['jobs', { approved_only: true }],
    queryFn: () => fetchJobs({ approved_only: true }),
  })
  const jobs = allApproved.filter((j) => j.status !== 'applied')

  const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0] ?? null

  const { setActivity } = useActivity()
  const tailor = useMutation({
    // Running-state display lives in the global ActivityBar (survives page
    // changes); this page only keeps error / result messages.
    mutationFn: async () => {
      try {
        if (provider === 'ollama_browser') {
          const tasks = await prepareTailor()
          if (!tasks.length) return { message: 'Nothing to tailor.' }
          setActivity({ kind: 'tailor', browser: true, done: 0, total: tasks.length })
          const results = await runTasks(tasks, (d, t) => setActivity({ kind: 'tailor', browser: true, done: d, total: t }))
          return await ingestTailor(results)
        }
        setActivity({ kind: 'tailor' })
        return await runApprovals()
      } finally {
        setActivity(null)
      }
    },
    onSuccess: () => {
      setProgress('')
      qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error & { message?: string }) => setProgress(`Error: ${e?.message || 'tailoring failed'}`),
  })

  const draftedCount = jobs.filter((j) => j.status === 'drafted').length
  const batchApply = useMutation({
    mutationFn: async () => {
      setActivity({ kind: 'apply' })
      setProgress(`Auto-applying to ${draftedCount} tailored job${draftedCount !== 1 ? 's' : ''}… this drives a browser per job, give it a moment.`)
      try {
        return await applyBatch()
      } finally {
        setActivity(null)
      }
    },
    onSuccess: (r) => {
      setProgress(`Auto-apply done — ${r.submitted} submitted, ${r.failed} failed, ${r.skipped} skipped.`)
      qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error & { message?: string }) => setProgress(`Auto-apply error: ${e?.message || 'failed'}`),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => tailor.mutate()} disabled={tailor.isPending}>
          <Sparkles size={15} className={tailor.isPending ? 'animate-pulse' : ''} />
          {provider === 'ollama_browser' ? 'Tailor shortlist (local Ollama)' : 'Tailor shortlist'}
        </Button>
        <Button
          variant="primary"
          onClick={() => batchApply.mutate()}
          disabled={batchApply.isPending || draftedCount === 0}
          title={draftedCount === 0 ? 'Tailor some jobs first' : `Auto-apply to ${draftedCount} tailored job(s)`}
        >
          <Rocket size={15} className={batchApply.isPending ? 'animate-pulse' : ''} />
          {batchApply.isPending ? 'Auto-applying…' : `Auto-apply all${draftedCount ? ` (${draftedCount})` : ''}`}
        </Button>
      </div>

      <ProgressBanner message={progress || tailor.data?.message} />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<FileText size={28} />}
          title="Nothing shortlisted"
          description="Shortlist jobs in Review, then tailor and send them from here."
          actionLabel="Go to Review"
          actionTo="/review"
        />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="shrink-0 space-y-2 lg:w-72">
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
              {jobs.length} in progress
            </p>
            {jobs.map((job) => {
              const active = selected?.id === job.id
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedId(job.id)}
                  className={cn(
                    'tile w-full gap-0.5 transition-all',
                    active ? 'shadow-tile-hover ring-2 ring-brand-500' : 'tile-interactive',
                  )}
                >
                  <span className="flex w-full items-center gap-2">
                    <span className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-semibold',
                      active ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700',
                    )}>
                      {(job.company || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{job.title}</span>
                      <span className="block truncate text-xs text-ink-muted">{job.company}</span>
                    </span>
                  </span>
                  <span className={cn('badge mt-2', STATUS_CLASS[job.status])}>{job.status}</span>
                </button>
              )
            })}
          </div>
          <div className="min-w-0 flex-1">
            {selected && <ApplicationKit key={selected.id} job={selected} />}
          </div>
        </div>
      )}
    </div>
  )
}

// --- Sent tab (the old Tracker) ---

function SentTile({ job, onOpen }: { job: Job; onOpen: () => void }) {
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
        </div>
      </div>
    </article>
  )
}

function SentDrawer({ job, onClose }: { job: Job | null; onClose: () => void }) {
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
          <button className="btn" onClick={() => downloadApplication(job.id, 'pdf')}>
            <Download size={14} /> PDF
          </button>
          <button className="btn" onClick={() => downloadApplication(job.id, 'docx')}>
            <Download size={14} /> DOCX
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
                  <li key={i} className="flex items-start gap-2 text-xs text-ink">
                    {a.state === 'submitted'
                      ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
                      : <Send size={14} className="mt-0.5 shrink-0 text-ink-muted" />}
                    <span><b>{a.method}</b> — {a.state}{a.detail ? `: ${a.detail}` : ''}</span>
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

function Sent() {
  const [openId, setOpenId] = useState<number | null>(null)
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', { status: 'applied' }],
    queryFn: () => fetchJobs({ status: 'applied' }),
  })
  const openJob = jobs.find((j) => j.id === openId) ?? null

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<Send size={28} />}
          title="Nothing sent yet"
          description="Applications you mark as applied (or the bot submits) land here."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {jobs.map((job) => <SentTile key={job.id} job={job} onOpen={() => setOpenId(job.id)} />)}
        </div>
      )}
      <SentDrawer job={openJob} onClose={() => setOpenId(null)} />
    </div>
  )
}

// --- Page ---

export default function Apply() {
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') === 'sent' ? 'sent' : 'progress'
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: () => fetchJobs({ limit: 500 }) })
  const inProgressCount = jobs.filter((j) => j.approved && j.status !== 'applied').length
  const sentCount = jobs.filter((j) => j.status === 'applied').length

  return (
    <Container width="lg" className="space-y-4">
      <PageHeader
        title="Apply"
        description="Tailor each shortlisted job's kit — CV + cover email — review it, then send."
        actions={
          <div className="flex items-center gap-0.5 rounded-xl bg-surface-muted p-0.5">
            {([['progress', `In progress · ${inProgressCount}`], ['sent', `Sent · ${sentCount}`]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setSearchParams(v === 'progress' ? {} : { tab: 'sent' }, { replace: true })}
                className={cn(
                  'rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all',
                  tab === v ? 'bg-surface text-ink shadow-tile ring-1 ring-ink/5' : 'text-ink-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />
      {tab === 'progress' ? <InProgress /> : <Sent />}
    </Container>
  )
}
