import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Bot, CheckCheck, MailQuestion, Pause, Play, RefreshCw, Sparkles, Star,
} from 'lucide-react'
import {
  fetchAutomation, fetchJobs, fetchRequests, fetchStats, respondPublic, runAutomationNow,
  setApprovalBatch, Stats, updateAutomation,
} from '../api/client'
import { Button } from '../components/ui/Button'
import { Container } from '../components/ui/Container'
import { Badge } from '../components/ui/Badge'
import { Textarea } from '../components/ui/Input'
import { StatTile } from '../components/workflow/StatTile'
import { AUTOMATION_PHASES } from '../components/workflow/ActivityBar'
import { REQUEST_TYPE_LABEL, tierMeta } from '../lib/status'
import { cn } from '../lib/cn'

const STAT_LINKS: { key: keyof Stats; label: string; to: string; accent: string }[] = [
  { key: 'new', label: 'Found', to: '/review?view=grid&status=new', accent: 'bg-blue-500' },
  { key: 'to_review', label: 'Matched', to: '/review', accent: 'bg-brand-500' },
  { key: 'approved', label: 'Shortlisted', to: '/apply', accent: 'bg-teal-500' },
  { key: 'drafted', label: 'Ready', to: '/apply', accent: 'bg-purple-500' },
  { key: 'applied', label: 'Sent', to: '/apply?tab=sent', accent: 'bg-green-500' },
]

/** The hero shows the single next HUMAN action; machine work lives in the automation tile. */
function useNextAction(stats: Stats | undefined, requestCount: number) {
  if (!stats) return null
  if (requestCount > 0) {
    return {
      label: `Answer ${requestCount} pending request${requestCount !== 1 ? 's' : ''}`,
      desc: 'The pipeline is waiting on info only you have.',
      to: '#requests', anchor: true,
    }
  }
  if (stats.to_review > 0) {
    return {
      label: `Review ${stats.to_review} match${stats.to_review !== 1 ? 'es' : ''}`,
      desc: 'Assessed jobs are waiting for your shortlist / pass call.',
      to: '/review', anchor: false,
    }
  }
  if (stats.approved > stats.drafted + stats.applied) {
    return {
      label: 'Tailor your shortlist',
      desc: 'Shortlisted jobs are ready for a tailored CV and cover email.',
      to: '/apply', anchor: false,
    }
  }
  if (stats.drafted > 0) {
    return {
      label: `Send ${stats.drafted} ready application${stats.drafted !== 1 ? 's' : ''}`,
      desc: 'Drafts are reviewed and waiting to go out.',
      to: '/apply', anchor: false,
    }
  }
  return null
}

function AutomationTile() {
  const qc = useQueryClient()
  const { data: auto } = useQuery({
    queryKey: ['automation'],
    queryFn: fetchAutomation,
    refetchInterval: (q) => (q.state.data?.running ? 3_000 : 30_000),
  })
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['automation'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
    qc.invalidateQueries({ queryKey: ['jobs'] })
  }
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => updateAutomation({ enabled }),
    onSuccess: invalidate,
  })
  const runNow = useMutation({ mutationFn: runAutomationNow, onSuccess: invalidate })

  if (!auto) return <div className="tile min-h-[150px] animate-pulse" />

  const ready = auto.ready.ai_server && auto.ready.cv && auto.ready.email
  const last = auto.last_run

  return (
    <div className="tile min-h-[150px]">
      <div className="flex w-full items-center gap-2">
        <span className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-xl',
          auto.running ? 'bg-brand-600 text-white' : auto.enabled ? 'bg-green-100 text-green-700' : 'bg-surface-muted text-ink-muted',
        )}>
          <Bot size={16} className={auto.running ? 'animate-pulse' : ''} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">Automation</span>
          <span className="block text-[11px] text-ink-muted">
            {auto.running ? AUTOMATION_PHASES[last?.phase ?? '']?.label || 'Running…'
              : auto.enabled ? `On · every ${auto.interval_hours}h`
              : ready ? 'Off' : 'Needs setup'}
          </span>
        </span>
        {auto.enabled && !auto.running && <Badge variant="success">Armed</Badge>}
        {auto.running && <Badge variant="brand">Running</Badge>}
      </div>

      <div className="mt-2 flex-1 text-xs leading-relaxed text-ink-muted">
        {auto.running && last ? (
          <span>
            {last.found} found · {last.assessed} assessed
            {last.expired > 0 && ` · ${last.expired} expired`}
            {last.digest_sent > 0 && ` · digest sent (${last.digest_sent})`}
          </span>
        ) : last ? (
          <span>
            Last run {new Date(last.started_at).toLocaleString()}: {last.found} found, {last.assessed} assessed
            {last.phase === 'error' && <span className="text-red-600"> — failed: {last.error}</span>}
            {last.digest_sent > 0 && `, digest sent`}
          </span>
        ) : ready ? (
          <span>Discover → assess → retire stale → email digest, hands-free while the backend runs.</span>
        ) : (
          <span>
            Automation needs a server-side engine{!auto.ready.ai_server && ' (switch to Google Gemini — free)'}
            {!auto.ready.cv && ', a default CV'}{!auto.ready.email && ', email delivery'}.
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <Button
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending || auto.running}
          className="px-2.5 py-1.5 text-xs"
        >
          <RefreshCw size={13} className={auto.running ? 'animate-spin' : ''} />
          {auto.running ? 'Running…' : 'Run now'}
        </Button>
        {ready || auto.enabled ? (
          <Button
            variant={auto.enabled ? 'ghost' : 'primary'}
            onClick={() => toggle.mutate(!auto.enabled)}
            disabled={toggle.isPending}
            className="px-2.5 py-1.5 text-xs"
          >
            {auto.enabled ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Enable</>}
          </Button>
        ) : (
          <Link to="/setup/engine" className="text-xs font-medium text-brand-600 hover:underline">
            Finish setup →
          </Link>
        )}
      </div>
    </div>
  )
}

