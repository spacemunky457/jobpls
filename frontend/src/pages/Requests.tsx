import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Inbox as InboxIcon, MailQuestion } from 'lucide-react'
import { fetchRequests, respondPublic } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { Container } from '../components/ui/Container'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Textarea } from '../components/ui/Input'
import { EmptyState } from '../components/ui/EmptyState'
import { Alert } from '../components/ui/Alert'
import { Skeleton } from '../components/ui/Spinner'
import { REQUEST_TYPE_LABEL } from '../lib/status'

function RequestCard({ type, prompt, created_at, token }: { type: string; prompt: string; created_at: string; token: string }) {
  const qc = useQueryClient()
  const [answer, setAnswer] = useState('')
  const [done, setDone] = useState(false)

  const submit = useMutation({
    mutationFn: () => respondPublic(token, answer),
    onSuccess: () => {
      setDone(true)
      qc.invalidateQueries({ queryKey: ['requests'] })
    },
  })

  if (done) {
    return (
      <Card>
        <Alert variant="success">Response saved. Thanks!</Alert>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <MailQuestion size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <Badge variant="brand" className="mb-2">{REQUEST_TYPE_LABEL[type] || type}</Badge>
          <p className="text-sm text-ink">{prompt}</p>
          <p className="mt-1 text-xs text-ink-muted">{new Date(created_at).toLocaleString()}</p>
        </div>
      </div>
      <Textarea
        className="h-28"
        placeholder="Your response…"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      <Button variant="primary" onClick={() => submit.mutate()} disabled={!answer.trim() || submit.isPending}>
        {submit.isPending ? 'Submitting…' : 'Submit response'}
      </Button>
      {submit.isError && <Alert variant="error">Could not submit your response. Try again.</Alert>}
    </Card>
  )
}

export default function Requests() {
  const { data: requests = [], isLoading } = useQuery({ queryKey: ['requests'], queryFn: fetchRequests })

  return (
    <Container width="sm" className="space-y-4">
      <PageHeader
        title="Needs your input"
        description="Answer these prompts here or via the secure link emailed to you."
      />

      {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
        </div>
      )}

      {!isLoading && requests.length === 0 && (
        <EmptyState
          icon={<InboxIcon size={28} />}
          title="Nothing pending"
          description="When the system needs more information, requests will appear here and via email."
        />
      )}

      <div className="space-y-3">
        {requests.map((r) => (
          <RequestCard key={r.id} type={r.type} prompt={r.prompt} created_at={r.created_at} token={r.token} />
        ))}
      </div>
    </Container>
  )
}
