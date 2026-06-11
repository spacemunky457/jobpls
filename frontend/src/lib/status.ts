export const ELIGIBILITY_CLASS: Record<string, string> = {
  global: 'text-green-700',
  emea: 'text-green-700',
  contractor: 'text-green-700',
  'us-only': 'text-red-700',
  'needs-right-to-work': 'text-amber-700',
  unclear: 'text-amber-600',
}

// Candidate-match tiers (how well the user's CV fits a role).
export const TIERS = ['strong', 'possible', 'stretch', 'skip'] as const
export type Tier = typeof TIERS[number]

export const TIER_META: Record<string, { label: string; class: string }> = {
  strong: { label: 'Strong', class: 'bg-green-50 text-green-800 border border-green-200' },
  possible: { label: 'Possible', class: 'bg-brand-50 text-brand-700 border border-brand-200' },
  stretch: { label: 'Stretch', class: 'bg-amber-50 text-amber-800 border border-amber-200' },
  skip: { label: 'Skip', class: 'bg-surface-muted text-ink-muted border border-line' },
}

export function tierMeta(tier: string | null): { label: string; class: string } {
  if (tier && TIER_META[tier]) return TIER_META[tier]
  return { label: '—', class: 'bg-surface-muted text-ink-muted border border-line' }
}

export const STATUS_CLASS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-800 border border-blue-200',
  assessed: 'bg-surface-muted text-ink-muted border border-line',
  drafted: 'bg-purple-50 text-purple-800 border border-purple-200',
  applied: 'bg-green-50 text-green-800 border border-green-200',
  passed: 'bg-surface-muted text-ink-muted/70 border border-line',
  error: 'bg-red-50 text-red-800 border border-red-200',
}

// UI stage names over the DB statuses (DB rename deferred to the Alembic pass):
// new→Found, assessed→Matched, approved→Shortlisted, drafted→Ready, applied→Sent.
export const STAGE_LABEL: Record<string, string> = {
  new: 'Found',
  assessed: 'Matched',
  approved: 'Shortlisted',
  drafted: 'Ready',
  applied: 'Sent',
  passed: 'Passed',
}

export const REQUEST_TYPE_LABEL: Record<string, string> = {
  add_info: 'Add info',
  tailor_cv: 'Tailor CV',
  approve: 'Approve',
}
