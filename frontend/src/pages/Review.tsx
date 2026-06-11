import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check, CheckCheck, ChevronDown, ChevronUp, ExternalLink, LayoutGrid, Rows3, Search,
  Sparkles, Trash2, X,
} from 'lucide-react'
import {
  deleteJob, fetchConfig, fetchJobs, ingestAssessments, Job, prepareAssess, runAssess,
  setApproval, setApprovalBatch, setStatus,
} from '../api/client'
import { runTasks } from '../ai/ollamaBrowser'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Container } from '../components/ui/Container'
import { Drawer } from '../components/ui/Drawer'
import { Input, Select } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { Skeleton } from '../components/ui/Spinner'
import { ProgressBanner } from '../components/workflow/ProgressBanner'
import { ELIGIBILITY_CLASS, STATUS_CLASS, TIERS, tierMeta } from '../lib/status'
import { cn } from '../lib/cn'

const TIER_RANK: Record<string, number> = { strong: 0, possible: 1, stretch: 2, skip: 3 }
const STATUS_DOT: Record<string, string> = {
  new: 'bg-blue-500',
  assessed: 'bg-slate-400',
  drafted: 'bg-purple-500',
  applied: 'bg-green-500',
  passed: 'bg-slate-300',
  error: 'bg-red-500',
}
const ELIGIBILITY_OPTIONS = ['global', 'emea', 'contractor', 'us-only', 'needs-right-to-work', 'unclear']

function TierBadge({ tier, className }: { tier: string | null; className?: string }) {
  const m = tierMeta(tier)
  return <span className={cn('badge', m.class, className)}>{m.label}</span>
}

// --- Shared mutations ---

function useJobMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['jobs'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }
  const approveMut = useMutation({
    mutationFn: ({ ids, approved }: { ids: number[]; approved: boolean }) =>
      ids.length === 1 ? setApproval(ids[0], approved) : setApprovalBatch(ids, approved),
    onMutate: async ({ ids, approved }) => {
      await qc.cancelQueries({ queryKey: ['jobs'] })
      const prev = qc.getQueryData<Job[]>(['jobs'])
      qc.setQueryData<Job[]>(['jobs'], (old) => old?.map((j) => (ids.includes(j.id) ? { ...j, approved } : j)))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['jobs'], ctx.prev) },
    onSettled: invalidate,
  })
  const passMut = useMutation({
    mutationFn: (id: number) => setStatus(id, 'passed'),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['jobs'] })
      const prev = qc.getQueryData<Job[]>(['jobs'])
      qc.setQueryData<Job[]>(['jobs'], (old) => old?.map((j) => (j.id === id ? { ...j, status: 'passed' } : j)))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['jobs'], ctx.prev) },
    onSettled: invalidate,
  })
  const deleteMut = useMutation({
    mutationFn: deleteJob,
    onMutate: async (id: number) => {
      await qc.cancelQueries({ queryKey: ['jobs'] })
      const prev = qc.getQueryData<Job[]>(['jobs'])
      qc.setQueryData<Job[]>(['jobs'], (old) => old?.filter((j) => j.id !== id))
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['jobs'], ctx.prev) },
    onSettled: invalidate,
  })
  return { approveMut, passMut, deleteMut }
}

// --- The deck (default view): one decision at a time ---

