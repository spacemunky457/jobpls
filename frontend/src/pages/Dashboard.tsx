import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Download, MailQuestion, RefreshCw, Sparkles, Star } from 'lucide-react'
import { fetchRequests, fetchStats, runDiscover, sendDigest, Stats } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Alert } from '../components/ui/Alert'
import { Container } from '../components/ui/Container'
import { StatTile } from '../components/workflow/StatTile'

const STAT_LINKS: { key: keyof Stats; label: string; to: string; accent: string }[] = [
  { key: 'total', label: 'Total', to: '/inbox', accent: 'bg-slate-400' },
  { key: 'new', label: 'New', to: '/inbox?status=new', accent: 'bg-blue-500' },
  { key: 'assessed', label: 'Assessed', to: '/inbox?status=assessed', accent: 'bg-brand-500' },
  { key: 'approved', label: 'Approved', to: '/applications', accent: 'bg-teal-500' },
  { key: 'drafted', label: 'Drafted', to: '/tracker', accent: 'bg-purple-500' },
  { key: 'applied', label: 'Applied', to: '/tracker', accent: 'bg-green-500' },
]

export default function Dashboard() {
  const qc = useQueryClient()
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 15_000 })
  const { data: requests } = useQuery({ queryKey: ['requests'], queryFn: fetchRequests })

  const discover = useMutation({
    mutationFn: runDiscover,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stats'] })
      qc.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
  const digest = useMutation({ mutationFn: sendDigest })

  const nextAction = (() => {
    if (!stats) return null
    if (stats.new > 0) return { label: `Assess ${stats.new} new job${stats.new !== 1 ? 's' : ''}`, to: '/inbox' }
    if (stats.approved > stats.drafted) return { label: 'Tailor approved jobs', to: '/applications' }
    if (stats.assessed > 0) return { label: 'Review assessed jobs', to: '/inbox?status=assessed' }
    return { label: 'Run discovery to find jobs', to: '/', onClick: () => discover.mutate() }
  })()

  return (
    <Container width="lg" className="space-y-5">
      <PageHeader
        title="Overview"
        description="Discover jobs, monitor your pipeline, and take the next step."
        actions={
          <>
            <Button variant="primary" onClick={() => discover.mutate()} disabled={discover.isPending}>
              <RefreshCw size={15} className={discover.isPending ? 'animate-spin' : ''} />
              Run discovery
            </Button>
            <Button onClick={() => digest.mutate()} disabled={digest.isPending}>
              <Download size={15} />
              Send digest
            </Button>
          </>
        }
      />

      {discover.data && <Alert variant="success">{discover.data.message}</Alert>}
      {digest.data && <Alert variant="success">Digest sent for {digest.data.sent} matches.</Alert>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STAT_LINKS.map(({ key, label, to, accent }) => (
            <StatTile key={key} value={stats[key]} label={label} to={to} accent={accent} />
          ))}
        </div>
      )}

      {nextAction && (
        <Card padding="lg" className="bg-gradient-to-br from-brand-50/80 to-white ring-brand-100">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-tile">
              <Star size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">Suggested next step</div>
              <p className="mt-1 mb-3 text-sm text-ink-muted">
                {stats?.new ? 'New jobs are waiting to be assessed against your CV.' :
                  stats?.approved && stats.approved > stats.drafted ? 'You have approved jobs ready for tailoring.' :
                  stats?.assessed ? 'Review and approve your strongest matches.' :
                  'Start by discovering jobs from your configured sources.'}
              </p>
              {'onClick' in nextAction && nextAction.onClick ? (
                <Button variant="primary" onClick={nextAction.onClick}>{nextAction.label}<ArrowRight size={15} /></Button>
              ) : (
                <Link to={nextAction.to}>
                  <Button variant="primary">{nextAction.label}<ArrowRight size={15} /></Button>
                </Link>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <Link to="/inbox" className="group block">
          <Card hover className="flex h-full items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Sparkles size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1 font-medium text-ink">
                Review &amp; assess matches
                <ArrowRight size={14} className="text-ink-muted transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="text-sm text-ink-muted">Assess new jobs against your CV, then approve the ones worth tailoring.</div>
            </div>
          </Card>
        </Link>
        <Link to="/requests" className="group block">
          <Card hover className="flex h-full items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <MailQuestion size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1 font-medium text-ink">
                Needs your input
                <ArrowRight size={14} className="text-ink-muted transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="text-sm text-ink-muted">
                {requests?.length || 0} pending request{requests?.length !== 1 ? 's' : ''} for more info or approval.
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </Container>
  )
}
