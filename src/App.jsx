import { useEffect, useRef, useState } from 'react'
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser'
import { supabase } from './lib/supabaseClient'
import './App.css'

const API_BASE_URL =
  window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin

const HISTORY_KEY = 'barkod_rapor_history'

const REPORTS = [
  {
    code: 'RAR00032',
    name: 'Inspection Raporu',
  },
  {
    code: 'RAR00033',
    name: 'İş Emri Raporu',
  },
  {
    code: 'RAR00034',
    name: 'Yüzey Kontrol Raporu',
  },
]

function App() {
  const videoRef = useRef(null)
  const scannerControlsRef = useRef(null)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedReportCode, setSelectedReportCode] = useState('')
  const [userProfile, setUserProfile] = useState(null)
  const [barcode, setBarcode] = useState('')
  const [barcodeHistory, setBarcodeHistory] = useState([])
  const [message, setMessage] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')

  const getDeviceName = () => {
    return navigator.userAgent || 'Web Browser'
  }

  const loadBarcodeHistory = () => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY)

      if (!saved) {
        return []
      }

      const parsed = JSON.parse(saved)

      if (!Array.isArray(parsed)) {
        return []
      }

      return parsed.filter((item) => typeof item === 'string' && item.trim() !== '')
    } catch (err) {
      return []
    }
  }

  const saveBarcodeToHistory = (value) => {
    const cleanValue = value ? String(value).trim() : ''

    if (!cleanValue) {
      return
    }

    const currentHistory = loadBarcodeHistory()

    const newHistory = [
      cleanValue,
      ...currentHistory.filter((item) => item !== cleanValue),
    ].slice(0, 10)

    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
    setBarcodeHistory(newHistory)
  }

  const clearBarcodeHistory = () => {
    localStorage.removeItem(HISTORY_KEY)
    setBarcodeHistory([])
  }

  const stopScanner = () => {
    try {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop()
        scannerControlsRef.current = null
      }
    } catch (err) {
      console.log('Scanner stop error:', err)
    }

    setScannerOpen(false)
    setScannerMessage('')
  }

  useEffect(() => {
    setBarcodeHistory(loadBarcodeHistory())
  }, [])

  useEffect(() => {
    if (!userProfile?.id) {
      return
    }

    const checkUserActiveStatus = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, is_active')
          .eq('id', userProfile.id)
          .single()

        if (error || !data) {
          return
        }

        if (data.is_active === false) {
          stopScanner()
          await supabase.auth.signOut()

          setUserProfile(null)
          setUsername('')
          setPassword('')
          setBarcode('')
          setSelectedReportCode('')
          setMessage('Bu kullanıcı pasif yapıldı. Oturum kapatıldı.')
        }
      } catch (err) {
        console.log('Aktiflik kontrol hatası:', err)
      }
    }

    checkUserActiveStatus()

    const intervalId = setInterval(checkUserActiveStatus, 10000)

    return () => clearInterval(intervalId)
  }, [userProfile?.id])

  const startScanner = async () => {
    if (scannerControlsRef.current) {
      stopScanner()
      return
    }

    setMessage('')
    setScannerOpen(true)
    setScannerMessage('Kamera açılıyor...')

    setTimeout(async () => {
      try {
        if (!videoRef.current) {
          setScannerOpen(false)
          setScannerMessage('')
          setMessage('Kamera alanı bulunamadı.')
          return
        }

        const codeReader = new BrowserMultiFormatReader()
        const videoInputDevices = await BrowserCodeReader.listVideoInputDevices()

        let selectedDeviceId = undefined

        if (videoInputDevices && videoInputDevices.length > 0) {
          const backCamera = videoInputDevices.find((device) => {
            const label = device.label || ''
            return /back|rear|environment|arka/i.test(label)
          })

          selectedDeviceId =
            backCamera?.deviceId ||
            videoInputDevices[videoInputDevices.length - 1]?.deviceId
        }

        const controls = await codeReader.decodeFromVideoDevice(
          selectedDeviceId,
          videoRef.current,
          (result, error, controlsFromCallback) => {
            if (result) {
              const scannedText = result.getText()

              setBarcode(scannedText)
              saveBarcodeToHistory(scannedText)
              setMessage(`Barkod okundu: ${scannedText}`)

              try {
                controlsFromCallback.stop()
              } catch (err) {
                console.log('Scanner callback stop error:', err)
              }

              scannerControlsRef.current = null
              setScannerOpen(false)
              setScannerMessage('')
            }
          }
        )

        scannerControlsRef.current = controls
        setScannerMessage('Barkodu kameraya göster.')
      } catch (err) {
        scannerControlsRef.current = null
        setScannerOpen(false)
        setScannerMessage('')
        setMessage('Kamera açılamadı: ' + err.message)
      }
    }, 300)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setMessage('')
    setLoading(true)

    try {
      const cleanUsername = username.trim().toLowerCase()

      if (!cleanUsername || !password) {
        setMessage('Kullanıcı adı ve şifre zorunludur.')
        setLoading(false)
        return
      }

      const hiddenEmail = `${cleanUsername}@app.local`

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: hiddenEmail,
        password: password,
      })

      if (authError) {
        setMessage(`Giriş başarısız: ${authError.message} | Denenen email: ${hiddenEmail}`)
        setLoading(false)
        return
      }

      const userId = authData.user.id

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, is_active')
        .eq('id', userId)
        .single()

      if (profileError || !profileData) {
        await supabase.auth.signOut()
        setMessage('Profil bilgisi bulunamadı.')
        setLoading(false)
        return
      }

      if (profileData.is_active === false) {
        await supabase.auth.signOut()
        setMessage('Bu kullanıcı pasif durumda. Giriş engellendi.')
        setLoading(false)
        return
      }

      await supabase.from('login_logs').insert({
        user_id: userId,
        event_type: 'login',
        device_name: getDeviceName(),
        app_version: 'web-v1.3',
      })

      setUserProfile(profileData)
      setBarcodeHistory(loadBarcodeHistory())
      setMessage('')
    } catch (err) {
      setMessage('Beklenmeyen hata: ' + err.message)
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    stopScanner()

    await supabase.auth.signOut()
    setUserProfile(null)
    setUsername('')
    setPassword('')
    setBarcode('')
    setSelectedReportCode('')
    setMessage('Çıkış yapıldı.')
  }

  const openReport = async (report) => {
    const cleanBarcode = barcode.trim()

    if (!cleanBarcode) {
      setMessage('Önce barkod girilmelidir.')
      return
    }

    saveBarcodeToHistory(cleanBarcode)
    stopScanner()

    const reportWindow = window.open('', '_blank')

    if (reportWindow) {
      reportWindow.document.write(`
        <html>
          <head>
            <title>Rapor Hazırlanıyor</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 30px;
                text-align: center;
                background: #f3f4f6;
              }
              .box {
                background: white;
                padding: 25px;
                border-radius: 16px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12);
              }
            </style>
          </head>
          <body>
            <div class="box">
              <h2>Rapor hazırlanıyor...</h2>
              <p>Lütfen bekleyin.</p>
            </div>
          </body>
        </html>
      `)
    }

    setLoading(true)
    setSelectedReportCode(report.code)
    setMessage(`${report.name} hazırlanıyor...`)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id

      if (!userId) {
        if (reportWindow) reportWindow.close()
        setMessage('Oturum bulunamadı. Tekrar giriş yap.')
        setUserProfile(null)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/report-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          barcode: cleanBarcode,
          reportCode: report.code,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        if (reportWindow) reportWindow.close()
        setMessage('Rapor linki alınamadı: ' + (result.error || 'Bilinmeyen hata'))
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const pdfUrl = result.pdfUrl

      if (!pdfUrl) {
        if (reportWindow) reportWindow.close()
        setMessage('PDF linki boş geldi.')
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const { error: logError } = await supabase.from('report_logs').insert({
        user_id: userId,
        barcode: cleanBarcode,
        report_code: report.code,
        report_name: report.name,
        device_name: getDeviceName(),
        app_version: 'web-v1.3',
      })

      if (logError) {
        if (reportWindow) reportWindow.close()
        setMessage('Rapor log kaydı başarısız: ' + logError.message)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      if (reportWindow) {
        reportWindow.location.href = pdfUrl
      } else {
        window.location.href = pdfUrl
      }

      setMessage(`${report.name} açıldı ve log kaydedildi.`)
    } catch (err) {
      if (reportWindow) reportWindow.close()
      setMessage('Beklenmeyen hata: ' + err.message)
    }

    setLoading(false)
    setSelectedReportCode('')
  }

  if (userProfile) {
    return (
      <div className="page">
        <div className="card">
          <h1>Barkod Rapor Web</h1>

          <p className="success">
            Giriş başarılı: {userProfile.full_name || userProfile.email}
          </p>

          <div className="infoBox">
            <p><strong>Rol:</strong> {userProfile.role}</p>
            <p><strong>Durum:</strong> Aktif</p>
          </div>

          <label>Barkod</label>
          <input
            type="text"
            placeholder="Barkodu gir veya okut"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />

          <button
            type="button"
            className="scanButton"
            onClick={startScanner}
            disabled={loading}
          >
            {scannerOpen ? 'Kamera Açık' : 'Kamerayla Barkod Okut'}
          </button>

          <div className={scannerOpen ? 'scannerBox open' : 'scannerBox'}>
            <video
              ref={videoRef}
              className="scannerVideo"
              muted
              playsInline
            />

            {scannerMessage && (
              <p className="scannerMessage">{scannerMessage}</p>
            )}

            <button
              type="button"
              className="stopScanButton"
              onClick={stopScanner}
            >
              Kamerayı Kapat
            </button>
          </div>

          {barcodeHistory.length > 0 && (
            <div className="historyBox">
              <div className="historyHeader">
                <strong>Son Barkodlar</strong>
                <button
                  type="button"
                  className="clearHistoryButton"
                  onClick={clearBarcodeHistory}
                >
                  Temizle
                </button>
              </div>

              <div className="historyList">
                {barcodeHistory.map((item) => (
                  <button
                    type="button"
                    key={item}
                    className="historyItem"
                    onClick={() => {
                      setBarcode(item)
                      setMessage(`Barkod seçildi: ${item}`)
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="reportButtons">
            {REPORTS.map((report) => (
              <button
                key={report.code}
                className="mainButton"
                onClick={() => openReport(report)}
                disabled={loading}
              >
                {loading && selectedReportCode === report.code
                  ? 'Hazırlanıyor...'
                  : report.name}
              </button>
            ))}
          </div>

          {message && <p className="message">{message}</p>}

          <button className="logoutButton" onClick={handleLogout}>
            Çıkış Yap
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="card">
        <h1>Barkod Rapor Web</h1>
        <p className="subtitle">Kullanıcı adı ve şifre ile giriş yap</p>

        <form onSubmit={handleLogin}>
          <label>Kullanıcı Adı</label>
          <input
            type="text"
            placeholder="Kullanıcı adını gir"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label>Şifre</label>
          <input
            type="password"
            placeholder="Şifreni gir"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" disabled={loading}>
            {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </button>
        </form>

        {message && <p className="message">{message}</p>}
      </div>
    </div>
  )
}

export default App