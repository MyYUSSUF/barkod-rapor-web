import assert from 'node:assert/strict'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const projectRoot = new URL('../', import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), 'utf8')
}

test('iOS release configuration targets iPhone and includes APNs entitlements', async () => {
  const [project, entitlements, envExample] = await Promise.all([
    readProjectFile('ios/App/App.xcodeproj/project.pbxproj'),
    readProjectFile('ios/App/App/App.entitlements'),
    readProjectFile('.env.example'),
  ])

  assert.doesNotMatch(project, /TARGETED_DEVICE_FAMILY = "1,2";/)
  assert.equal((project.match(/TARGETED_DEVICE_FAMILY = 1;/g) || []).length, 2)
  assert.equal((project.match(/SUPPORTS_MACCATALYST = NO;/g) || []).length, 2)
  assert.equal(
    (project.match(/SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO;/g) || [])
      .length,
    2,
  )
  assert.equal((project.match(/DEVELOPMENT_TEAM = PWHAK3QZ88;/g) || []).length, 2)
  assert.equal(
    (project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || [])
      .length,
    2,
  )
  assert.match(project, /APS_ENVIRONMENT = development;/)
  assert.match(project, /APS_ENVIRONMENT = production;/)
  assert.match(project, /com\.apple\.Push = \{/)
  assert.match(entitlements, /<key>aps-environment<\/key>/)
  assert.match(entitlements, /<string>\$\(APS_ENVIRONMENT\)<\/string>/)
  assert.match(envExample, /^VITE_IOS_APP_STORE_ID=6799846636$/m)
})

test('support page contains Turkish and English support information', async () => {
  const supportPage = await readProjectFile('public/support.html')

  assert.match(supportPage, /id="turkce"/)
  assert.match(supportPage, /id="english"/)
  assert.match(supportPage, /mailto:/)
  assert.match(supportPage, /\/privacy-policy\.html/)
  assert.match(supportPage, /\/data-deletion\.html/)
})

test('native push migration permits Android and both APNs environments', async () => {
  const migration = await readProjectFile(
    'supabase/migrations/20260810120000_expand_native_push_platforms.sql',
  )

  assert.match(
    migration,
    /check \(platform in \('android', 'ios', 'ios-sandbox'\)\)/,
  )
  assert.match(migration, /validate constraint native_push_subscriptions_platform_check/)
})

test('Xcode Cloud post-clone script and shared scheme are safe and target App', async () => {
  const [script, scheme, guide] = await Promise.all([
    readProjectFile('ios/App/ci_scripts/ci_post_clone.sh'),
    readProjectFile('ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'),
    readProjectFile('docs/ios-xcode-cloud.md'),
  ])

  assert.match(script, /CI_PRIMARY_REPOSITORY_PATH/)
  assert.match(script, /npm ci/)
  assert.match(script, /npm run build:ios/)
  assert.match(script, /\.\/node_modules\/\.bin\/cap sync ios/)
  assert.match(script, /VITE_SUPABASE_URL/)
  assert.doesNotMatch(script, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(scheme, /BlueprintIdentifier = "504EC3031FED79650016851F"/)
  assert.match(scheme, /BlueprintName = "App"/)
  assert.match(guide, /manuel branch tetiklemeli/)
  assert.match(guide, /TestFlight veya App Store dağıtımı/)
})

test('Xcode Cloud script rejects bad inputs and propagates command failures', async (t) => {
  const bashPath = process.platform === 'win32'
    ? join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
    : 'bash'
  const bash = spawnSync(bashPath, ['--version'])
  if (bash.error || bash.status !== 0) {
    t.skip('bash bulunamadı; shell mock testi atlandı')
    return
  }

  const root = await mkdtemp(join(tmpdir(), 'ios-cloud-script-'))
  t.after(async () => rm(root, { recursive: true, force: true }))
  const bin = join(root, 'bin')
  await mkdir(bin)
  await mkdir(join(root, 'ios', 'App', 'App.xcodeproj'), { recursive: true })
  await mkdir(join(root, 'node_modules', '.bin'), { recursive: true })
  await writeFile(join(root, 'package.json'), '{"name": "barkod-rapor-web"}')
  await writeFile(join(root, 'package-lock.json'), '{}')
  const realNode = process.platform === 'win32'
    ? process.execPath.replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`).replace(/\\/g, '/')
    : process.execPath
  await writeFile(join(bin, 'node'), '#!/bin/sh\nif [ "$1" = "-p" ]; then echo 24; exit 0; fi\nexec "$MOCK_REAL_NODE" "$@"\n')
  await writeFile(join(bin, 'brew'), '#!/bin/sh\necho unexpected-brew >> "$MOCK_LOG"\nexit 91\n')
  await writeFile(join(bin, 'npm'), '#!/bin/sh\necho npm >> "$MOCK_LOG"\nexit "${MOCK_NPM_EXIT:-0}"\n')
  await writeFile(join(root, 'node_modules', '.bin', 'cap'), '#!/bin/sh\necho cap >> "$MOCK_LOG"\nexit 0\n')
  await Promise.all([
    chmod(join(bin, 'node'), 0o755),
    chmod(join(bin, 'brew'), 0o755),
    chmod(join(bin, 'npm'), 0o755),
    chmod(join(root, 'node_modules', '.bin', 'cap'), 0o755),
  ])

  const script = fileURLToPath(new URL('../ios/App/ci_scripts/ci_post_clone.sh', import.meta.url))
  const env = {
    ...process.env,
    PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    CI_PRIMARY_REPOSITORY_PATH: root,
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'sb_publishable_safe-test-key',
    MOCK_LOG: join(root, 'commands.log'),
    MOCK_REAL_NODE: realNode,
  }
  const run = (overrides = {}) => spawnSync(bashPath, [script], { env: { ...env, ...overrides }, encoding: 'utf8' })
  const missingEnv = run({ VITE_SUPABASE_URL: '' })
  assert.notEqual(missingEnv.status, 0)
  assert.match(missingEnv.stderr, /ortam değişkenleri eksik/)

  const badRepo = spawnSync(bashPath, [script], { env: { ...env, CI_PRIMARY_REPOSITORY_PATH: join(root, 'missing') }, encoding: 'utf8' })
  assert.notEqual(badRepo.status, 0)
  assert.match(badRepo.stderr, /geçersiz repo kökü/)

  const secret = run({ VITE_SUPABASE_ANON_KEY: 'sb_secret_do-not-print' })
  assert.notEqual(secret.status, 0)
  assert.doesNotMatch(`${secret.stdout}${secret.stderr}`, /sb_secret_do-not-print/)

  const serviceRoleJwt = run({ VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.' })
  assert.notEqual(serviceRoleJwt.status, 0)
  assert.doesNotMatch(`${serviceRoleJwt.stdout}${serviceRoleJwt.stderr}`, /eyJhbGciOiJub25l/)

  const anonJwt = run({ VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYW5vbiJ9.' })
  assert.equal(anonJwt.status, 0)
  await rm(join(root, 'commands.log'), { force: true })

  const failedNpm = run({ MOCK_NPM_EXIT: '7' })
  assert.equal(failedNpm.status, 7)
  assert.equal(existsSync(join(root, 'commands.log')), true)
  const log = await readFile(join(root, 'commands.log'), 'utf8')
  assert.match(log, /^npm$/m)
  assert.doesNotMatch(log, /cap/)
  await rm(join(root, 'commands.log'), { force: true })

  const happy = run()
  assert.equal(happy.status, 0)
  const happyLog = await readFile(join(root, 'commands.log'), 'utf8')
  assert.match(happyLog, /^npm$/m)
  assert.match(happyLog, /^cap$/m)

  const badBin = join(root, 'bad-bin')
  await mkdir(badBin)
  await writeFile(join(badBin, 'node'), '#!/bin/sh\necho 23\n')
  await writeFile(join(badBin, 'brew'), '#!/bin/sh\nexit 9\n')
  await Promise.all([chmod(join(badBin, 'node'), 0o755), chmod(join(badBin, 'brew'), 0o755)])
  const incompatibleNode = run({ PATH: `${badBin}${process.platform === 'win32' ? ';' : ':'}${env.PATH}` })
  assert.equal(incompatibleNode.status, 9)
})
