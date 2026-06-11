import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, KeyRound, Laptop, Lock,
  Plus, Sparkles, Star, Trash2, Zap,
} from 'lucide-react'
import {
  addRecommendedSources, ApplicantProfile, createCV, createProfile, createSource, deleteCV,
  deleteProfile, deleteSource, fetchApplicant, fetchAutomation, fetchConfig, fetchCVs,
  fetchProfiles, fetchSetupState, fetchSources, MasterCV, runAutomationNow, saveConfig,
  sendDigest, setDefaultCV, setDefaultProfile, Source, TailoringProfile, testAIKey, testEmail,
  updateApplicant, updateAutomation, updateCV, updateProfile, updateSource, uploadCV,
} from '../api/client'
import { listModels, ollamaBaseUrl, ollamaModel } from '../ai/ollamaBrowser'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Container } from '../components/ui/Container'
import { Badge } from '../components/ui/Badge'
import { Input, Select, Textarea } from '../components/ui/Input'
import { cn } from '../lib/cn'

const STEPS = [
  { slug: 'you', title: 'You', desc: 'Who you are and what you want' },
  { slug: 'cv', title: 'Your CV', desc: 'The CV matches and tailoring start from' },
  { slug: 'engine', title: 'Matching engine', desc: 'The AI that assesses and tailors' },
  { slug: 'sources', title: 'Where to look', desc: 'Boards, keywords, eligibility' },
  { slug: 'automation', title: 'Automation', desc: 'Hands-free runs + email digests' },
] as const

type StepSlug = typeof STEPS[number]['slug']

// --- Small shared bits (ported from the old Settings page) ---

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-ink">{label}</label>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      {children}
    </div>
  )
}

function useSavedFlag() {
  const [saved, setSaved] = useState(false)
  return { saved, flash: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) } }
}

function SaveBtn({ onClick, saving, saved, label = 'Save' }: { onClick: () => void; saving: boolean; saved: boolean; label?: string }) {
  return (
    <Button variant="primary" onClick={onClick} disabled={saving}>
      {saving ? 'Saving…' : saved ? 'Saved!' : label}
    </Button>
  )
}

// --- Step 1: You ---

function StepYou() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [profile, setProfile] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<string | null>(null)
  const { saved, flash } = useSavedFlag()
  const mut = useMutation({
    mutationFn: () => saveConfig({
      PROFILE_BLURB: profile ?? cfg?.PROFILE_BLURB ?? '',
      JOB_PREFERENCES: prefs ?? cfg?.JOB_PREFERENCES ?? '',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['setup'] })
      flash()
    },
  })
  return (
    <div className="space-y-4">
      <Card className="space-y-5">
        <Field label="Profile / background blurb" hint="Used by the AI when assessing your match. Your experience, tools, constraints.">
          <Textarea className="h-32" value={profile ?? cfg?.PROFILE_BLURB ?? ''} onChange={(e) => setProfile(e.target.value)} />
        </Field>
        <Field label="Job preferences & nuances" hint="What you're looking for, deal-breakers, niches. The more specific, the better the assessment.">
          <Textarea className="h-32" placeholder="e.g. avoid pure support roles; prefer async teams; open to contractor/EOR; care about AI tooling…"
            value={prefs ?? cfg?.JOB_PREFERENCES ?? ''} onChange={(e) => setPrefs(e.target.value)} />
        </Field>
        <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
      </Card>
      <ApplicantDetails />
    </div>
  )
}

