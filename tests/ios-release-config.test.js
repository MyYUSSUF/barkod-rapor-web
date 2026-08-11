import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

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
