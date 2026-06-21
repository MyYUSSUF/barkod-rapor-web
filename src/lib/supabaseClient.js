import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

function createMissingConfigClient() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error('Supabase ayarlari eksik. .env dosyasina VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY ekleyin.')
      },
    },
  )
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMissingConfigClient()