function ApplicantDetails() {
  const qc = useQueryClient()
  const { data: profile } = useQuery({ queryKey: ['applicant'], queryFn: fetchApplicant })
  const [edits, setEdits] = useState<Partial<ApplicantProfile>>({})
  const { saved, flash } = useSavedFlag()
  const val = <K extends keyof ApplicantProfile>(k: K): ApplicantProfile[K] =>
    (edits[k] !== undefined ? edits[k] : profile?.[k]) as ApplicantProfile[K]
  const set = (k: keyof ApplicantProfile, v: string | boolean) => setEdits((e) => ({ ...e, [k]: v }))
  const mut = useMutation({
    mutationFn: () => updateApplicant(edits),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['applicant'] }); setEdits({}); flash() },
  })
  return (
    <details className="card group">
      <summary className="cursor-pointer select-none text-sm font-medium text-ink">
        Applicant details for auto-apply <span className="text-ink-muted">(optional — name, phone, links typed into forms)</span>
      </summary>
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><Input value={(val('first_name') as string) || ''} onChange={(e) => set('first_name', e.target.value)} /></Field>
          <Field label="Last name"><Input value={(val('last_name') as string) || ''} onChange={(e) => set('last_name', e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={(val('email') as string) || ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Phone"><Input value={(val('phone') as string) || ''} onChange={(e) => set('phone', e.target.value)} placeholder="+90 …" /></Field>
          <Field label="Location"><Input value={(val('location') as string) || ''} onChange={(e) => set('location', e.target.value)} placeholder="Istanbul, Turkey" /></Field>
          <Field label="LinkedIn"><Input value={(val('linkedin') as string) || ''} onChange={(e) => set('linkedin', e.target.value)} /></Field>
          <Field label="GitHub"><Input value={(val('github') as string) || ''} onChange={(e) => set('github', e.target.value)} /></Field>
          <Field label="Portfolio / website"><Input value={(val('portfolio') as string) || ''} onChange={(e) => set('portfolio', e.target.value)} /></Field>
        </div>
        <Field label="Work authorization" hint="Shown to forms that ask.">
          <Textarea className="h-16" value={(val('work_authorization') as string) || ''} onChange={(e) => set('work_authorization', e.target.value)} />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={Boolean(val('requires_sponsorship'))} onChange={(e) => set('requires_sponsorship', e.target.checked)} className="accent-brand-600" />
          I require visa sponsorship
        </label>
        <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
      </div>
    </details>
  )
}

// --- Step 2: Your CV ---

function StepCV() {
  const qc = useQueryClient()
  const { data: cvs = [] } = useQuery({ queryKey: ['cvs'], queryFn: fetchCVs })
  const fileRef = useRef<HTMLInputElement>(null)
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['cvs'] }); qc.invalidateQueries({ queryKey: ['setup'] }) }
  const upload = useMutation({ mutationFn: uploadCV, onSuccess: invalidate })
  const create = useMutation({ mutationFn: () => createCV('New CV', ''), onSuccess: invalidate })
  const setDef = useMutation({ mutationFn: setDefaultCV, onSuccess: invalidate })
  const del = useMutation({ mutationFn: deleteCV, onSuccess: invalidate })

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => fileRef.current?.click()}>{upload.isPending ? 'Uploading…' : 'Upload PDF / .txt'}</Button>
        <Button onClick={() => create.mutate()}><Plus size={14} /> New blank CV</Button>
        <input ref={fileRef} type="file" accept=".pdf,.txt" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f) }} />
      </div>
      {cvs.length === 0 && (
        <Card className="text-sm text-ink-muted">
          No CVs yet — upload your master CV. Matching and tailoring both start from your <b>default</b> CV.
        </Card>
      )}
      {cvs.map((cv) => <CVEditor key={cv.id} cv={cv} onDefault={() => setDef.mutate(cv.id)} onDelete={() => del.mutate(cv.id)} />)}
      <TailoringStyle />
    </div>
  )
}

function CVEditor({ cv, onDefault, onDelete }: { cv: MasterCV; onDefault: () => void; onDelete: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(cv.name)
  const [content, setContent] = useState(cv.content)
  const { saved, flash } = useSavedFlag()
  const save = useMutation({
    mutationFn: () => updateCV(cv.id, { name, content }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cvs'] }); qc.invalidateQueries({ queryKey: ['setup'] }); flash() },
  })
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <Input className="flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        {cv.is_default ? (
          <Badge variant="brand"><Star size={12} className="mr-1" /> Default</Badge>
        ) : (
          <Button onClick={onDefault}><Star size={14} /> Set default</Button>
        )}
        <Button onClick={onDelete}><Trash2 size={14} /></Button>
      </div>
      <Textarea className="h-40 font-mono text-xs" value={content} onChange={(e) => setContent(e.target.value)} />
      <SaveBtn onClick={() => save.mutate()} saving={save.isPending} saved={saved} />
    </Card>
  )
}

function TailoringStyle() {
  const qc = useQueryClient()
  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['profiles'] })
  const create = useMutation({ mutationFn: () => createProfile('New profile', { tone: '', length: 'one page', emphasis: '', extra_instructions: '' }), onSuccess: invalidate })
  const setDef = useMutation({ mutationFn: setDefaultProfile, onSuccess: invalidate })
  const del = useMutation({ mutationFn: deleteProfile, onSuccess: invalidate })
  return (
    <details className="card group">
      <summary className="cursor-pointer select-none text-sm font-medium text-ink">
        Tailoring style <span className="text-ink-muted">(tone, length and emphasis of generated CVs + emails)</span>
      </summary>
      <div className="mt-4 space-y-3">
        <Button onClick={() => create.mutate()}><Plus size={14} /> New profile</Button>
        {profiles.map((p) => <ProfileEditor key={p.id} profile={p} onDefault={() => setDef.mutate(p.id)} onDelete={() => del.mutate(p.id)} />)}
      </div>
    </details>
  )
}

