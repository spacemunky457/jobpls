import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ArrowLeft, Check, CheckCircle2, Download, Eye, ExternalLink, FileText, Mail, Rocket, Save, Send, Sparkles } from 'lucide-react'
import {
  applyBatch, applyJob, ApplyResult, downloadApplication, fetchApplication, fetchConfig, fetchJobs, ingestTailor, Job,
  prepareTailor, runApprovals, setStatus, updateApplication,
} from '../api/client'
import { runTasks } from '../ai/ollamaBrowser'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Container } from '../components/ui/Container'
import { Textarea } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Spinner'
import { ProgressBanner } from '../components/workflow/ProgressBanner'
import { STATUS_CLASS } from '../lib/status'
import { cn } from '../lib/cn'

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

function ApplicationEditor({ job }: { job: Job }) {
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
  const [opened, setOpened] = useState(false)

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
            Approved and ready. Run &ldquo;Tailor approved&rdquo; above to generate a tailored CV and cover email.
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

      <div className="overflow-hidden rounded-xl border border-line">
        <div className="flex items-center justify-between bg-surface-muted/50 px-4 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Review, then apply</p>
        </div>

        <div className="divide-y divide-line px-4">
          <StepRow n={1} title="Review & edit" desc="Tweak the CV and email above so you're happy with them." done={savedOnce}>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save size={15} /> {save.isPending ? 'Saving…' : 'Save edits'}
            </Button>
          </StepRow>

          <StepRow n={2} title="Download a copy" desc="Optional — keep the tailored CV for your records." done={downloaded}>
            <button className="btn" onClick={() => { downloadApplication(job.id); setDownloaded(true) }}>
              <Download size={15} /> Download CV
            </button>
          </StepRow>
        </div>

        {/* The one final click: actually apply. */}
        <div className="space-y-3 border-t border-line bg-surface-muted/50 px-4 py-4">
          {applied ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
              <CheckCircle2 size={16} /> Applied — find it under Track.
            </span>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">Apply now</p>
                  <p className="text-xs text-ink-muted">
                    Jobpls opens the application form and submits it for you using your{' '}
                    <a href="/settings/applicant" className="text-brand-600 hover:underline">applicant profile</a>.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button onClick={() => apply.mutate({ headless: false })} disabled={apply.isPending}
                    title="Open a visible browser so you can watch (and step in) while it applies">
                    <Eye size={15} /> Apply (watch it)
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
                    <a className="btn" href={job.url} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}>
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

      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-xs text-ink-muted">{opened ? 'Posting opened in a new tab.' : ''}</span>
        <Button variant="ghost" onClick={() => mark.mutate('assessed')}>
          <ArrowLeft size={15} /> Send back to review
        </Button>
      </div>
    </Card>
  )
}

export default function Applications() {
  const qc = useQueryClient()
  const [progress, setProgress] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const provider = config?.AI_PROVIDER || 'ollama_browser'

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['jobs', { approved_only: true }],
    queryFn: () => fetchJobs({ approved_only: true }),
  })

  const selected = jobs.find((j) => j.id === selectedId) ?? jobs[0] ?? null

  const tailor = useMutation({
    mutationFn: async () => {
      if (provider === 'ollama_browser') {
        const tasks = await prepareTailor()
        if (!tasks.length) return { message: 'Nothing to tailor.' }
        const results = await runTasks(tasks, (d, t) => setProgress(`Tailoring ${d}/${t} in your browser…`))
        return ingestTailor(results)
      }
      return runApprovals()
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
      setProgress(`Auto-applying to ${draftedCount} tailored job${draftedCount !== 1 ? 's' : ''}… this drives a browser per job, give it a moment.`)
      return applyBatch()
    },
    onSuccess: (r) => {
      setProgress(`Auto-apply done — ${r.submitted} submitted, ${r.failed} failed, ${r.skipped} skipped.`)
      qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error & { message?: string }) => setProgress(`Auto-apply error: ${e?.message || 'failed'}`),
  })

  return (
    <Container width="lg" className="space-y-4">
      <PageHeader
        title="Prepare"
        description="Tailor applications for approved jobs, review them, then apply — one at a time or all at once."
        actions={
          <>
            <Button onClick={() => tailor.mutate()} disabled={tailor.isPending}>
              <Sparkles size={15} className={tailor.isPending ? 'animate-pulse' : ''} />
              {provider === 'ollama_browser' ? 'Tailor approved (local Ollama)' : 'Tailor approved (server)'}
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
          </>
        }
      />

      <ProgressBanner message={progress || tailor.data?.message} />

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState
          icon={<FileText size={28} />}
          title="No approved jobs"
          description="Approve jobs in Review before tailoring applications."
          actionLabel="Go to Review"
          actionTo="/inbox"
        />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="shrink-0 space-y-2 lg:w-72">
            <p className="px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
              {jobs.length} approved
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
                    active
                      ? 'shadow-tile-hover ring-2 ring-brand-500'
                      : 'tile-interactive',
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
            {selected && <ApplicationEditor key={selected.id} job={selected} />}
          </div>
        </div>
      )}
    </Container>
  )
}
