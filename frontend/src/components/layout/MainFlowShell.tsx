import { Link, Route, Routes } from 'react-router-dom'
import { LogOut, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthContext'
import { fetchRequests, fetchStats } from '../../api/client'
import { PipelineStepper } from '../workflow/PipelineStepper'
import { PendingInputBanner } from '../workflow/PendingInputBanner'
import Dashboard from '../../pages/Dashboard'
import Inbox from '../../pages/Inbox'
import Applications from '../../pages/Applications'
import Tracker from '../../pages/Tracker'
import Requests from '../../pages/Requests'

export function MainFlowShell() {
  const { user, logout } = useAuth()
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: fetchStats, refetchInterval: 15_000 })
  const { data: requests = [] } = useQuery({ queryKey: ['requests'], queryFn: fetchRequests })

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <header className="bg-white border-b border-line shrink-0">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white shadow-tile">J</span>
            <span className="text-base tracking-tight">Jobpls</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <PendingInputBanner count={requests.length} />
            </div>
            <Link
              to="/settings"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Settings</span>
            </Link>
            <span className="hidden md:inline text-xs text-ink-muted truncate max-w-[160px]">{user?.email}</span>
            <button
              onClick={logout}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-muted hover:bg-surface-muted hover:text-ink transition-colors"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
        <div className="sm:hidden px-4 pb-2">
          <PendingInputBanner count={requests.length} />
        </div>
      </header>

      <PipelineStepper stats={stats} />

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/applications" element={<Applications />} />
          <Route path="/tracker" element={<Tracker />} />
          <Route path="/requests" element={<Requests />} />
        </Routes>
      </main>
    </div>
  )
}