function ProfileEditor({ profile, onDefault, onDelete }: { profile: TailoringProfile; onDefault: () => void; onDelete: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState(profile.name)
  const [opts, setOpts] = useState<Record<string, string>>(profile.options || {})
  const { saved, flash } = useSavedFlag()
  const save = useMutation({
    mutationFn: () => updateProfile(profile.id, { name, options: opts }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profiles'] }); flash() },
  })
  const set = (k: string, v: string) => setOpts((o) => ({ ...o, [k]: v }))
  return (
    <div className="space-y-2 rounded-xl bg-surface-muted p-3 ring-1 ring-ink/5">
      <div className="flex items-center gap-2">
        <Input className="flex-1" value={name} onChange={(e) => setName(e.target.value)} />
        {profile.is_default ? <Badge variant="brand"><Star size={12} className="mr-1" /> Default</Badge>
          : <Button onClick={onDefault}><Star size={14} /> Set default</Button>}
        <Button onClick={onDelete}><Trash2 size={14} /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tone"><Input value={opts.tone || ''} onChange={(e) => set('tone', e.target.value)} placeholder="warm and specific" /></Field>
        <Field label="Length"><Input value={opts.length || ''} onChange={(e) => set('length', e.target.value)} placeholder="one page" /></Field>
      </div>
      <Field label="Emphasis"><Input value={opts.emphasis || ''} onChange={(e) => set('emphasis', e.target.value)} /></Field>
      <Field label="Extra instructions"><Textarea className="h-16" value={opts.extra_instructions || ''} onChange={(e) => set('extra_instructions', e.target.value)} /></Field>
      <SaveBtn onClick={() => save.mutate()} saving={save.isPending} saved={saved} />
    </div>
  )
}

// --- Step 3: Matching engine ---

const ENGINE_TILES = [
  {
    value: 'gemini_byok',
    icon: Zap,
    title: 'Google Gemini',
    badge: 'Recommended',
    desc: 'Free API key — no install, runs server-side, enables full automation.',
  },
  {
    value: 'ollama_browser',
    icon: Laptop,
    title: 'Local Ollama',
    badge: null,
    desc: '100% private, runs on your machine. Automation needs a server-side engine.',
  },
  {
    value: 'claude_byok',
    icon: KeyRound,
    title: 'My Claude key',
    badge: null,
    desc: 'Best quality, pay per use. Runs server-side, enables automation.',
  },
  {
    value: 'claude_managed',
    icon: Lock,
    title: 'Managed',
    badge: 'Coming soon',
    desc: 'We provide the key and bill you. Not available yet.',
    disabled: true,
  },
] as const

function StepEngine() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [provider, setProvider] = useState<string | null>(null)
  const [geminiKey, setGeminiKey] = useState<string | null>(null)
  const [geminiModel, setGeminiModel] = useState<string | null>(null)
  const [claudeKey, setClaudeKey] = useState<string | null>(null)
  const [model, setModel] = useState(ollamaModel())
  const [baseUrl, setBaseUrl] = useState(ollamaBaseUrl())
  const [ollamaOnServer, setOllamaOnServer] = useState<boolean | null>(null)
  const [test, setTest] = useState('')
  const { saved, flash } = useSavedFlag()

  const saved_provider = cfg?.AI_PROVIDER ?? 'ollama_browser'
  // The two Ollama modes share one choice tile; the toggle below picks which.
  const current = provider ?? (saved_provider === 'ollama_server' ? 'ollama_browser' : saved_provider)
  const serverOllama = ollamaOnServer ?? (saved_provider === 'ollama_server')
  const effectiveProvider = current === 'ollama_browser' && serverOllama ? 'ollama_server' : current

  const mut = useMutation({
    mutationFn: () => {
      localStorage.setItem('jobpls_ollama_model', model)
      localStorage.setItem('jobpls_ollama_url', baseUrl)
      return saveConfig({
        AI_PROVIDER: effectiveProvider,
        GEMINI_API_KEY: geminiKey ?? cfg?.GEMINI_API_KEY ?? '',
        GEMINI_MODEL: geminiModel ?? cfg?.GEMINI_MODEL ?? 'gemini-2.5-flash',
        CLAUDE_API_KEY: claudeKey ?? cfg?.CLAUDE_API_KEY ?? '',
        OLLAMA_MODEL: model,
        OLLAMA_BASE_URL: baseUrl,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['config'] })
      qc.invalidateQueries({ queryKey: ['setup'] })
      qc.invalidateQueries({ queryKey: ['automation'] })
      flash()
    },
  })

  const testServer = useMutation({
    mutationFn: () => testAIKey(
      current,
      current === 'gemini_byok' ? (geminiKey ?? cfg?.GEMINI_API_KEY ?? '') : (claudeKey ?? cfg?.CLAUDE_API_KEY ?? ''),
      current === 'gemini_byok' ? (geminiModel ?? cfg?.GEMINI_MODEL ?? 'gemini-2.5-flash') : (cfg?.CLAUDE_MODEL ?? ''),
    ),
    onSuccess: (r) => setTest(r.ok ? `✓ ${r.message}` : `✗ ${r.message}`),
    onError: () => setTest('✗ Test failed — is the backend running?'),
  })

  const testOllama = async () => {
    setTest('Testing…')
    try {
      const m = await listModels()
      setTest(`✓ Connected. Models: ${m.join(', ') || '(none pulled — run `ollama pull llama3.2`)'}`)
    } catch {
      setTest(`✗ Could not reach Ollama. Start it allowing this origin: OLLAMA_ORIGINS=${window.location.origin} ollama serve`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {ENGINE_TILES.map((tile) => {
          const active = current === tile.value
          const Icon = tile.icon
          return (
            <button
              key={tile.value}
              type="button"
              disabled={'disabled' in tile && tile.disabled}
              onClick={() => { setProvider(tile.value); setTest('') }}
              className={cn(
                'choice-tile min-h-[120px]',
                active && 'choice-tile-active',
                'disabled' in tile && tile.disabled && 'cursor-not-allowed opacity-60 hover:translate-y-0 hover:shadow-tile',
              )}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className={cn('grid h-8 w-8 place-items-center rounded-xl', active ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700')}>
                  <Icon size={16} />
                </span>
                {tile.badge && (
                  <Badge variant={tile.badge === 'Recommended' ? 'brand' : 'default'}>{tile.badge}</Badge>
                )}
              </span>
              <span className="mt-2 text-sm font-semibold text-ink">{tile.title}</span>
              <span className="text-xs leading-snug text-ink-muted">{tile.desc}</span>
            </button>
          )
        })}
      </div>

      {current === 'gemini_byok' && (
        <Card className="space-y-4">
          <p className="text-sm text-ink-muted">
            Get a free key at{' '}
            <a className="font-medium text-brand-600 hover:underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              aistudio.google.com <ExternalLink size={12} className="inline" />
            </a>{' '}
            → &ldquo;Get API key&rdquo;. The free tier is rate-limited (~10 requests/min) but far more than a
            personal job search needs — assessments queue automatically under the limit.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gemini API key">
              <Input type="password" value={geminiKey ?? cfg?.GEMINI_API_KEY ?? ''} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza…" />
            </Field>
            <Field label="Model">
              <Select value={geminiModel ?? cfg?.GEMINI_MODEL ?? 'gemini-2.5-flash'} onChange={(e) => setGeminiModel(e.target.value)}>
                <option value="gemini-2.5-flash">gemini-2.5-flash (recommended)</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                <option value="gemini-2.5-pro">gemini-2.5-pro (slower, stricter limits)</option>
              </Select>
            </Field>
          </div>
          <Button onClick={() => { setTest('Testing…'); testServer.mutate() }} disabled={testServer.isPending}>
            <Check size={14} /> Test key
          </Button>
        </Card>
      )}

      {current === 'ollama_browser' && (
        <Card className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ollama model" hint="Pull it first, e.g. `ollama pull llama3.2`.">
              <Input value={model} onChange={(e) => setModel(e.target.value)} />
            </Field>
            <Field label="Base URL">
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </Field>
          </div>
          <div className="space-y-2 rounded-xl bg-surface-muted p-3 text-xs text-ink-muted ring-1 ring-ink/5">
            <p>Your browser calls Ollama directly. Start it once allowing this app&apos;s origin:</p>
            <pre className="overflow-x-auto rounded-lg bg-white p-2 text-ink ring-1 ring-line">
              OLLAMA_ORIGINS={typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'} ollama serve
            </pre>
            <Button onClick={testOllama}><Check size={14} /> Test connection</Button>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={serverOllama} onChange={(e) => setOllamaOnServer(e.target.checked)} className="accent-brand-600" />
            Ollama runs on the backend server (self-host) — enables automation
          </label>
        </Card>
      )}

      {current === 'claude_byok' && (
        <Card className="space-y-4">
          <Field label="Claude API key" hint="Stored in your account. Used server-side for matching and tailoring.">
            <Input type="password" value={claudeKey ?? cfg?.CLAUDE_API_KEY ?? ''} onChange={(e) => setClaudeKey(e.target.value)} placeholder="sk-ant-…" />
          </Field>
          <Button onClick={() => { setTest('Testing…'); testServer.mutate() }} disabled={testServer.isPending}>
            <Check size={14} /> Test key
          </Button>
        </Card>
      )}

      {test && (
        <p className={cn('text-sm', test.startsWith('✓') ? 'text-green-700' : test.startsWith('✗') ? 'text-red-600' : 'text-ink-muted')}>
          {test}
        </p>
      )}

      <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} label="Save engine" />
    </div>
  )
}

// --- Step 4: Where to look ---

const SOURCE_TYPES = [
  'remotive', 'remoteok', 'wwr', 'workingnomads', 'arbeitnow', 'themuse', 'linkedin',
  'greenhouse', 'lever', 'ashby', 'jsearch', 'adzuna', 'kariyer', 'yenibiris',
]
const KEYED_SOURCES = ['jsearch', 'adzuna']

function StepSources() {
  const qc = useQueryClient()
  const { data: sources = [] } = useQuery({ queryKey: ['sources'], queryFn: fetchSources })
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['sources'] }); qc.invalidateQueries({ queryKey: ['setup'] }) }
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateSource(id, { enabled }), onSuccess: invalidate })
  const del = useMutation({ mutationFn: deleteSource, onSuccess: invalidate })
  const add = useMutation({ mutationFn: (body: Omit<Source, 'id'>) => createSource(body), onSuccess: invalidate })
  const seedDefaults = useMutation({ mutationFn: addRecommendedSources, onSuccess: invalidate })
  const [newType, setNewType] = useState('remotive')
  const [newQuery, setNewQuery] = useState('')

  const [keywords, setKeywords] = useState<string | null>(null)
  const [countries, setCountries] = useState<string | null>(null)
  const [eligTypes, setEligTypes] = useState<string | null>(null)
  const [blocklist, setBlocklist] = useState<string | null>(null)
  const { saved, flash } = useSavedFlag()
  const saveFilters = useMutation({
    mutationFn: () => saveConfig({
      KEYWORDS: keywords ?? cfg?.KEYWORDS ?? '',
      COUNTRY_BLOCKLIST: countries ?? cfg?.COUNTRY_BLOCKLIST ?? '',
      ELIGIBLE_TYPES: eligTypes ?? cfg?.ELIGIBLE_TYPES ?? 'global,emea,contractor',
      BLOCKLIST_COMPANIES: blocklist ?? cfg?.BLOCKLIST_COMPANIES ?? '',
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); flash() },
  })
  const ELIG = ['global', 'emea', 'contractor', 'us-only', 'needs-right-to-work', 'unclear']
  const currentElig = (eligTypes ?? cfg?.ELIGIBLE_TYPES ?? 'global,emea,contractor').split(',').map((s) => s.trim())

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-ink-muted">
            Toggle the boards discovery pulls from. For ATS types (greenhouse, lever, ashby) the query is the
            company&apos;s board slug.
          </p>
          <Button onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending} className="shrink-0">
            <Plus size={14} /> {seedDefaults.isPending ? 'Adding…' : 'Add recommended'}
          </Button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {sources.map((src) => (
            <label
              key={src.id}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 ring-1 transition-all',
                src.enabled ? 'bg-surface shadow-rail ring-ink/5' : 'bg-surface-muted ring-line opacity-70',
              )}
            >
              <input type="checkbox" checked={src.enabled} onChange={(e) => toggle.mutate({ id: src.id, enabled: e.target.checked })} className="accent-brand-600" />
              <span className="w-24 shrink-0 text-xs font-medium text-ink">
                {src.type}{KEYED_SOURCES.includes(src.type) && <span className="ml-1 text-amber-600" title="needs an API key">⚿</span>}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{src.query || 'no query'}</span>
              <button onClick={(e) => { e.preventDefault(); del.mutate(src.id) }} className="text-ink-muted hover:text-red-600"><Trash2 size={13} /></button>
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Select value={newType} onChange={(e) => setNewType(e.target.value)} className="w-auto">{SOURCE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
          <Input className="flex-1" value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder="query / slug (optional)" />
          <Button variant="primary" onClick={() => { add.mutate({ type: newType, query: newQuery, enabled: true }); setNewQuery('') }}><Plus size={16} /></Button>
        </div>
      </Card>

      <Card className="space-y-5">
        <Field label="Title keywords" hint="Comma-separated. A job's title must match at least one to be ingested.">
          <Textarea className="h-20" value={keywords ?? cfg?.KEYWORDS ?? ''} onChange={(e) => setKeywords(e.target.value)} />
        </Field>
        <Field
          label="Banned countries / locations"
          hint="Comma-separated. Jobs whose location mentions one of these are skipped at discovery (jobs with no stated location are kept). Leave blank to ingest from everywhere."
        >
          <Input value={countries ?? cfg?.COUNTRY_BLOCKLIST ?? ''} onChange={(e) => setCountries(e.target.value)} placeholder="e.g. usa, united states, canada, india" />
        </Field>
        <Field label="Eligible location types" hint="Only jobs matching these are flagged eligible for you.">
          <div className="flex flex-wrap gap-1.5">
            {ELIG.map((e) => {
              const active = currentElig.includes(e)
              return (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEligTypes((active ? currentElig.filter((x) => x !== e) : [...currentElig, e]).join(','))}
                  className={cn(
                    'badge transition-all active:scale-95',
                    active ? 'border border-brand-200 bg-brand-50 text-brand-700 ring-2 ring-brand-500/30'
                      : 'border border-line bg-surface text-ink-muted hover:border-brand-300 hover:text-ink',
                  )}
                >
                  {e}
                </button>
              )
            })}
          </div>
        </Field>
        <Field label="Blocklist companies" hint="Comma-separated company names to skip.">
          <Input value={blocklist ?? cfg?.BLOCKLIST_COMPANIES ?? ''} onChange={(e) => setBlocklist(e.target.value)} />
        </Field>
        <SaveBtn onClick={() => saveFilters.mutate()} saving={saveFilters.isPending} saved={saved} label="Save filters" />
      </Card>

      <AggregatorKeys />
    </div>
  )
}

