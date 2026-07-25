import test from 'node:test'
import assert from 'node:assert/strict'
import {
  confirmBarcodeCandidate,
  getContainedMediaRect,
  isBarcodeCenteredInFrame,
} from './scannerValidation.js'

test('contain ölçüsünde görüntünün ekrandaki yerini doğru hesaplar', () => {
  assert.deepEqual(
    getContainedMediaRect(
      { left: 10, top: 20, width: 400, height: 400 },
      1920,
      1080
    ),
    {
      left: 10,
      top: 107.5,
      width: 400,
      height: 225,
      right: 410,
      bottom: 332.5,
      scale: 400 / 1920,
    }
  )
})

test('yalnızca görüntülenen barkodun merkezi çerçevedeyken kabul eder', () => {
  const common = {
    sourceWidth: 1920,
    sourceHeight: 1080,
    videoRect: { left: 0, top: 0, width: 400, height: 400 },
    frameRect: { left: 40, top: 150, width: 320, height: 100 },
  }

  assert.equal(
    isBarcodeCenteredInFrame({
      ...common,
      points: [
        { x: 500, y: 540 },
        { x: 1420, y: 540 },
      ],
    }),
    true
  )

  assert.equal(
    isBarcodeCenteredInFrame({
      ...common,
      points: [
        { x: 300, y: 100 },
        { x: 900, y: 100 },
      ],
    }),
    false
  )
})

test('aynı barkod kısa aralıkta ikinci kez görülünce doğrular', () => {
  const first = confirmBarcodeCandidate(null, 'K197588', 1000)
  const second = confirmBarcodeCandidate(first.candidate, 'K197588', 1450)
  const late = confirmBarcodeCandidate(first.candidate, 'K197588', 2300)
  const different = confirmBarcodeCandidate(first.candidate, 'K197589', 1450)

  assert.equal(first.confirmed, false)
  assert.equal(second.confirmed, true)
  assert.equal(late.confirmed, false)
  assert.equal(different.confirmed, false)
})