function RequestTile({ id, type, prompt, token }: { id: number; type: string; prompt: string; token: string }) {
  const qc = useQueryClient()
  const [answer, setAnswer] = useState('')
  const submit = useMutation({
    mutationFn: () => respondPublic(token, answer),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  })
  return (
    <div key={id} className="tile gap-2 ring-amber-200/80">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-600">
          <MailQuestion size={14} />
        </span>
        <Badge variant="warning">{REQUEST_TYPE_LABEL[type] || type}</Badge>
      </div>
      <p className="text-sm text-ink">{prompt}</p>
      <Textarea className="h-20" placeholder="Your answer…" value={answer} onChange={(e) => setAnswer(e.target.value)} />
      <Button variant="primary" onClick={() => submit.mutate()} disabled={!answer.trim() || submit.isPending} className="self-start">
        {submit.isPending ? 'Sending…' : 'Answer'}
      </Button>
    </div>
  )
}

export default function Home() {
  const qc = useQueryClient()
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 15_000 })
  const { data: requests = [] } = useQuery({ queryKey: ['requests'], queryFn: fetchRequests })
  const { data: jobs = [] } = useQuery({ queryKey: ['jobs'], queryFn: () => fetchJobs({ limit: 500 }) })

  const nextAction = useNextAction(stats, requests.length)
  const topMatches = jobs
    .filter((j) => j.status === 'assessed' && !j.approved && (j.tier === 'strong' || j.tier === 'possible'))
    .sort((a, b) => (b.match ?? 0) - (a.match ?? 0))
    .slice(0, 6)
  const strongIds = topMatches.filter((j) => j.tier === 'strong').map((j) => j.id)

  const approveStrong = useMutation({
    mutationFn: () => setApprovalBatch(strongIds, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
    },
  })

  return (
    <Container width="lg" className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[1fr,340px]">
        {/* Hero: the next HUMAN action only */}
        <div className="tile justify-between bg-gradient-to-br from-brand-50/80 to-white p-5 ring-brand-100">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-tile">
              <Star size={18} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Your next step</p>
              <p className="mt-1 text-lg font-semibold tracking-tight text-ink">
                {nextAction ? nextAction.label : 'All caught up'}
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {nextAction ? nextAction.desc : 'Nothing needs you right now — automation (or Run now) will surface new matches.'}
              </p>
            </div>
          </div>
          {nextAction && !nextAction.anchor && (
            <Link to={nextAction.to} className="mt-4 self-start">
              <Button variant="primary">{nextAction.label} <ArrowRight size={15} /></Button>
            </Link>
          )}
          {nextAction?.anchor && (
            <a href="#requests" className="btn-primary mt-4 self-start">
              {nextAction.label} <ArrowRight size={15} />
            </a>
          )}
        </div>

        <AutomationTile />
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STAT_LINKS.map(({ key, label, to, accent }) => (
            <StatTile key={key} value={stats[key]} label={label} to={to} accent={accent} />
          ))}
        </div>
      )}

      {requests.length > 0 && (
        <div id="requests" className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Needs your input</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {requests.map((r) => (
              <RequestTile key={r.id} id={r.id} type={r.type} prompt={r.prompt} token={r.token} />
            ))}
          </div>
        </div>
      )}

      {topMatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Top matches waiting</h2>
            {strongIds.length > 0 && (
              <Button onClick={() => approveStrong.mutate()} disabled={approveStrong.isPending} className="px-2.5 py-1.5 text-xs">
                <CheckCheck size={14} className="text-green-600" /> Shortlist all strong ({strongIds.length})
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topMatches.map((job) => {
              const m = tierMeta(job.tier)
              return (
                <Link key={job.id} to="/review" className="tile tile-interactive min-h-[110px] animate-fade-up">
                  <div className="flex w-full items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700">
                      {(job.company || '?').charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{job.company}</span>
                    <span className={cn('badge', m.class)}>{m.label}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink">{job.title}</p>
                  {job.verdict && <p className="mt-1 line-clamp-1 text-xs italic text-ink-muted">“{job.verdict}”</p>}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {stats && stats.total === 0 && (
        <div className="tile-dashed items-center justify-center gap-2 py-10 text-center">
          <Sparkles size={22} className="text-brand-500" />
          <p className="font-medium text-ink">No jobs yet</p>
          <p className="max-w-sm text-sm text-ink-muted">
            Finish setup, then hit <b>Run now</b> on the automation tile to fetch your first batch.
          </p>
          <Link to="/setup" className="btn-primary mt-1">Open setup</Link>
        </div>
      )}
    </Container>
  )
}
