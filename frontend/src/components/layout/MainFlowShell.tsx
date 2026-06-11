import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { LogOut, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { fetchRequests, fetchStats } from '../../api/client'
import { PipelineStepper } from '../workflow/PipelineStepper'
import { PendingInputBanner } from '../workflow/PendingInputBanner'
import Home from '../../pages/Home'
import Review from '../../pages/Review'
import Apply from '../../pages/Apply'
import Setup from '../../pages/Setup'

/**
 * The floating canvas: the whole app lives in one large centered tile on a quiet
 * backdrop (body), with visible space above and below. Content scrolls INSIDE the
 * canvas; the backdrop never moves. Collapses to full-bleed on small screens.
 */
export function MainFlowShell() {
  const { user, logout } = useAuth()
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 15_000 })
  const { data: requests = [] } = useQuery({ queryKey: ['requests'], queryFn: fetchRequests })

  return (
    <div className="min-h-dvh sm:px-4 sm:py-4 lg:px-6 lg:py-6">
      <div className="mx-auto flex h-dvh max-w-7xl flex-col overflow-hidden bg-white shadow-pop ring-1 ring-ink/5 sm:h-[calc(100dvh-2rem)] sm:rounded-3xl lg:h-[calc(100dvh-3rem)]">
        <header className="shrink-0 border-b border-line bg-white">
          <div className="flex w-full items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
            <Link to="/" className="flex items-center gap-2 font-semibold text-ink">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white shadow-tile">J</span>
              <span className="text-base tracking-tight">Jobpls</span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden sm:block">
                <PendingInputBanner count={requests.length} />
              </div>
              <Link
                to="/setup"
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <Settings size={16} />
                <span className="hidden sm:inline">Setup</span>
              </Link>
              <span className="hidden max-w-[160px] truncate text-xs text-ink-muted md:inline">{user?.email}</span>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
              >
                <LogOut size={14} />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </div>
          <div className="px-4 pb-2 sm:hidden">
            <PendingInputBanner count={requests.length} />
          </div>
        </header>

        <PipelineStepper stats={stats} />

        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/review" element={<Review />} />
            <Route path="/apply" element={<Apply />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/setup/:step" element={<Setup />} />
            {/* Legacy routes from the v1 IA */}
            <Route path="/inbox" element={<Navigate to="/review" replace />} />
            <Route path="/applications" element={<Navigate to="/apply" replace />} />
            <Route path="/tracker" element={<Navigate to="/apply?tab=sent" replace />} />
            <Route path="/requests" element={<Navigate to="/" replace />} />
            <Route path="/settings/*" element={<Navigate to="/setup" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
