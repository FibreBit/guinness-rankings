import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ajcstmlxyleeqgbumlyt.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFqY3N0bWx4eWxlZXFnYnVtbHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MTIyMjQsImV4cCI6MjA4NTI4ODIyNH0.vF20BmD2qB3j226xgHyXpo8RMcczCCNI-XybPb3eTUg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
