import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_PDF_ZOOM,
  MIN_PDF_ZOOM,
  PDF_SHARE_CACHE_PATH,
  getPdfShareCachePath,
  isPdfShareCancellation,
  normalizePdfZoom,
  removeCachedPdfFile,
  removeStaleCachedPdfFiles,
} from '../src/lib/pdfViewerUtils.js'

test('native PDF share path preserves the user-facing report filename', () => {
  const fileName = 'Inspection_Raporu_12345.pdf'
  const path = getPdfShareCachePath(fileName, 1780000000000)

  assert.equal(
    path,
    `${PDF_SHARE_CACHE_PATH}/1780000000000/${fileName}`,
  )
  assert.equal(path.split('/').at(-1), fileName)
  assert.equal(
    getPdfShareCachePath('../unsafe.pdf', 1780000000000),
    `${PDF_SHARE_CACHE_PATH}/1780000000000/report.pdf`,
  )
})

test('PDF zoom normalization clamps invalid and extreme values', () => {
  assert.equal(normalizePdfZoom(Number.NaN), MIN_PDF_ZOOM)
  assert.equal(normalizePdfZoom(0.25), MIN_PDF_ZOOM)
  assert.equal(normalizePdfZoom(1.23456), 1.235)
  assert.equal(normalizePdfZoom(99), MAX_PDF_ZOOM)
})

test('cached native PDF is deleted when the plugin supports deleteFile', async () => {
  const calls = []
  const filesystem = {
    async deleteFile(options) {
      calls.push(options)
    },
  }
  const options = { path: 'shared-pdfs/report.pdf', directory: 'CACHE' }

  assert.equal(await removeCachedPdfFile(filesystem, options), true)
  assert.deepEqual(calls, [options])
})

test('cached PDF cleanup stays non-fatal when unsupported or rejected', async () => {
  assert.equal(await removeCachedPdfFile({}, { path: 'x' }), false)
  assert.equal(
    await removeCachedPdfFile(
      { deleteFile: async () => Promise.reject(new Error('busy')) },
      { path: 'x' },
    ),
    false,
  )
})

test('Android share chooser cancellation is not treated as a failure', () => {
  assert.equal(
    isPdfShareCancellation(new Error('Share canceled')),
    true,
  )
  assert.equal(
    isPdfShareCancellation({ name: 'AbortError', message: 'aborted' }),
    true,
  )
  assert.equal(
    isPdfShareCancellation(new Error('Filesystem unavailable')),
    false,
  )
})

test('only stale PDF share cache entries are removed on a later lifecycle', async () => {
  const deletedPaths = []
  const deletedDirectories = []
  const filesystem = {
    async readdir() {
      return {
        files: [
          { name: 'old.pdf', type: 'file', mtime: 100 },
          { name: 'recent.pdf', type: 'file', mtime: 900 },
          { name: '1780000000000', type: 'directory', mtime: 100 },
          { name: '1780000001000', type: 'directory', mtime: 900 },
          { name: '../unsafe.pdf', type: 'file', mtime: 0 },
        ],
      }
    },
    async deleteFile({ path }) {
      deletedPaths.push(path)
    },
    async rmdir(options) {
      deletedDirectories.push(options)
    },
  }

  const result = await removeStaleCachedPdfFiles(filesystem, {
    directory: 'CACHE',
    maxAgeMs: 500,
    now: 1000,
  })

  assert.deepEqual(result, { checked: true, failed: 0, removed: 2 })
  assert.deepEqual(deletedPaths, [`${PDF_SHARE_CACHE_PATH}/old.pdf`])
  assert.deepEqual(deletedDirectories, [
    {
      path: `${PDF_SHARE_CACHE_PATH}/1780000000000`,
      directory: 'CACHE',
      recursive: true,
    },
  ])
})

test('missing share cache directory is a non-fatal cleanup result', async () => {
  const result = await removeStaleCachedPdfFiles(
    {
      async readdir() {
        throw new Error('not found')
      },
      async deleteFile() {},
    },
    { directory: 'CACHE' },
  )

  assert.deepEqual(result, { checked: false, failed: 0, removed: 0 })
})