function AggregatorKeys() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [edits, setEdits] = useState<Record<string, string>>({})
  const { saved, flash } = useSavedFlag()
  const v = (k: string, d = '') => (edits[k] !== undefined ? edits[k] : cfg?.[k] ?? d)
  const set = (k: string, val: string) => setEdits((e) => ({ ...e, [k]: val }))
  const mut = useMutation({
    mutationFn: () => saveConfig(edits),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); setEdits({}); flash() },
  })
  return (
    <details className="card group">
      <summary className="cursor-pointer select-none text-sm font-medium text-ink">
        Reach the big boards <span className="text-ink-muted">(optional — JSearch/Adzuna keys for Indeed/LinkedIn/Glassdoor)</span>
      </summary>
      <div className="mt-4 space-y-4">
        <Field label="Default location" hint="Used by linkedin / adzuna / jsearch. e.g. 'Remote', 'Turkey', 'Europe'.">
          <Input value={v('JOB_LOCATION')} onChange={(e) => set('JOB_LOCATION', e.target.value)} placeholder="Remote" />
        </Field>
        <Field label="JSearch (RapidAPI) key" hint="Free tier at rapidapi.com/letscrape/api/jsearch.">
          <Input type="password" value={v('JSEARCH_API_KEY')} onChange={(e) => set('JSEARCH_API_KEY', e.target.value)} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Adzuna app id"><Input value={v('ADZUNA_APP_ID')} onChange={(e) => set('ADZUNA_APP_ID', e.target.value)} /></Field>
          <Field label="Adzuna app key"><Input type="password" value={v('ADZUNA_APP_KEY')} onChange={(e) => set('ADZUNA_APP_KEY', e.target.value)} /></Field>
          <Field label="Adzuna country"><Input value={v('ADZUNA_COUNTRY', 'gb')} onChange={(e) => set('ADZUNA_COUNTRY', e.target.value)} /></Field>
        </div>
        <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
      </div>
    </details>
  )
}

