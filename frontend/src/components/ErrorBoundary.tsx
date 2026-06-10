import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Last-resort crash screen so a render error never leaves users staring
 * at a blank page in production.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('Unhandled render error:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4">
        <div className="w-full max-w-md rounded-2xl bg-surface p-6 text-center shadow-pop ring-1 ring-ink/5">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-red-50 text-2xl">⚠️</span>
          <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
          <p className="mt-1 text-sm text-ink-muted">
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button className="btn-primary mt-4" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
