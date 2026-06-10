import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '/api' })

// Attach the JWT on every request.
api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('jobpls_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// On 401, drop the token so the app falls back to the login screen.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) localStorage.removeItem('jobpls_token')
    return Promise.reject(err)
  },
)

export default api

// --- Types ---
export interface User { id: string; email: string; created_at: string }

export interface Job {
  id: number; source: string; company: string; title: string; location: string; url: string
  jd_text: string | null; match: number | null; tier: string | null; eligibility: string | null
  verdict: string | null; strengths: string | null; gaps: string | null
  status: string; approved: boolean; added_at: string
}
export interface Source { id: number; type: string; query: string; enabled: boolean }
export interface Stats { total: number; new: number; assessed: number; approved: number; drafted: number; applied: number }
export interface PipelineResult { success: boolean; message: string; count: number }
export interface Application { id: number; job_id: number; cv_text: string; email_draft: string; applied_at: string; notes: string }
export interface MasterCV { id: number; name: string; content: string; is_default: boolean; updated_at: string }
export interface TailoringProfile { id: number; name: string; options: Record<string, string>; is_default: boolean }
export interface InputRequest { id: number; job_id: number | null; type: string; prompt: string; status: string; token: string; created_at: string }
export interface PreparedTask { job_id: number; prompt: string }
export interface ApplicantProfile {
  first_name: string; last_name: string; email: string; phone: string; location: string
  linkedin: string; github: string; portfolio: string; work_authorization: string
  requires_sponsorship: boolean; extra_answers: Record<string, string>
}
export interface ApplyResult { job_id: number; method: string; state: string; detail: string; trace?: string[] }
export interface ApplyBatchResult { submitted: number; failed: number; skipped: number; results: ApplyResult[] }

// --- Auth ---
export const signup = (email: string, password: string) =>
  api.post<{ access_token: string }>('/auth/signup', { email, password }).then((r) => r.data)
export const login = (email: string, password: string) =>
  api.post<{ access_token: string }>('/auth/login', { email, password }).then((r) => r.data)
export const fetchMe = () => api.get<User>('/auth/me').then((r) => r.data)

// --- Jobs ---
export const fetchJobs = (params?: Record<string, string | number | boolean>) =>
  api.get<Job[]>('/jobs', { params }).then((r) => r.data)
export const fetchStats = () => api.get<Stats>('/jobs/stats').then((r) => r.data)
export const setApproval = (id: number, approved: boolean) =>
  api.patch(`/jobs/${id}/approve`, { approved }).then((r) => r.data)
export const setApprovalBatch = (ids: number[], approved: boolean) =>
  api.patch<{ updated: number; approved: boolean }>('/jobs/batch/approve', { ids, approved }).then((r) => r.data)
export const setStatus = (id: number, status: string) =>
  api.patch(`/jobs/${id}/status`, { status }).then((r) => r.data)
export const deleteJob = (id: number) => api.delete(`/jobs/${id}`)
export const fetchApplication = (jobId: number) =>
  api.get<Application>(`/jobs/${jobId}/application`).then((r) => r.data)
export const updateApplication = (jobId: number, body: Partial<Application>) =>
  api.put<Application>(`/jobs/${jobId}/application`, body).then((r) => r.data)
// Fetch the CV through axios so the bearer token is attached, then trigger a
// client-side download. A plain <a href> would navigate without the JWT → 401.
export const downloadApplication = async (jobId: number) => {
  const res = await api.get(`/jobs/${jobId}/application/download`, { responseType: 'blob' })
  const cd: string = res.headers['content-disposition'] || ''
  const match = /filename="?([^"]+)"?/.exec(cd)
  const filename = match ? match[1] : `CV_${jobId}.txt`
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// --- Sources ---
export const fetchSources = () => api.get<Source[]>('/sources').then((r) => r.data)
export const createSource = (body: Omit<Source, 'id'>) => api.post<Source>('/sources', body).then((r) => r.data)
export const updateSource = (id: number, body: Partial<Source>) => api.patch<Source>(`/sources/${id}`, body).then((r) => r.data)
export const deleteSource = (id: number) => api.delete(`/sources/${id}`)
export const addRecommendedSources = () => api.post<{ added: number }>('/sources/seed-defaults').then((r) => r.data)