function DeckCard({ job, onPass, onShortlist }: { job: Job; onPass: () => void; onShortlist: () => void }) {
  const [showJD, setShowJD] = useState(false)
  return (
    <div className="tile mx-auto w-full max-w-2xl animate-fade-up p-5">
      <div className="flex items-center gap-2">
        <TierBadge tier={job.tier} />
        {job.eligibility && (
          <span className={cn('badge border border-line bg-surface-muted', ELIGIBILITY_CLASS[job.eligibility] ?? 'text-ink-muted')}>
            {job.eligibility}
          </span>
        )}
        <span className="ml-auto truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          via {job.source}
        </span>
      </div>

      <h2 className="mt-3 text-lg font-semibold leading-snug tracking-tight text-ink">{job.title}</h2>
      <p className="mt-0.5 text-sm text-ink-muted">
        {job.company}{job.location ? ` · ${job.location}` : ''}
      </p>

      {job.verdict && (
        <p className="mt-3 border-l-2 border-brand-300 pl-3 text-sm italic leading-relaxed text-ink">
          “{job.verdict}”
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-green-50/70 p-3 ring-1 ring-green-100">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">Your strengths</p>
          <p className="text-sm leading-relaxed text-ink">{job.strengths || '—'}</p>
        </div>
        <div className="rounded-xl bg-amber-50/70 p-3 ring-1 ring-amber-100">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Gaps to close</p>
          <p className="text-sm leading-relaxed text-ink">{job.gaps || '—'}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowJD((s) => !s)}
        className="mt-3 inline-flex items-center gap-1 self-start text-xs font-medium text-brand-600 hover:text-brand-700"
      >
        {showJD ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Full job description
      </button>
      {showJD && (
        <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-muted p-3 text-xs leading-relaxed text-ink-muted ring-1 ring-ink/5">
          {job.jd_text || 'No description captured.'}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        <button
          onClick={onPass}
          className="btn text-ink-muted hover:border-red-200 hover:text-red-600"
          title="Pass (←) — hide this job; recoverable from the grid view"
        >
          <X size={15} /> Pass
        </button>
        <a href={job.url} target="_blank" rel="noreferrer" className="btn-ghost text-xs" title="Open posting (o)">
          <ExternalLink size={13} /> Open posting
        </a>
        <button
          onClick={onShortlist}
          className="btn-primary"
          title="Shortlist (→) — approve for tailoring"
        >
          <Check size={15} /> Shortlist
        </button>
      </div>
    </div>
  )
}

function Deck({ jobs }: { jobs: Job[] }) {
  const { approveMut, passMut } = useJobMutations()
  const queue = useMemo(
    () =>
      [...jobs]
        .filter((j) => j.status === 'assessed' && !j.approved)
        .sort((a, b) =>
          (TIER_RANK[a.tier ?? ''] ?? 4) - (TIER_RANK[b.tier ?? ''] ?? 4) || (b.match ?? -1) - (a.match ?? -1)),
    [jobs],
  )
  const total = queue.length
  const job = queue[0] ?? null

  const pass = useCallback(() => { if (job) passMut.mutate(job.id) }, [job, passMut])
  const shortlist = useCallback(() => { if (job) approveMut.mutate({ ids: [job.id], approved: true }) }, [job, approveMut])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      if (!job) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); pass() }
      if (e.key === 'ArrowRight') { e.preventDefault(); shortlist() }
      if (e.key === 'o') window.open(job.url, '_blank')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [job, pass, shortlist])

  if (!job) {
    return (
      <EmptyState
        icon={<Sparkles size={28} />}
        title="Review queue is clear"
        description="No assessed jobs are waiting on a decision. New matches land here after each automation run or assessment."
        actionLabel="Back to Home"
        actionTo="/"
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-medium text-ink-muted">
        {total} to review · <kbd className="rounded bg-surface-muted px-1 ring-1 ring-line">←</kbd> pass ·{' '}
        <kbd className="rounded bg-surface-muted px-1 ring-1 ring-line">→</kbd> shortlist ·{' '}
        <kbd className="rounded bg-surface-muted px-1 ring-1 ring-line">o</kbd> open posting
      </p>
      <DeckCard key={job.id} job={job} onPass={pass} onShortlist={shortlist} />
    </div>
  )
}

// --- The grid (secondary view): browse, filter, bulk ops ---

function ApproveButton({ job, onToggle, size = 'sm' }: { job: Job; onToggle: (job: Job) => void; size?: 'sm' | 'md' }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(job) }}
      title={job.approved ? 'Shortlisted — click to undo' : 'Shortlist for tailoring'}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-full font-medium transition-all active:scale-95',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
        job.approved
          ? 'border border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
          : 'border border-line bg-surface text-ink-muted shadow-rail hover:border-brand-300 hover:text-brand-700',
      )}
    >
      {job.approved ? <><Check size={size === 'sm' ? 12 : 14} /> Shortlisted</> : 'Shortlist'}
    </button>
  )
}

