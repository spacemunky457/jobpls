import { Link } from 'react-router-dom'
import { MailQuestion } from 'lucide-react'
import { Alert } from '../ui/Alert'

interface PendingInputBannerProps {
  count: number
}

export function PendingInputBanner({ count }: PendingInputBannerProps) {
  if (count <= 0) return null

  return (
    <Alert variant="info" className="py-1.5">
      <Link to="/#requests" className="inline-flex items-center gap-1.5 font-medium hover:underline">
        <MailQuestion size={14} />
        {count} item{count !== 1 ? 's' : ''} need your input
      </Link>
    </Alert>
  )
}
