export const ANDROID_BACK_ACTION = Object.freeze({
  BLOCK: 'block',
  CLOSE_PDF: 'close-pdf',
  CLOSE_DIALOG: 'close-dialog',
  SHOW_MAIN: 'show-main',
  MINIMIZE: 'minimize',
})

export function resolveAndroidBackAction({
  updateBlocked = false,
  pdfOpen = false,
  dialogOpen = false,
  screen = 'main',
  signedIn = false,
} = {}) {
  if (updateBlocked) {
    return ANDROID_BACK_ACTION.BLOCK
  }

  if (pdfOpen) {
    return ANDROID_BACK_ACTION.CLOSE_PDF
  }

  if (dialogOpen) {
    return ANDROID_BACK_ACTION.CLOSE_DIALOG
  }

  if (signedIn && screen !== 'main') {
    return ANDROID_BACK_ACTION.SHOW_MAIN
  }

  return ANDROID_BACK_ACTION.MINIMIZE
}
