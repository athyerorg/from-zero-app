import { createClient } from '@supabase/supabase-js'

// Both values come from .env.local (see .env.example). They are public by design:
// the "publishable" key only works through Row Level Security rules on the database.
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_KEY

export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null