function JobTile({ job, onOpen, onToggle }: { job: Job; onOpen: (job: Job) => void; onToggle: (job: Job) => void }) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen(job)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(job) }}
      className="tile tile-interactive min-h-[176px] animate-fade-up"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-50 text-sm font-semibold text-brand-700">
          {(job.company || '?').charAt(0).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium uppercase tracking-wide text-ink-muted">
          {job.source}
        </span>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[job.status] ?? 'bg-slate-300')} title={job.status} />
      </div>

      <h3 className="mt-2.5 line-clamp-2 text-sm font-semibold leading-snug text-ink">{job.title}</h3>
      <p className="mt-0.5 truncate text-xs text-ink-muted">
        {job.company}
        {job.location ? ` · ${job.location}` : ''}
      </p>
      {job.verdict && <p className="mt-1.5 line-clamp-2 text-xs italic leading-snug text-ink-muted">“{job.verdict}”</p>}

      <div className="mt-auto flex items-center justify-between gap-2 pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <TierBadge tier={job.tier} />
          {job.eligibility && (
            <span className={cn('hidden truncate text-[11px] sm:inline', ELIGIBILITY_CLASS[job.eligibility] ?? 'text-ink-muted')}>
              {job.eligibility}
            </span>
          )}
        </div>
        <ApproveButton job={job} onToggle={onToggle} />
      </div>
    </article>
  )
}

