const productionVariableNames = [
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const localHostnames = new Set(['127.0.0.1', 'localhost', '::1'])

function value(env, name) {
  return String(env[name] || '').trim()
}

export function assertSafeTestEnvironment(env = process.env) {
  if (value(env, 'ELVAN_TEST_MODE') !== '1') {
    throw new Error('ELVAN_TEST_MODE=1 olmadan test veritabanı kullanılmaz.')
  }

  const loadedProductionVariables = productionVariableNames.filter((name) => value(env, name))
  if (loadedProductionVariables.length > 0) {
    throw new Error('Üretim Supabase değişkenleri yüklüyken test durduruldu.')
  }

  const testUrl = value(env, 'SUPABASE_TEST_URL')
  const testAnonKey = value(env, 'SUPABASE_TEST_ANON_KEY')
  if (!testUrl || !testAnonKey) {
    throw new Error('SUPABASE_TEST_URL ve SUPABASE_TEST_ANON_KEY gerekir.')
  }

  let parsedUrl
  try {
    parsedUrl = new URL(testUrl)
  } catch {
    throw new Error('SUPABASE_TEST_URL geçerli bir URL olmalıdır.')
  }

  if (parsedUrl.protocol !== 'http:' || !localHostnames.has(parsedUrl.hostname)) {
    throw new Error('Test Supabase yalnız yerel HTTP adresinde çalışabilir.')
  }

  return { url: parsedUrl.toString() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { url } = assertSafeTestEnvironment()
  console.log(`Yerel test ortamı doğrulandı: ${url}`)
}
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
