import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ANDROID_BACK_ACTION,
  resolveAndroidBackAction,
} from '../src/lib/androidBackNavigation.js'

test('zorunlu güncelleme engeli Android geri tuşunu yutuyor', () => {
  assert.equal(
    resolveAndroidBackAction({
      updateBlocked: true,
      pdfOpen: true,
      dialogOpen: true,
      signedIn: true,
      screen: 'admin',
    }),
    ANDROID_BACK_ACTION.BLOCK,
  )
})

test('geri tuşu önce PDF görüntüleyicisini kapatıyor', () => {
  assert.equal(
    resolveAndroidBackAction({ pdfOpen: true, dialogOpen: true }),
    ANDROID_BACK_ACTION.CLOSE_PDF,
  )
})

test('PDF yoksa açık uygulama penceresi kapatılıyor', () => {
  assert.equal(
    resolveAndroidBackAction({ dialogOpen: true, signedIn: true }),
    ANDROID_BACK_ACTION.CLOSE_DIALOG,
  )
})

test('alt ekrandaki oturum kullanıcısı ana ekrana dönüyor', () => {
  assert.equal(
    resolveAndroidBackAction({ signedIn: true, screen: 'admin' }),
    ANDROID_BACK_ACTION.SHOW_MAIN,
  )
})

test('ana ekranda veya girişte uygulama küçültülüyor', () => {
  assert.equal(
    resolveAndroidBackAction({ signedIn: true, screen: 'main' }),
    ANDROID_BACK_ACTION.MINIMIZE,
  )
  assert.equal(
    resolveAndroidBackAction({ signedIn: false, screen: 'main' }),
    ANDROID_BACK_ACTION.MINIMIZE,
  )
})
