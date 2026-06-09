import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

if (typeof Promise.withResolvers !== 'function') {
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: function withResolvers() {
      let resolve
      let reject

      const promise = new Promise((promiseResolve, promiseReject) => {
        resolve = promiseResolve
        reject = promiseReject
      })

      return {
        promise,
        resolve,
        reject,
      }
    },
  })
}

async function startApplication() {
  try {
    const { default: App } = await import('./App.jsx')

    createRoot(document.getElementById('root')).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (error) {
    console.error('Uygulama başlatma hatası:', error)

    const rootElement = document.getElementById('root')

    if (rootElement) {
      rootElement.innerHTML = `
        <div style="
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:24px;
          font-family:Arial,sans-serif;
          background:#ffffff;
          color:#991b1b;
          text-align:center;
        ">
          <div>
            <strong>Uygulama başlatılamadı.</strong>
            <p>Lütfen sayfayı yenileyip tekrar deneyin.</p>
          </div>
        </div>
      `
    }
  }
}

startApplication()