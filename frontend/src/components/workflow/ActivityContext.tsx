import { createContext, useContext, useMemo, useState } from 'react'

/** Browser-side pipeline work (local-Ollama assess/tailor, auto-apply) reported
 * globally so the ActivityBar can show it on every page — page-local state dies
 * when the user navigates away mid-run. */
export interface BrowserActivity {
  kind: 'assess' | 'tailor' | 'apply'
  browser?: boolean
  done?: number
  total?: number
}

interface ActivityCtx {
  activity: BrowserActivity | null
  setActivity: (a: BrowserActivity | null) => void
}

const Ctx = createContext<ActivityCtx>({ activity: null, setActivity: () => {} })

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState<BrowserActivity | null>(null)
  const value = useMemo(() => ({ activity, setActivity }), [activity])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useActivity = () => useContext(Ctx)
