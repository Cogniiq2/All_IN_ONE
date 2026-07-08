import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://lqgtmoulqzmrhglabrms.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZ3Rtb3VscXptcmhnbGFicm1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExOTQ2MTksImV4cCI6MjA5Njc3MDYxOX0.W-u01ZiZCpq5XqnNTpMIVwrq37uEWwn-u_CESG1U_m0'

export const supabase = createClient(
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || SUPABASE_URL,
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || SUPABASE_ANON_KEY,
)