function JobDrawer({ job, onClose, onToggle, onDelete }: {
  job: Job | null
  onClose: () => void
  onToggle: (job: Job) => void
  onDelete: (id: number) => void
}) {
  return (
    <Drawer
      open={!!job}
      onClose={onClose}
      title={job?.title}
      subtitle={job ? `${job.company}${job.location ? ` · ${job.location}` : ''} · via ${job.source}` : undefined}
      footer={job && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ApproveButton job={job} onToggle={onToggle} size="md" />
            <a href={job.url} target="_blank" rel="noreferrer" className="btn">
              <ExternalLink size={14} /> Open posting
            </a>
          </div>
          <button
            onClick={() => { onDelete(job.id); onClose() }}
            className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}
    >
      {job && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <TierBadge tier={job.tier} />
            <span className={cn('badge', STATUS_CLASS[job.status] ?? '')}>{job.status}</span>
            {job.eligibility && (
              <span className={cn('badge border border-line bg-surface-muted', ELIGIBILITY_CLASS[job.eligibility] ?? 'text-ink-muted')}>
                {job.eligibility}
              </span>
            )}
          </div>

          {job.verdict && (
            <p className="border-l-2 border-brand-300 pl-3 text-sm italic leading-relaxed text-ink">“{job.verdict}”</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-green-50/70 p-3 ring-1 ring-green-100">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">Your strengths</p>
              <p className="text-sm leading-relaxed text-ink">{job.strengths || 'Not assessed yet.'}</p>
            </div>
            <div className="rounded-xl bg-amber-50/70 p-3 ring-1 ring-amber-100">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Gaps to close</p>
              <p className="text-sm leading-relaxed text-ink">{job.gaps || 'Not assessed yet.'}</p>
            </div>
          </div>

          <div>
            <p className="label">Job description</p>
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-muted p-3 text-xs leading-relaxed text-ink-muted ring-1 ring-ink/5">
              {job.jd_text || 'No description captured.'}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}

function Grid({ jobs, isLoading }: { jobs: Job[]; isLoading: boolean }) {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [tierFilter, setTierFilter] = useState<string[]>([])
  const [eligFilter, setEligFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [sort, setSort] = useState<'match' | 'newest'>('match')
  const [openId, setOpenId] = useState<number | null>(null)
  const { approveMut, deleteMut } = useJobMutations()
  const toggleApprove = (job: Job) => approveMut.mutate({ ids: [job.id], approved: !job.approved })

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = jobs.filter((j) => {
      // Passed jobs are hidden unless explicitly filtered for (the recovery path).
      if (!statusFilter && j.status === 'passed') return false
      if (q && !`${j.company} ${j.title} ${j.location}`.toLowerCase().includes(q)) return false
      if (statusFilter && j.status !== statusFilter) return false
      if (tierFilter.length && !tierFilter.includes(j.tier ?? '')) return false
      if (eligFilter.length && !eligFilter.includes(j.eligibility ?? '')) return false
      return true
    })
    if (sort === 'match') {
      return [...filtered].sort((a, b) =>
        (TIER_RANK[a.tier ?? ''] ?? 4) - (TIER_RANK[b.tier ?? ''] ?? 4) || (b.match ?? -1) - (a.match ?? -1))
    }
    return filtered
  }, [jobs, search, statusFilter, tierFilter, eligFilter, sort])

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const j of jobs) counts[j.tier ?? ''] = (counts[j.tier ?? ''] ?? 0) + 1
    return counts
  }, [jobs])

  const openJob = visible.find((j) => j.id === openId) ?? jobs.find((j) => j.id === openId) ?? null
  const activeFilters = tierFilter.length + eligFilter.length + (statusFilter ? 1 : 0) + (search ? 1 : 0)
  const clearFilters = () => { setSearch(''); setTierFilter([]); setEligFilter([]); setStatusFilter('') }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search company, title or country…" className="pl-8" />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto">
            <option value="">All statuses</option>
            {['new', 'assessed', 'drafted', 'applied', 'passed'].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as 'match' | 'newest')} className="w-auto">
            <option value="match">Best match first</option>
            <option value="newest">Newest first</option>
          </Select>
          <span className="ml-auto text-xs text-ink-muted">
            {visible.length} of {jobs.length} job{jobs.length !== 1 ? 's' : ''}
          </span>
          {activeFilters > 0 && (
            <button type="button" onClick={clearFilters} className="text-xs font-medium text-brand-600 hover:text-brand-700">
              Clear filters
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {TIERS.map((t) => {
              const m = tierMeta(t)
              const active = tierFilter.includes(t)
              const count = tierCounts[t] ?? 0
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierFilter((f) => (active ? f.filter((x) => x !== t) : [...f, t]))}
                  className={cn(
                    'badge gap-1 transition-all active:scale-95',
                    active ? cn(m.class, 'ring-2 ring-brand-500/30') : 'border border-line bg-surface text-ink-muted hover:border-brand-300 hover:text-ink',
                  )}
                >
                  {m.label}
                  <span className={cn('text-[10px]', active ? 'opacity-70' : 'text-ink-muted/70')}>{count}</span>
                </button>
              )
            })}
          </div>
          <span className="hidden h-4 w-px bg-line sm:block" />
          <div className="flex flex-wrap items-center gap-1.5">
            {ELIGIBILITY_OPTIONS.map((e) => {
              const active = eligFilter.includes(e)
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEligFilter((f) => (active ? f.filter((x) => x !== e) : [...f, e]))}
                  className={cn(
                    'badge transition-all active:scale-95',
                    active
                      ? 'border border-brand-200 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30'
                      : 'border border-line bg-surface text-ink-muted hover:border-brand-300 hover:text-ink',
                  )}
                >
                  {e}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Sparkles size={28} />}
          title={activeFilters > 0 ? 'No jobs match your filters' : 'No jobs yet'}
          description={activeFilters > 0
            ? 'Try clearing or loosening your filters to see more roles.'
            : 'Run automation from Home to fetch jobs from your configured sources.'}
          actionLabel={activeFilters > 0 ? undefined : 'Go to Home'}
          actionTo={activeFilters > 0 ? undefined : '/'}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((job) => (
            <JobTile key={job.id} job={job} onOpen={(j) => setOpenId(j.id)} onToggle={toggleApprove} />
          ))}
        </div>
      )}

      <JobDrawer
        job={openJob}
        onClose={() => setOpenId(null)}
        onToggle={toggleApprove}
        onDelete={(id) => deleteMut.mutate(id)}
      />
    </div>
  )
}

