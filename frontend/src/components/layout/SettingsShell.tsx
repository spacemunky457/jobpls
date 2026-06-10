import { Link, Route, Routes, Navigate } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import SettingsPage from '../../pages/Settings'
import { Container } from '../ui/Container'
import { SettingsNav } from './SettingsNav'

const SECTIONS = [
  { slug: 'profile', label: 'Profile' },
  { slug: 'applicant', label: 'Applicant' },
  { slug: 'cvs', label: 'Master CVs' },
  { slug: 'tailoring', label: 'Tailoring' },
  { slug: 'sources', label: 'Sources' },
  { slug: 'filters', label: 'Filters' },
  { slug: 'ai', label: 'AI' },
  { slug: 'email', label: 'Email' },
  { slug: 'scheduler', label: 'Scheduler' },
] as const

export type SettingsSection = typeof SECTIONS[number]['slug']

export function SettingsShell() {
  const { user, logout } = useAuth()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white">
      <header className="shrink-0 border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-600 text-xs font-bold text-white">J</span>
            <span className="text-base">Jobpls</span>
            <span className="ml-1 hidden text-sm font-normal text-ink-muted sm:inline">/ Settings</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              <ArrowLeft size={15} />
              <span className="hidden sm:inline">Back to pipeline</span>
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
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <Container width="sm" className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
            <p className="mt-0.5 text-sm text-ink-muted">Configure your profile, sources, AI, and how the pipeline runs.</p>
          </div>

          <SettingsNav sections={SECTIONS} />

          <Routes>
            <Route index element={<Navigate to="/settings/profile" replace />} />
            <Route path=":section" element={<SettingsPage />} />
          </Routes>
        </Container>
      </main>
    </div>
  )
}

export { SECTIONS }