// --- Config ---
export const fetchConfig = () => api.get<Record<string, string>>('/config').then((r) => r.data)
export const saveConfig = (updates: Record<string, string>) =>
  api.put<Record<string, string>>('/config', { updates }).then((r) => r.data)

// --- Master CVs ---
export const fetchCVs = () => api.get<MasterCV[]>('/cv').then((r) => r.data)
export const createCV = (name: string, content: string) => api.post<MasterCV>('/cv', { name, content }).then((r) => r.data)
export const updateCV = (id: number, body: Partial<MasterCV>) => api.put<MasterCV>(`/cv/${id}`, body).then((r) => r.data)
export const setDefaultCV = (id: number) => api.post<MasterCV>(`/cv/${id}/default`).then((r) => r.data)
export const deleteCV = (id: number) => api.delete(`/cv/${id}`)
export const uploadCV = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return api.post<MasterCV>('/cv/upload', form).then((r) => r.data)
}

// --- Tailoring profiles ---
export const fetchProfiles = () => api.get<TailoringProfile[]>('/tailoring-profiles').then((r) => r.data)
export const createProfile = (name: string, options: Record<string, string>) =>
  api.post<TailoringProfile>('/tailoring-profiles', { name, options }).then((r) => r.data)
export const updateProfile = (id: number, body: { name?: string; options?: Record<string, string> }) =>
  api.put<TailoringProfile>(`/tailoring-profiles/${id}`, body).then((r) => r.data)
export const setDefaultProfile = (id: number) => api.post<TailoringProfile>(`/tailoring-profiles/${id}/default`).then((r) => r.data)
export const deleteProfile = (id: number) => api.delete(`/tailoring-profiles/${id}`)

// --- Pipeline (server-side) ---
export const runDiscover = () => api.post<PipelineResult>('/pipeline/discover').then((r) => r.data)
export const runAssess = () => api.post<PipelineResult>('/pipeline/assess').then((r) => r.data)
export const runApprovals = () => api.post<PipelineResult>('/pipeline/process-approvals').then((r) => r.data)

// --- Pipeline (browser-driven Ollama) ---
export const prepareAssess = (limit = 20) =>
  api.get<PreparedTask[]>('/pipeline/assess/batch', { params: { limit } }).then((r) => r.data)
export const ingestAssessments = (results: { job_id: number; raw: string }[]) =>
  api.post<PipelineResult>('/pipeline/assess/results', { results }).then((r) => r.data)
export const prepareTailor = () => api.get<PreparedTask[]>('/pipeline/tailor/batch').then((r) => r.data)
export const ingestTailor = (results: { job_id: number; raw: string }[]) =>
  api.post<PipelineResult>('/pipeline/tailor/results', { results }).then((r) => r.data)

// --- Applicant profile + auto-apply ---
export const fetchApplicant = () => api.get<ApplicantProfile>('/applicant').then((r) => r.data)
export const updateApplicant = (body: Partial<ApplicantProfile>) =>
  api.put<ApplicantProfile>('/applicant', body).then((r) => r.data)
export const applyJob = (jobId: number, opts?: { headless?: boolean; autosubmit?: boolean }) =>
  api.post<ApplyResult>(`/apply/${jobId}`, null, { params: opts }).then((r) => r.data)
export const applyBatch = () => api.post<ApplyBatchResult>('/apply/batch').then((r) => r.data)
export const fetchApplyAttempts = (jobId: number) =>
  api.get<ApplyResult[]>(`/apply/${jobId}/attempts`).then((r) => r.data)

// --- Requests (human-in-the-loop) ---
export const fetchRequests = () => api.get<InputRequest[]>('/requests').then((r) => r.data)
export const createRequest = (type: string, job_id: number | null, prompt: string) =>
  api.post<InputRequest>('/requests', { type, job_id, prompt }).then((r) => r.data)
export const sendDigest = () => api.post<{ sent: number }>('/requests/digest').then((r) => r.data)
export const testEmail = () => api.post<{ ok: boolean; to: string }>('/requests/test-email').then((r) => r.data)
export const viewPublicRequest = (token: string) =>
  api.get<{ type: string; prompt: string; status: string; job_title?: string; job_company?: string }>(`/public/respond/${token}`).then((r) => r.data)
export const respondPublic = (token: string, response: string) =>
  api.post(`/public/respond/${token}`, { response }).then((r) => r.data)