// --- Page ---

export default function Review() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'grid' ? 'grid' : 'deck'
  const [progress, setProgress] = useState('')

  const { data: config } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const provider = config?.AI_PROVIDER || 'ollama_browser'
  const { data: jobs = [], isLoading } = useQuery({ queryKey: ['jobs'], queryFn: () => fetchJobs({ limit: 500 }) })
  const { approveMut } = useJobMutations()

  const assess = useMutation({
    mutationFn: async () => {
      if (provider === 'ollama_browser') {
        const tasks = await prepareAssess(50)
        if (!tasks.length) return { success: true, message: 'Nothing new to assess.', count: 0 }
        const results = await runTasks(tasks, (d, t) => setProgress(`Assessing ${d}/${t} in your browser…`))
        return ingestAssessments(results)
      }
      return runAssess()
    },
    onSuccess: () => {
      setProgress('')
      qc.invalidateQueries({ queryKey: ['jobs'] }); qc.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (e: Error & { message?: string }) =>
      setProgress(`Error: ${e?.message || 'assessment failed (is Ollama running with OLLAMA_ORIGINS set?)'}`),
  })

  const newCount = jobs.filter((j) => j.status === 'new').length
  const strongUnapproved = jobs.filter((j) => j.tier === 'strong' && j.status === 'assessed' && !j.approved)

  return (
    <Container width="lg" className="space-y-4">
      <PageHeader
        title="Review"
        description="One decision at a time: shortlist the matches worth pursuing, pass on the rest."
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-xl bg-surface-muted p-0.5">
              {([['deck', Rows3], ['grid', LayoutGrid]] as const).map(([v, Icon]) => (
                <button
                  key={v}
                  onClick={() => setSearchParams(v === 'deck' ? {} : { view: 'grid' }, { replace: true })}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs font-medium capitalize transition-all',
                    view === v ? 'bg-surface text-ink shadow-tile ring-1 ring-ink/5' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <Icon size={13} /> {v}
                </button>
              ))}
            </div>
            {view === 'grid' && strongUnapproved.length > 0 && (
              <Button
                onClick={() => approveMut.mutate({ ids: strongUnapproved.map((j) => j.id), approved: true })}
                disabled={approveMut.isPending}
              >
                <CheckCheck size={15} className="text-green-600" />
                Shortlist all strong ({strongUnapproved.length})
              </Button>
            )}
            {(provider === 'ollama_browser' ? newCount > 0 : true) && (
              <Button variant="primary" onClick={() => assess.mutate()} disabled={assess.isPending || newCount === 0}>
                <Sparkles size={15} className={assess.isPending ? 'animate-pulse' : ''} />
                {provider === 'ollama_browser' ? 'Assess' : 'Assess on server'}
                {newCount > 0 ? ` · ${newCount} new` : ''}
              </Button>
            )}
          </>
        }
      />

      <ProgressBanner message={progress || assess.data?.message} error={assess.isError ? progress : undefined} />

      {view === 'deck' ? (
        isLoading ? <Skeleton className="mx-auto h-96 w-full max-w-2xl rounded-2xl" /> : <Deck jobs={jobs} />
      ) : (
        <Grid jobs={jobs} isLoading={isLoading} />
      )}
    </Container>
  )
}
