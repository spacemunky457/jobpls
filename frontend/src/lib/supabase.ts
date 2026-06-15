import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// null when env vars are absent (local dev with AUTH_MODE=dev)
export const supabase = url && key ? createClient(url, key) : null
