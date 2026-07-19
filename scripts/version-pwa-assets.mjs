import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const distDirectory = path.resolve('dist')

const hashContent = (content) => {
  return createHash('sha256').update(content).digest('hex').slice(0, 12)
}

const readAssetHash = async (relativePath) => {
  const content = await readFile(path.join(distDirectory, relativePath))
  return hashContent(content)
}

const replaceVersionedPath = (content, assetPath, version) => {
  const escapedPath = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`${escapedPath}(?:\\?v=[a-f0-9]+)?`, 'g')
  const updatedContent = content.replace(pattern, `${assetPath}?v=${version}`)

  if (updatedContent === content) {
    throw new Error(`PWA asset reference not found: ${assetPath}`)
  }

  return updatedContent
}

const manifestPath = path.join(distDirectory, 'manifest.webmanifest')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const iconVersions = new Map()

for (const icon of manifest.icons || []) {
  const relativePath = String(icon.src || '').split('?')[0].replace(/^\/+/, '')

  if (!relativePath || relativePath.includes('..')) {
    throw new Error(`Invalid PWA icon path: ${icon.src}`)
  }

  const version = await readAssetHash(relativePath)
  icon.src = `/${relativePath}?v=${version}`
  iconVersions.set(relativePath, version)
}

const manifestContent = `${JSON.stringify(manifest, null, 2)}\n`
await writeFile(manifestPath, manifestContent)

const manifestVersion = hashContent(manifestContent)
const faviconVersion = await readAssetHash('favicon.png')
const appleIconVersion = await readAssetHash('apple-touch-icon.png')
const notificationIconVersion = iconVersions.get('app-icon-192.png')

if (!notificationIconVersion) {
  throw new Error('192x192 PWA icon is missing from the manifest')
}

const indexPath = path.join(distDirectory, 'index.html')
let indexContent = await readFile(indexPath, 'utf8')
indexContent = replaceVersionedPath(
  indexContent,
  '/manifest.webmanifest',
  manifestVersion
)
indexContent = replaceVersionedPath(indexContent, '/favicon.png', faviconVersion)
indexContent = replaceVersionedPath(
  indexContent,
  '/apple-touch-icon.png',
  appleIconVersion
)
await writeFile(indexPath, indexContent)

const serviceWorkerPath = path.join(distDirectory, 'sw.js')
let serviceWorkerContent = await readFile(serviceWorkerPath, 'utf8')
serviceWorkerContent = replaceVersionedPath(
  serviceWorkerContent,
  '/app-icon-192.png',
  notificationIconVersion
)
await writeFile(serviceWorkerPath, serviceWorkerContent)

console.log(`PWA assets versioned: ${manifestVersion}`)