// --- Step 5: Automation ---

const INTERVALS = [
  { hours: 2, label: 'Every 2h' },
  { hours: 6, label: 'Every 6h' },
  { hours: 12, label: 'Every 12h' },
  { hours: 24, label: 'Daily' },
]

const EMAIL_PROVIDERS: [string, string][] = [
  ['console', 'Console (dev — prints to backend log)'],
  ['smtp', 'SMTP / Gmail (send real emails to yourself)'],
  ['resend', 'Resend (API key)'],
]

function StepAutomation() {
  const qc = useQueryClient()
  const { data: auto } = useQuery({ queryKey: ['automation'], queryFn: fetchAutomation })
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [status, setStatus] = useState('')
  const [edits, setEdits] = useState<Record<string, string>>({})
  const { saved, flash } = useSavedFlag()
  const v = (k: string, d = '') => (edits[k] !== undefined ? edits[k] : cfg?.[k] ?? d)
  const set = (k: string, val: string) => setEdits((e) => ({ ...e, [k]: val }))
  const emailProvider = v('EMAIL_PROVIDER', 'console')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['automation'] })
    qc.invalidateQueries({ queryKey: ['config'] })
    qc.invalidateQueries({ queryKey: ['setup'] })
  }
  const setAuto = useMutation({
    mutationFn: (body: Parameters<typeof updateAutomation>[0]) => updateAutomation(body),
    onSuccess: invalidate,
  })
  const saveEmail = useMutation({
    mutationFn: () => saveConfig(edits),
    onSuccess: () => { invalidate(); setEdits({}); flash() },
  })
  const test = useMutation({
    mutationFn: testEmail,
    onSuccess: (r) => setStatus(`Test email sent to ${r.to}. Check your inbox.`),
    onError: (e: Error & { response?: { data?: { detail?: string } } }) =>
      setStatus(`Failed: ${e?.response?.data?.detail || e?.message || 'unknown error'}`),
  })
  const digestNow = useMutation({
    mutationFn: sendDigest,
    onSuccess: (r) => setStatus(r.sent ? `Digest sent with ${r.sent} job(s).` : 'No qualifying jobs to send right now.'),
    onError: (e: Error & { response?: { data?: { detail?: string } } }) =>
      setStatus(`Failed: ${e?.response?.data?.detail || e?.message || 'unknown error'}`),
  })

  if (!auto) return null
  const ready = auto.ready

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium text-ink">Run automation</p>
            <p className="text-sm text-ink-muted">
              While the backend is running, Jobpls discovers jobs, assesses your fit, retires stale postings
              and emails you a digest — on your schedule. You only review and apply.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAuto.mutate({ enabled: !auto.enabled })}
            className={cn(
              'relative h-7 w-12 shrink-0 rounded-full transition-colors',
              auto.enabled ? 'bg-brand-600' : 'bg-line',
            )}
            aria-label="Toggle automation"
          >
            <span className={cn(
              'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-tile transition-all',
              auto.enabled ? 'left-[22px]' : 'left-0.5',
            )} />
          </button>
        </div>

        <div className="space-y-1.5 rounded-xl bg-surface-muted p-3 text-sm ring-1 ring-ink/5">
          {[
            { ok: ready.ai_server, label: ready.ai_server ? `Server-side engine — ${ready.ai_summary}` : 'Server-side engine needed (local-browser Ollama can’t run unattended)', fix: 'engine' },
            { ok: ready.cv, label: ready.cv ? 'Default CV set' : 'Add your CV so matches can be assessed', fix: 'cv' },
            { ok: ready.email, label: ready.email ? `Email — ${ready.email_summary}` : ready.email_summary, fix: null },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <CheckCircle2 size={15} className={item.ok ? 'text-green-600' : 'text-line'} />
              <span className={item.ok ? 'text-ink' : 'text-ink-muted'}>{item.label}</span>
              {!item.ok && item.fix && (
                <Link to={`/setup/${item.fix}`} className="text-xs font-medium text-brand-600 hover:underline">Fix →</Link>
              )}
            </div>
          ))}
        </div>

        <Field label="How often">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {INTERVALS.map((iv) => {
              const active = Math.abs(auto.interval_hours - iv.hours) < 0.01
              return (
                <button
                  key={iv.hours}
                  type="button"
                  onClick={() => setAuto.mutate({ interval_hours: iv.hours })}
                  className={cn('choice-tile items-center py-2.5', active && 'choice-tile-active')}
                >
                  <span className={cn('text-sm font-medium', active ? 'text-brand-700' : 'text-ink')}>{iv.label}</span>
                </button>
              )
            })}
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Digest">
            <Select value={auto.digest_mode} onChange={(e) => setAuto.mutate({ digest_mode: e.target.value })}>
              <option value="after_run">After each run (only if new)</option>
              <option value="daily">Daily at a set time</option>
            </Select>
          </Field>
          {auto.digest_mode === 'daily' && (
            <Field label="At (UTC)">
              <Input type="time" value={auto.digest_time} onChange={(e) => setAuto.mutate({ digest_time: e.target.value })} />
            </Field>
          )}
          <Field label="Minimum tier">
            <Select value={auto.digest_min_tier} onChange={(e) => setAuto.mutate({ digest_min_tier: e.target.value })}>
              <option value="strong">Strong only</option>
              <option value="possible">Possible and up</option>
              <option value="stretch">Stretch and up</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <p className="font-medium text-ink">Email delivery</p>
        <Field label="Send digests to" hint="Defaults to your account email if blank.">
          <Input type="email" value={v('DIGEST_EMAIL')} onChange={(e) => set('DIGEST_EMAIL', e.target.value)} placeholder="you@gmail.com" />
        </Field>
        <Field label="Provider">
          <Select value={emailProvider} onChange={(e) => set('EMAIL_PROVIDER', e.target.value)} className="w-auto">
            {EMAIL_PROVIDERS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </Select>
        </Field>
        {emailProvider === 'smtp' && (
          <div className="space-y-4 rounded-xl bg-surface-muted p-4 ring-1 ring-ink/5">
            <p className="text-xs text-ink-muted">
              Gmail: host <code>smtp.gmail.com</code>, port <code>587</code>, your address as username, and a{' '}
              <a className="text-brand-600 hover:underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google App Password</a>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SMTP host"><Input value={v('SMTP_HOST', 'smtp.gmail.com')} onChange={(e) => set('SMTP_HOST', e.target.value)} /></Field>
              <Field label="SMTP port"><Input value={v('SMTP_PORT', '587')} onChange={(e) => set('SMTP_PORT', e.target.value)} /></Field>
              <Field label="Username (your email)"><Input value={v('SMTP_USER')} onChange={(e) => set('SMTP_USER', e.target.value)} /></Field>
              <Field label="App password"><Input type="password" value={v('SMTP_PASSWORD')} onChange={(e) => set('SMTP_PASSWORD', e.target.value)} /></Field>
            </div>
            <Field label="From address" hint="Leave blank to use your username.">
              <Input value={v('EMAIL_FROM')} onChange={(e) => set('EMAIL_FROM', e.target.value)} />
            </Field>
          </div>
        )}
        {emailProvider === 'resend' && (
          <div className="space-y-4 rounded-xl bg-surface-muted p-4 ring-1 ring-ink/5">
            <Field label="Resend API key"><Input type="password" value={v('RESEND_API_KEY')} onChange={(e) => set('RESEND_API_KEY', e.target.value)} /></Field>
            <Field label="From address" hint="Must be a verified Resend sender.">
              <Input value={v('EMAIL_FROM')} onChange={(e) => set('EMAIL_FROM', e.target.value)} placeholder="Jobpls <onboarding@resend.dev>" />
            </Field>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <SaveBtn onClick={() => saveEmail.mutate()} saving={saveEmail.isPending} saved={saved} label="Save email" />
          <Button onClick={() => { setStatus('Sending test…'); test.mutate() }} disabled={test.isPending}>Send test email</Button>
          <Button onClick={() => { setStatus('Sending digest…'); digestNow.mutate() }} disabled={digestNow.isPending}>Send digest now</Button>
        </div>
        {status && <p className="text-sm text-ink">{status}</p>}
      </Card>
    </div>
  )
}

// --- The wizard frame ---

function StepDots({ active }: { active: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {STEPS.map((s, i) => (
        <Link
          key={s.slug}
          to={`/setup/${s.slug}`}
          title={s.title}
          className={cn(
            'h-2 rounded-full transition-all',
            i === active ? 'w-6 bg-brand-600' : 'w-2 bg-line hover:bg-brand-300',
          )}
        />
      ))}
    </div>
  )
}

function SetupBoard() {
  const { data: state } = useQuery({ queryKey: ['setup'], queryFn: fetchSetupState })
  const firstIncomplete = STEPS.find((s) => state && !state.areas[s.slug]?.complete)?.slug ?? 'you'
  return (
    <Container width="md" className="space-y-5">
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Setup</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Five steps. Once your CV and engine are in, the rest is optional polish.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step, i) => {
          const area = state?.areas[step.slug]
          return (
            <Link key={step.slug} to={`/setup/${step.slug}`} className="tile tile-interactive min-h-[110px] animate-fade-up">
              <span className="flex w-full items-center justify-between">
                <span className={cn(
                  'grid h-7 w-7 place-items-center rounded-full text-xs font-semibold',
                  area?.complete ? 'bg-green-100 text-green-700' : 'bg-brand-50 text-brand-700',
                )}>
                  {area?.complete ? <Check size={14} /> : i + 1}
                </span>
                {area?.complete && <Badge variant="success">Done</Badge>}
              </span>
              <span className="mt-2 text-sm font-semibold text-ink">{step.title}</span>
              <span className="line-clamp-2 text-xs text-ink-muted">{area?.summary || step.desc}</span>
            </Link>
          )
        })}
        <Link to={`/setup/${firstIncomplete}`} className="tile-dashed min-h-[110px] items-center justify-center gap-1 text-center">
          <Sparkles size={18} className="text-brand-500" />
          <span className="text-sm font-medium text-ink">{state?.usable ? 'Review a step' : 'Continue setup'}</span>
          <span className="text-xs text-ink-muted">{state?.usable ? 'Everything essential is configured' : 'Pick up where you left off'}</span>
        </Link>
      </div>
    </Container>
  )
}

