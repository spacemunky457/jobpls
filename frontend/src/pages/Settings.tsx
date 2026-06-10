import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
import { Check, Plus, Star, Trash2 } from 'lucide-react'
import {
  addRecommendedSources, ApplicantProfile, createSource, deleteCV, deleteProfile, deleteSource, fetchApplicant,
  fetchConfig, fetchCVs, fetchProfiles, fetchSources, saveConfig, sendDigest, setDefaultCV, setDefaultProfile,
  Source, TailoringProfile, MasterCV, testEmail, updateApplicant, updateCV, updateProfile, updateSource, uploadCV,
  createCV, createProfile,
} from '../api/client'
import { listModels, ollamaBaseUrl, ollamaModel } from '../ai/ollamaBrowser'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Input, Textarea, Select } from '../components/ui/Input'
import { Badge } from '../components/ui/Badge'
import { PageHeader } from '../components/layout/PageHeader'

const SECTION_META: Record<string, { title: string; description: string }> = {
  profile: { title: 'Profile', description: 'Your background and preferences used to assess job matches.' },
  applicant: { title: 'Applicant', description: 'Your real details — auto-apply fills these into application forms.' },
  cvs: { title: 'Master CVs', description: 'Upload and manage the CVs your matches and tailoring are based on.' },
  tailoring: { title: 'Tailoring', description: 'Profiles that steer how applications are written.' },
  sources: { title: 'Sources', description: 'Job boards and ATS feeds discovery pulls from.' },
  filters: { title: 'Filters', description: 'Keywords, eligibility and blocklists for ingestion.' },
  ai: { title: 'AI', description: 'Choose the provider that powers match assessment and tailoring.' },
  email: { title: 'Email', description: 'Where digests and input requests are delivered.' },
  scheduler: { title: 'Scheduler', description: 'Automatic background discovery and match assessment.' },
}

const VALID_SECTIONS = new Set(['profile', 'applicant', 'cvs', 'tailoring', 'sources', 'filters', 'ai', 'email', 'scheduler'])

function SettingsSectionHeader({ section }: { section: string }) {
  const meta = SECTION_META[section]
  if (!meta) return null
  return <PageHeader title={meta.title} description={meta.description} />
}

export default function SettingsPage() {
  const { section } = useParams<{ section: string }>()
  if (!section || !VALID_SECTIONS.has(section)) {
    return <Navigate to="/settings/profile" replace />
  }

  return (
    <div className="space-y-6">
      <SettingsSectionHeader section={section} />
      {section === 'profile' && <ProfileTab />}
      {section === 'applicant' && <ApplicantTab />}
      {section === 'cvs' && <CVTab />}
      {section === 'tailoring' && <TailoringTab />}
      {section === 'sources' && <SourcesTab />}
      {section === 'filters' && <FiltersTab />}
      {section === 'ai' && <AITab />}
      {section === 'email' && <EmailTab />}
      {section === 'scheduler' && <SchedulerTab />}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-ink">{label}</label>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      {children}
    </div>
  )
}

function SaveBtn({ onClick, saving, saved }: { onClick: () => void; saving: boolean; saved: boolean }) {
  return <Button variant="primary" onClick={onClick} disabled={saving} className="mt-2">{saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}</Button>
}

function useSavedFlag() {
  const [saved, setSaved] = useState(false)
  return { saved, flash: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) } }
}

function ProfileTab() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [profile, setProfile] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<string | null>(null)
  const { saved, flash } = useSavedFlag()
  const mut = useMutation({
    mutationFn: () => saveConfig({ PROFILE_BLURB: profile ?? cfg?.PROFILE_BLURB ?? '', JOB_PREFERENCES: prefs ?? cfg?.JOB_PREFERENCES ?? '' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); flash() },
  })
  return (
    <Card className="space-y-5">
      <Field label="Profile / background blurb" hint="Used by AI when assessing your match. Your experience, tools, constraints.">
        <Textarea className="h-32" value={profile ?? cfg?.PROFILE_BLURB ?? ''} onChange={(e) => setProfile(e.target.value)} />
      </Field>
      <Field label="Job preferences & nuances" hint="What you're looking for, deal-breakers, niches. The more specific, the better the assessment.">
        <Textarea className="h-40" placeholder="e.g. avoid pure support roles; prefer async teams; open to contractor/EOR; care about AI tooling…"
          value={prefs ?? cfg?.JOB_PREFERENCES ?? ''} onChange={(e) => setPrefs(e.target.value)} />
      </Field>
      <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
    </Card>
  )
}

