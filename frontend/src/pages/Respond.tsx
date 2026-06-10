import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { respondPublic, viewPublicRequest } from '../api/client'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Input'
import { Alert } from '../components/ui/Alert'
import { Spinner } from '../components/ui/Spinner'

export default function Respond() {
  const { token } = useParams<{ token: string }>()
  const [req, setReq] = useState<{ type: string; prompt: string; status: string; job_title?: string; job_company?: string } | null>(null)
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    viewPublicRequest(token).then(setReq).catch(() => setError('This link is invalid or has expired.'))
  }, [token])

  const submit = async () => {
    if (!token) return
    try { await respondPublic(token, answer); setDone(true) } catch { setError('Could not submit your response.') }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-surface-muted to-brand-50/40 p-4">
      <Card padding="lg" className="w-full max-w-md border border-line">
        <div className="mb-4 flex items-center gap-2 border-b border-line pb-4">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-sm font-bold text-white">J</span>
          <span className="text-lg font-semibold text-ink">Jobpls</span>
        </div>
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        {!error && !req && (
          <div className="flex items-center gap-2 text-ink-muted text-sm">
            <Spinner className="h-4 w-4" /> Loading…
          </div>
        )}
        {req && (done || req.status === 'answered') ? (
          <Alert variant="success">Thanks — your response has been saved. You can close this page.</Alert>
        ) : req ? (
          <div className="space-y-3">
            {req.job_title && (
              <div className="text-sm text-ink-muted">
                Re: <span className="text-ink font-medium">{req.job_title}</span>{req.job_company ? ` @ ${req.job_company}` : ''}
              </div>
            )}
            <p className="text-sm text-ink">{req.prompt}</p>
            <Textarea className="h-32" placeholder="Your response…" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <Button variant="primary" className="w-full" onClick={submit} disabled={!answer.trim()}>Submit</Button>
          </div>
        ) : null}
      </Card>
    </div>
  )
}