export default function Setup() {
  const { step } = useParams<{ step: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const idx = STEPS.findIndex((s) => s.slug === step)
  const finish = useMutation({
    mutationFn: runAutomationNow,
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['automation'] })
      navigate('/')
    },
  })

  if (!step || idx === -1) return <SetupBoard />

  const meta = STEPS[idx]
  const isLast = idx === STEPS.length - 1

  return (
    <Container width="md" className="space-y-5">
      <StepDots active={idx} />
      <div className="text-center">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Step {idx + 1} of {STEPS.length} — {meta.title}
        </h1>
        <p className="mt-0.5 text-sm text-ink-muted">{meta.desc}</p>
      </div>

      {step === 'you' && <StepYou />}
      {step === 'cv' && <StepCV />}
      {step === 'engine' && <StepEngine />}
      {step === 'sources' && <StepSources />}
      {step === 'automation' && <StepAutomation />}

      <div className="flex items-center justify-between border-t border-line pt-4">
        {idx > 0 ? (
          <Button variant="ghost" onClick={() => navigate(`/setup/${STEPS[idx - 1].slug}`)}>
            <ArrowLeft size={15} /> Back
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => navigate('/setup')}>
            <ArrowLeft size={15} /> All steps
          </Button>
        )}
        {isLast ? (
          <Button variant="primary" onClick={() => finish.mutate()} disabled={finish.isPending}>
            <Sparkles size={15} /> {finish.isPending ? 'Starting…' : 'Finish — run first discovery'}
          </Button>
        ) : (
          <Button variant="primary" onClick={() => navigate(`/setup/${STEPS[idx + 1].slug}`)}>
            Continue <ArrowRight size={15} />
          </Button>
        )}
      </div>
    </Container>
  )
}