function ApplicantTab() {
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
    <Card className="space-y-5">
      <p className="text-sm text-ink-muted">
        These are the real details auto-apply types into application forms. Name and email are required before you can apply.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name"><Input value={(val('first_name') as string) || ''} onChange={(e) => set('first_name', e.target.value)} /></Field>
        <Field label="Last name"><Input value={(val('last_name') as string) || ''} onChange={(e) => set('last_name', e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={(val('email') as string) || ''} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Phone"><Input value={(val('phone') as string) || ''} onChange={(e) => set('phone', e.target.value)} placeholder="+90 …" /></Field>
        <Field label="Location"><Input value={(val('location') as string) || ''} onChange={(e) => set('location', e.target.value)} placeholder="Istanbul, Turkey" /></Field>
        <Field label="LinkedIn"><Input value={(val('linkedin') as string) || ''} onChange={(e) => set('linkedin', e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
        <Field label="GitHub"><Input value={(val('github') as string) || ''} onChange={(e) => set('github', e.target.value)} /></Field>
        <Field label="Portfolio / website"><Input value={(val('portfolio') as string) || ''} onChange={(e) => set('portfolio', e.target.value)} /></Field>
      </div>
      <Field label="Work authorization" hint="Shown to forms that ask. e.g. 'Authorized to work in Turkey; require sponsorship for US/EU roles.'">
        <Textarea className="h-20" value={(val('work_authorization') as string) || ''} onChange={(e) => set('work_authorization', e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 cursor-pointer text-sm text-ink">
        <input type="checkbox" checked={Boolean(val('requires_sponsorship'))} onChange={(e) => set('requires_sponsorship', e.target.checked)} className="accent-brand-600" />
        I require visa sponsorship
      </label>
      <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
    </Card>
  )
}

function CVTab() {
  const qc = useQueryClient()
  const { data: cvs = [] } = useQuery({ queryKey: ['cvs'], queryFn: fetchCVs })
  const fileRef = useRef<HTMLInputElement>(null)
  const invalidate = () => qc.invalidateQueries({ queryKey: ['cvs'] })
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
      {cvs.length === 0 && <p className="text-sm text-ink-muted">No CVs yet — upload your master CV to get started.</p>}
      {cvs.map((cv) => <CVEditor key={cv.id} cv={cv} onDefault={() => setDef.mutate(cv.id)} onDelete={() => del.mutate(cv.id)} />)}
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cvs'] }); flash() },
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

function TailoringTab() {
  const qc = useQueryClient()
  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: fetchProfiles })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['profiles'] })
  const create = useMutation({ mutationFn: () => createProfile('New profile', { tone: '', length: 'one page', emphasis: '', extra_instructions: '' }), onSuccess: invalidate })
  const setDef = useMutation({ mutationFn: setDefaultProfile, onSuccess: invalidate })
  const del = useMutation({ mutationFn: deleteProfile, onSuccess: invalidate })
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Tailoring profiles steer how your CV + cover email are written. The default is used when tailoring.</p>
      <Button onClick={() => create.mutate()}><Plus size={14} /> New profile</Button>
      {profiles.map((p) => <ProfileEditor key={p.id} profile={p} onDefault={() => setDef.mutate(p.id)} onDelete={() => del.mutate(p.id)} />)}
    </div>
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
    <Card className="space-y-2">
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
      <Field label="Emphasis"><Input value={opts.emphasis || ''} onChange={(e) => set('emphasis', e.target.value)} placeholder="QA leadership, AI automation" /></Field>
      <Field label="Extra instructions"><Textarea className="h-20" value={opts.extra_instructions || ''} onChange={(e) => set('extra_instructions', e.target.value)} /></Field>
      <SaveBtn onClick={() => save.mutate()} saving={save.isPending} saved={saved} />
    </Card>
  )
}

const SOURCE_TYPES = [
  'remotive', 'remoteok', 'wwr', 'workingnomads', 'arbeitnow', 'themuse', 'linkedin',
  'greenhouse', 'lever', 'ashby', 'jsearch', 'adzuna', 'kariyer', 'yenibiris',
]
const KEYED_SOURCES = ['jsearch', 'adzuna']

function SourcesTab() {
  const qc = useQueryClient()
  const { data: sources = [] } = useQuery({ queryKey: ['sources'], queryFn: fetchSources })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['sources'] })
  const toggle = useMutation({ mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateSource(id, { enabled }), onSuccess: invalidate })
  const del = useMutation({ mutationFn: deleteSource, onSuccess: invalidate })
  const add = useMutation({ mutationFn: (body: Omit<Source, 'id'>) => createSource(body), onSuccess: invalidate })
  const seedDefaults = useMutation({ mutationFn: addRecommendedSources, onSuccess: invalidate })
  const [newType, setNewType] = useState('remotive')
  const [newQuery, setNewQuery] = useState('')
  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-ink-muted">
            For ATS types (greenhouse, lever, ashby) the query is the board slug from the company's careers URL.
            <code className="mx-1">jsearch</code> and <code className="mx-1">adzuna</code> need API keys below; without them they're skipped.
          </p>
          <Button onClick={() => seedDefaults.mutate()} disabled={seedDefaults.isPending} className="shrink-0">
            <Plus size={14} /> {seedDefaults.isPending ? 'Adding…' : seedDefaults.data ? `Added ${seedDefaults.data.added}` : 'Add recommended'}
          </Button>
        </div>
        <div className="divide-y divide-line border border-line rounded-lg overflow-hidden">
          {sources.map((src) => (
            <div key={src.id} className="flex items-center gap-3 px-4 py-3 bg-surface">
              <input type="checkbox" checked={src.enabled} onChange={(e) => toggle.mutate({ id: src.id, enabled: e.target.checked })} className="accent-brand-600" />
              <span className="text-xs text-ink-muted w-28">{src.type}{KEYED_SOURCES.includes(src.type) && <span className="ml-1 text-amber-600">⚿</span>}</span>
              <span className="text-sm flex-1 text-ink">{src.query || <span className="text-ink-muted italic">no query</span>}</span>
              <button onClick={() => del.mutate(src.id)} className="text-ink-muted hover:text-red-600"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <Select value={newType} onChange={(e) => setNewType(e.target.value)} className="w-auto">{SOURCE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
          <Input className="flex-1" value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder="query / slug (optional)" />
          <Button variant="primary" onClick={() => { add.mutate({ type: newType, query: newQuery, enabled: true }); setNewQuery('') }}><Plus size={16} /></Button>
        </div>
      </Card>
      <DiscoveryKeysCard />
    </div>
  )
}

function DiscoveryKeysCard() {
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
    <Card className="space-y-5">
      <div>
        <h3 className="font-medium text-ink">Reach the big boards (Indeed / LinkedIn / Glassdoor)</h3>
        <p className="mt-1 text-sm text-ink-muted">
          These sites have no open API. The reliable, ToS-clean way is an aggregator key.
          <b> JSearch</b> (RapidAPI) pulls Google-for-Jobs results from LinkedIn, Indeed, Glassdoor & ZipRecruiter.
        </p>
      </div>
      <Field label="Default location" hint="Used by linkedin / adzuna / jsearch. e.g. 'Remote', 'Turkey', 'Europe'.">
        <Input value={v('JOB_LOCATION')} onChange={(e) => set('JOB_LOCATION', e.target.value)} placeholder="Remote" />
      </Field>
      <Field label="JSearch (RapidAPI) key" hint="Free tier at rapidapi.com/letscrape/api/jsearch — enables the jsearch source.">
        <Input type="password" value={v('JSEARCH_API_KEY')} onChange={(e) => set('JSEARCH_API_KEY', e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Adzuna app id"><Input value={v('ADZUNA_APP_ID')} onChange={(e) => set('ADZUNA_APP_ID', e.target.value)} /></Field>
        <Field label="Adzuna app key"><Input type="password" value={v('ADZUNA_APP_KEY')} onChange={(e) => set('ADZUNA_APP_KEY', e.target.value)} /></Field>
        <Field label="Adzuna country" hint="2-letter, e.g. gb, us, de"><Input value={v('ADZUNA_COUNTRY', 'gb')} onChange={(e) => set('ADZUNA_COUNTRY', e.target.value)} /></Field>
      </div>
      <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
    </Card>
  )
}

function FiltersTab() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [keywords, setKeywords] = useState<string | null>(null)
  const [eligTypes, setEligTypes] = useState<string | null>(null)
  const [blocklist, setBlocklist] = useState<string | null>(null)
  const { saved, flash } = useSavedFlag()
  const mut = useMutation({
    mutationFn: () => saveConfig({
      KEYWORDS: keywords ?? cfg?.KEYWORDS ?? '',
      ELIGIBLE_TYPES: eligTypes ?? cfg?.ELIGIBLE_TYPES ?? 'global,emea,contractor',
      BLOCKLIST_COMPANIES: blocklist ?? cfg?.BLOCKLIST_COMPANIES ?? '',
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); flash() },
  })
  const ELIG = ['global', 'emea', 'contractor', 'us-only', 'needs-right-to-work', 'unclear']
  const currentElig = (eligTypes ?? cfg?.ELIGIBLE_TYPES ?? 'global,emea,contractor').split(',').map((s) => s.trim())
  return (
    <Card className="space-y-5">
      <Field label="Title keywords" hint="Comma-separated. A job's title must match at least one to be ingested.">
        <Textarea className="h-20" value={keywords ?? cfg?.KEYWORDS ?? ''} onChange={(e) => setKeywords(e.target.value)} />
      </Field>
      <Field label="Eligible location types" hint="Only jobs matching these are flagged eligible for you.">
        <div className="flex flex-wrap gap-3">
          {ELIG.map((e) => (
            <label key={e} className="flex items-center gap-1.5 text-sm cursor-pointer text-ink">
              <input type="checkbox" checked={currentElig.includes(e)}
                onChange={(ev) => setEligTypes((ev.target.checked ? [...currentElig, e] : currentElig.filter((x) => x !== e)).join(','))}
                className="accent-brand-600" />
              {e}
            </label>
          ))}
        </div>
      </Field>
      <Field label="Blocklist companies" hint="Comma-separated company names to skip.">
        <Input value={blocklist ?? cfg?.BLOCKLIST_COMPANIES ?? ''} onChange={(e) => setBlocklist(e.target.value)} />
      </Field>
      <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
    </Card>
  )
}

const PROVIDERS: [string, string][] = [
  ['ollama_browser', 'Local Ollama (runs in your browser)'],
  ['claude_byok', 'Claude API (your own key)'],
  ['claude_managed', 'Claude (managed by us — coming soon)'],
  ['ollama_server', 'Ollama (server-side / self-host)'],
]

function AITab() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [provider, setProvider] = useState<string | null>(null)
  const [claudeKey, setClaudeKey] = useState<string | null>(null)
  const [model, setModel] = useState(ollamaModel())
  const [baseUrl, setBaseUrl] = useState(ollamaBaseUrl())
  const [test, setTest] = useState('')
  const { saved, flash } = useSavedFlag()
  const current = provider ?? cfg?.AI_PROVIDER ?? 'ollama_browser'

  const mut = useMutation({
    mutationFn: () => {
      localStorage.setItem('jobpls_ollama_model', model)
      localStorage.setItem('jobpls_ollama_url', baseUrl)
      return saveConfig({
        AI_PROVIDER: current,
        CLAUDE_API_KEY: claudeKey ?? cfg?.CLAUDE_API_KEY ?? '',
        OLLAMA_MODEL: model,
        OLLAMA_BASE_URL: baseUrl,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); flash() },
  })

  const runTest = async () => {
    setTest('Testing…')
    try { const m = await listModels(); setTest(`Connected. Models: ${m.join(', ') || '(none pulled)'}`) }
    catch (e: unknown) { setTest(`Failed: ${e instanceof Error ? e.message : 'unknown error'} — start Ollama with OLLAMA_ORIGINS=${window.location.origin}`) }
  }

  return (
    <Card className="space-y-5">
      <Field label="AI provider">
        <div className="space-y-2">
          {PROVIDERS.map(([val, label]) => (
            <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-ink">
              <input type="radio" checked={current === val} onChange={() => setProvider(val)} className="accent-brand-600" /> {label}
            </label>
          ))}
        </div>
      </Field>

      {(current === 'ollama_browser' || current === 'ollama_server') && (
        <>
          <Field label="Ollama model" hint="Pull it first, e.g. `ollama pull llama3.2`."><Input value={model} onChange={(e) => setModel(e.target.value)} /></Field>
          <Field label="Ollama base URL"><Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
          {current === 'ollama_browser' && (
            <Card padding="sm" className="text-xs text-ink-muted space-y-2 border border-line shadow-none">
              <p>The browser calls Ollama directly. Start it once allowing this app's origin:</p>
              <pre className="bg-surface-muted rounded p-2 text-ink border border-line">OLLAMA_ORIGINS={typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'} ollama serve</pre>
              <Button onClick={runTest}><Check size={14} /> Test connection</Button>
              {test && <p className="text-ink">{test}</p>}
            </Card>
          )}
        </>
      )}

      {current === 'claude_byok' && (
        <Field label="Claude API key" hint="Stored in your account. Used server-side for scoring/tailoring.">
          <Input type="password" value={claudeKey ?? cfg?.CLAUDE_API_KEY ?? ''} onChange={(e) => setClaudeKey(e.target.value)} />
        </Field>
      )}
      {current === 'claude_managed' && <p className="text-sm text-amber-700">Managed Claude billing isn't enabled yet — use your own key or local Ollama for now.</p>}

      <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
    </Card>
  )
}

const EMAIL_PROVIDERS: [string, string][] = [
  ['console', 'Console (dev — prints to backend log)'],
  ['smtp', 'SMTP / Gmail (send real emails to yourself)'],
  ['resend', 'Resend (API key)'],
]

function EmailTab() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [status, setStatus] = useState('')
  const { saved, flash } = useSavedFlag()
  const v = (k: string, d = '') => (edits[k] !== undefined ? edits[k] : cfg?.[k] ?? d)
  const set = (k: string, val: string) => setEdits((e) => ({ ...e, [k]: val }))
  const provider = v('EMAIL_PROVIDER', 'console')

  const mut = useMutation({
    mutationFn: () => saveConfig(edits),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); setEdits({}); flash() },
  })
  const test = useMutation({
    mutationFn: testEmail,
    onSuccess: (r) => setStatus(`Test email sent to ${r.to}. Check your inbox.`),
    onError: (e: Error & { response?: { data?: { detail?: string } } }) =>
      setStatus(`Failed: ${e?.response?.data?.detail || e?.message || 'unknown error'}`),
  })
  const digest = useMutation({
    mutationFn: sendDigest,
    onSuccess: (r) => setStatus(r.sent ? `Digest sent with ${r.sent} job(s).` : 'No qualifying jobs to send right now.'),
    onError: (e: Error & { response?: { data?: { detail?: string } } }) =>
      setStatus(`Failed: ${e?.response?.data?.detail || e?.message || 'unknown error'}`),
  })

  return (
    <div className="space-y-4">
      <Card className="space-y-5">
        <p className="text-sm text-ink-muted">
          Turn Jobpls into an alert agent: it discovers + assesses jobs, then emails you the matches.
          Save your settings, then send a test email to confirm delivery.
        </p>

        <Field label="Send alerts to" hint="Your real inbox — where digests are delivered. Defaults to your account email if blank.">
          <Input type="email" value={v('DIGEST_EMAIL')} onChange={(e) => set('DIGEST_EMAIL', e.target.value)} placeholder="you@gmail.com" />
        </Field>

        <Field label="Email delivery">
          <Select value={provider} onChange={(e) => set('EMAIL_PROVIDER', e.target.value)} className="w-auto">
            {EMAIL_PROVIDERS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </Select>
        </Field>

        {provider === 'smtp' && (
          <div className="space-y-4 rounded-lg border border-line bg-surface-muted/40 p-4">
            <p className="text-xs text-ink-muted">
              Gmail: host <code>smtp.gmail.com</code>, port <code>587</code>, your address as the username, and a{' '}
              <a className="text-brand-600 hover:underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google App Password</a>{' '}
              (not your normal password — needs 2FA enabled).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SMTP host"><Input value={v('SMTP_HOST', 'smtp.gmail.com')} onChange={(e) => set('SMTP_HOST', e.target.value)} /></Field>
              <Field label="SMTP port"><Input value={v('SMTP_PORT', '587')} onChange={(e) => set('SMTP_PORT', e.target.value)} /></Field>
              <Field label="Username (your email)"><Input value={v('SMTP_USER')} onChange={(e) => set('SMTP_USER', e.target.value)} placeholder="you@gmail.com" /></Field>
              <Field label="App password"><Input type="password" value={v('SMTP_PASSWORD')} onChange={(e) => set('SMTP_PASSWORD', e.target.value)} /></Field>
            </div>
            <Field label="From address" hint="Leave blank to use your username."><Input value={v('EMAIL_FROM')} onChange={(e) => set('EMAIL_FROM', e.target.value)} placeholder="you@gmail.com" /></Field>
          </div>
        )}

        {provider === 'resend' && (
          <div className="space-y-4 rounded-lg border border-line bg-surface-muted/40 p-4">
            <Field label="Resend API key"><Input type="password" value={v('RESEND_API_KEY')} onChange={(e) => set('RESEND_API_KEY', e.target.value)} /></Field>
            <Field label="From address" hint="Must be a verified Resend sender, e.g. onboarding@resend.dev for testing.">
              <Input value={v('EMAIL_FROM')} onChange={(e) => set('EMAIL_FROM', e.target.value)} placeholder="Jobpls <onboarding@resend.dev>" />
            </Field>
          </div>
        )}

        <div className="flex items-center gap-2">
          <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
          <Button onClick={() => { setStatus('Sending test…'); test.mutate() }} disabled={test.isPending} className="mt-2">Send test email</Button>
        </div>
        {status && <p className="text-sm text-ink">{status}</p>}
      </Card>

      <Card className="space-y-5">
        <h3 className="font-medium text-ink">Job-alert digest</h3>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-ink">
          <input type="checkbox" checked={v('DIGEST_ENABLED', 'false') === 'true'}
            onChange={(e) => set('DIGEST_ENABLED', e.target.checked ? 'true' : 'false')} className="accent-brand-600" />
          Email me new matches automatically (every ~24h)
        </label>
        <Field label="Only include jobs at or above this fit tier">
          <Select value={v('DIGEST_MIN_TIER', 'possible')} onChange={(e) => set('DIGEST_MIN_TIER', e.target.value)} className="w-auto">
            <option value="strong">Strong only</option>
            <option value="possible">Possible and up</option>
            <option value="stretch">Stretch and up</option>
          </Select>
        </Field>
        <p className="text-xs text-ink-muted">
          For unattended alerts you need server-side AI (Claude key or self-hosted Ollama) so jobs get assessed automatically.
          On browser-Ollama, the digest still emails fresh keyword-matched jobs for you to assess in the app.
        </p>
        <div className="flex items-center gap-2">
          <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
          <Button onClick={() => { setStatus('Sending digest…'); digest.mutate() }} disabled={digest.isPending} className="mt-2">Send digest now</Button>
        </div>
      </Card>
    </div>
  )
}

function SchedulerTab() {
  const qc = useQueryClient()
  const { data: cfg } = useQuery({ queryKey: ['config'], queryFn: fetchConfig })
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const { saved, flash } = useSavedFlag()
  const current = enabled ?? (cfg?.SCHEDULER_ENABLED !== 'false')
  const mut = useMutation({
    mutationFn: () => saveConfig({ SCHEDULER_ENABLED: current ? 'true' : 'false' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['config'] }); flash() },
  })
  return (
    <Card className="space-y-5">
      <Field label="Automatic background pipeline">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-ink">
          <input type="checkbox" checked={current} onChange={(e) => setEnabled(e.target.checked)} className="accent-brand-600" />
          Run discovery (and server-side match assessment) automatically for my account
        </label>
      </Field>
      <p className="text-xs text-ink-muted">
        Intervals are set system-wide by the operator. Local-Ollama users assess from Review;
        background assessment only applies to Claude / self-hosted-Ollama accounts.
      </p>
      <SaveBtn onClick={() => mut.mutate()} saving={mut.isPending} saved={saved} />
    </Card>
  )
}
