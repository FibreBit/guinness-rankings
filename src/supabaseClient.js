import { createClient } from '@supabase/supabase-js'

// Allow local/staging override via Vite env vars; fall back to production defaults for everyone else.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ajcstmlxyleeqgbumlyt.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqY3N0bWx4eWxlZXFnYnVtbHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MTIyMjQsImV4cCI6MjA4NTI4ODIyNH0.vF20BmD2qB3j226xgHyXpo8RMcczCCNI-XybPb3eTUg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
