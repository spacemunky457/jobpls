import { Alert } from '../ui/Alert'

interface ProgressBannerProps {
  message?: string
  error?: string
}

export function ProgressBanner({ message, error }: ProgressBannerProps) {
  if (!message && !error) return null
  if (error) return <Alert variant="error">{error}</Alert>
  return <Alert variant="info">{message}</Alert>
}
