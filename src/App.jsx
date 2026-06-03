import { useEffect, useRef, useState } from 'react'
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser'
import { supabase } from './lib/supabaseClient'
import './App.css'

const API_BASE_URL =
  window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin

const HISTORY_KEY = 'barkod_rapor_history'
const LANGUAGE_KEY = 'barkod_rapor_language'
const SESSION_STARTED_AT_KEY = 'barkod_rapor_session_started_at'
const SESSION_MAX_MS = 60 * 60 * 1000

const REPORTS = [
  {
    code: 'RAR00032',
    key: 'inspection',
  },
  {
    code: 'RAR00033',
    key: 'workOrder',
  },
  {
    code: 'RAR00034',
    key: 'surfaceControl',
  },
]

const LANGUAGES = {
  tr: {
    appTitle: 'Barkod Rapor Web',
    appSubtitle: 'Barkod okutma ve rapor görüntüleme sistemi',
    username: 'Kullanıcı Adı',
    usernamePlaceholder: 'Kullanıcı adını gir',
    password: 'Şifre',
    passwordPlaceholder: 'Şifreni gir',
    login: 'Giriş Yap',
    loggingIn: 'Giriş yapılıyor...',
    checkingSession: 'Oturum kontrol ediliyor...',
    welcome: 'Hoş geldiniz',
    role: 'Rol',
    status: 'Durum',
    active: 'Aktif',
    barcode: 'Barkod',
    barcodePlaceholder: 'Barkodu gir veya okut',
    scanBarcode: 'Kamerayla Barkod Okut',
    cameraOpen: 'Kamera Açık',
    closeCamera: 'Kamerayı Kapat',
    cameraOpening: 'Kamera açılıyor...',
    showBarcode: 'Barkodu kameraya göster.',
    cameraAreaMissing: 'Kamera alanı bulunamadı.',
    cameraError: 'Kamera açılamadı: ',
    barcodeRead: 'Barkod okundu',
    recentBarcodes: 'Son Barkodlar',
    clear: 'Temizle',
    selectedBarcode: 'Barkod seçildi',
    logout: 'Çıkış Yap',
    usernamePasswordRequired: 'Kullanıcı adı ve şifre zorunludur.',
    loginFailed: 'Giriş başarısız',
    profileNotFound: 'Profil bilgisi bulunamadı.',
    inactiveBlocked: 'Bu kullanıcı pasif durumda. Giriş engellendi.',
    inactiveAutoLogout: 'Bu kullanıcı pasif yapıldı. Oturum kapatıldı.',
    sessionExpired: 'Oturum süresi doldu. Lütfen tekrar giriş yap.',
    logoutSuccess: 'Çıkış yapıldı.',
    barcodeRequired: 'Önce barkod girilmelidir.',
    reportPreparing: 'hazırlanıyor...',
    sessionMissing: 'Oturum bulunamadı. Tekrar giriş yap.',
    reportUrlFailed: 'Rapor linki alınamadı: ',
    pdfUrlEmpty: 'PDF linki boş geldi.',
    reportLogFailed: 'Rapor log kaydı başarısız: ',
    reportOpened: 'açıldı ve log kaydedildi.',
    unexpectedError: 'Beklenmeyen hata: ',
    inspection: 'Inspection Raporu',
    workOrder: 'İş Emri Raporu',
    surfaceControl: 'Yüzey Kontrol Raporu',
    reportPageTitle: 'Rapor Görüntüleyici',
    reportPagePreparing: 'Rapor hazırlanıyor...',
    pleaseWait: 'Lütfen bekleyin.',
    share: 'Paylaş',
    refresh: 'Yenile',
    close: 'Kapat',
    openPdf: 'PDF Aç',
    shareNotSupported: 'Paylaşım bu tarayıcıda desteklenmiyor.',
    reportCouldNotLoad: 'Rapor yüklenemedi.',
    chooseLanguage: 'Dil',
  },
  en: {
    appTitle: 'Barcode Report Web',
    appSubtitle: 'Barcode scanning and report viewing system',
    username: 'Username',
    usernamePlaceholder: 'Enter username',
    password: 'Password',
    passwordPlaceholder: 'Enter password',
    login: 'Login',
    loggingIn: 'Logging in...',
    checkingSession: 'Checking session...',
    welcome: 'Welcome',
    role: 'Role',
    status: 'Status',
    active: 'Active',
    barcode: 'Barcode',
    barcodePlaceholder: 'Enter or scan barcode',
    scanBarcode: 'Scan Barcode with Camera',
    cameraOpen: 'Camera Open',
    closeCamera: 'Close Camera',
    cameraOpening: 'Opening camera...',
    showBarcode: 'Show the barcode to the camera.',
    cameraAreaMissing: 'Camera area not found.',
    cameraError: 'Camera could not be opened: ',
    barcodeRead: 'Barcode read',
    recentBarcodes: 'Recent Barcodes',
    clear: 'Clear',
    selectedBarcode: 'Barcode selected',
    logout: 'Logout',
    usernamePasswordRequired: 'Username and password are required.',
    loginFailed: 'Login failed',
    profileNotFound: 'Profile information not found.',
    inactiveBlocked: 'This user is inactive. Login blocked.',
    inactiveAutoLogout: 'This user was deactivated. Session closed.',
    sessionExpired: 'Session expired. Please login again.',
    logoutSuccess: 'Logged out.',
    barcodeRequired: 'Barcode is required first.',
    reportPreparing: 'is preparing...',
    sessionMissing: 'Session not found. Please login again.',
    reportUrlFailed: 'Report link could not be received: ',
    pdfUrlEmpty: 'PDF link is empty.',
    reportLogFailed: 'Report log failed: ',
    reportOpened: 'opened and log saved.',
    unexpectedError: 'Unexpected error: ',
    inspection: 'Inspection Report',
    workOrder: 'Work Order Report',
    surfaceControl: 'Surface Control Report',
    reportPageTitle: 'Report Viewer',
    reportPagePreparing: 'Report is preparing...',
    pleaseWait: 'Please wait.',
    share: 'Share',
    refresh: 'Refresh',
    close: 'Close',
    openPdf: 'Open PDF',
    shareNotSupported: 'Sharing is not supported in this browser.',
    reportCouldNotLoad: 'Report could not be loaded.',
    chooseLanguage: 'Language',
  },
  ar: {
    appTitle: 'نظام تقارير الباركود',
    appSubtitle: 'نظام قراءة الباركود وعرض التقارير',
    username: 'اسم المستخدم',
    usernamePlaceholder: 'أدخل اسم المستخدم',
    password: 'كلمة المرور',
    passwordPlaceholder: 'أدخل كلمة المرور',
    login: 'تسجيل الدخول',
    loggingIn: 'جارٍ تسجيل الدخول...',
    checkingSession: 'جارٍ التحقق من الجلسة...',
    welcome: 'أهلاً وسهلاً',
    role: 'الدور',
    status: 'الحالة',
    active: 'نشط',
    barcode: 'الباركود',
    barcodePlaceholder: 'أدخل أو امسح الباركود',
    scanBarcode: 'مسح الباركود بالكاميرا',
    cameraOpen: 'الكاميرا مفتوحة',
    closeCamera: 'إغلاق الكاميرا',
    cameraOpening: 'جارٍ فتح الكاميرا...',
    showBarcode: 'اعرض الباركود أمام الكاميرا.',
    cameraAreaMissing: 'لم يتم العثور على مساحة الكاميرا.',
    cameraError: 'تعذر فتح الكاميرا: ',
    barcodeRead: 'تمت قراءة الباركود',
    recentBarcodes: 'آخر الباركودات',
    clear: 'مسح',
    selectedBarcode: 'تم اختيار الباركود',
    logout: 'تسجيل الخروج',
    usernamePasswordRequired: 'اسم المستخدم وكلمة المرور مطلوبان.',
    loginFailed: 'فشل تسجيل الدخول',
    profileNotFound: 'لم يتم العثور على بيانات الملف الشخصي.',
    inactiveBlocked: 'هذا المستخدم غير نشط. تم منع الدخول.',
    inactiveAutoLogout: 'تم تعطيل هذا المستخدم. تم إغلاق الجلسة.',
    sessionExpired: 'انتهت مدة الجلسة. يرجى تسجيل الدخول مرة أخرى.',
    logoutSuccess: 'تم تسجيل الخروج.',
    barcodeRequired: 'يجب إدخال الباركود أولاً.',
    reportPreparing: 'قيد التحضير...',
    sessionMissing: 'لم يتم العثور على الجلسة. سجّل الدخول مرة أخرى.',
    reportUrlFailed: 'تعذر الحصول على رابط التقرير: ',
    pdfUrlEmpty: 'رابط PDF فارغ.',
    reportLogFailed: 'فشل تسجيل التقرير: ',
    reportOpened: 'تم فتحه وحفظ السجل.',
    unexpectedError: 'خطأ غير متوقع: ',
    inspection: 'تقرير الفحص',
    workOrder: 'تقرير أمر العمل',
    surfaceControl: 'تقرير مراقبة السطح',
    reportPageTitle: 'عارض التقرير',
    reportPagePreparing: 'جارٍ تجهيز التقرير...',
    pleaseWait: 'يرجى الانتظار.',
    share: 'مشاركة',
    refresh: 'تحديث',
    close: 'إغلاق',
    openPdf: 'فتح PDF',
    shareNotSupported: 'المشاركة غير مدعومة في هذا المتصفح.',
    reportCouldNotLoad: 'تعذر تحميل التقرير.',
    chooseLanguage: 'اللغة',
  },
}

function App() {
  const videoRef = useRef(null)
  const scannerControlsRef = useRef(null)

  const [language, setLanguage] = useState(() => {
    return localStorage.getItem(LANGUAGE_KEY) || 'tr'
  })

  const t = LANGUAGES[language]
  const isArabic = language === 'ar'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [restoringSession, setRestoringSession] = useState(true)
  const [selectedReportCode, setSelectedReportCode] = useState('')
  const [userProfile, setUserProfile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [barcodeHistory, setBarcodeHistory] = useState([])
  const [message, setMessage] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')

  const changeLanguage = (value) => {
    setLanguage(value)
    localStorage.setItem(LANGUAGE_KEY, value)
  }

  const getDeviceName = () => {
    return navigator.userAgent || 'Web Browser'
  }

  const isSessionExpired = () => {
    const startedAt = Number(localStorage.getItem(SESSION_STARTED_AT_KEY))

    if (!startedAt) {
      return false
    }

    return Date.now() - startedAt >= SESSION_MAX_MS
  }

  const clearLocalSession = () => {
    localStorage.removeItem(SESSION_STARTED_AT_KEY)
  }

  const resetUserState = () => {
    stopScanner()
    setUserProfile(null)
    setUsername('')
    setPassword('')
    setBarcode('')
    setSelectedReportCode('')
    setDisplayName('')
  }

  const makeDisplayName = (profile, fallbackUsername) => {
    const fullName = profile?.full_name ? String(profile.full_name).trim() : ''

    if (fullName) {
      return fullName
    }

    const email = profile?.email ? String(profile.email).trim() : ''

    if (email.includes('@')) {
      return email.split('@')[0]
    }

    return fallbackUsername || ''
  }

  const getReportName = (report) => {
    return t[report.key] || report.key
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

  function stopScanner() {
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

  const makePdfProxyUrl = (pdfUrl) => {
    return `${window.location.origin}/api/report-pdf?url=${encodeURIComponent(pdfUrl)}`
  }

  const writeReportWindow = (reportWindow, reportName, pdfUrl) => {
    const proxyUrl = `${makePdfProxyUrl(pdfUrl)}#view=Fit&zoom=page-fit&toolbar=0&navpanes=0&scrollbar=1`

    const payload = {
      title: t.reportPageTitle,
      preparing: t.reportPagePreparing,
      pleaseWait: t.pleaseWait,
      share: t.share,
      refresh: t.refresh,
      close: t.close,
      openPdf: t.openPdf,
      shareNotSupported: t.shareNotSupported,
      reportCouldNotLoad: t.reportCouldNotLoad,
      reportName,
      pdfUrl: proxyUrl,
      originalPdfUrl: pdfUrl,
      isArabic,
    }

    reportWindow.document.open()
    reportWindow.document.write(`
      <!doctype html>
      <html lang="${language}" dir="${isArabic ? 'rtl' : 'ltr'}">
        <head>
          <title>${payload.title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              width: 100%;
              height: 100%;
              font-family: Arial, sans-serif;
              background: #f3f4f6;
              color: #111827;
              overflow: hidden;
            }

            .toolbar {
              height: 64px;
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 10px;
              padding: 10px 12px;
              background: #111827;
              color: white;
            }

            .title {
              min-width: 0;
              flex: 1;
            }

            .title strong {
              display: block;
              font-size: 15px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .title span {
              display: block;
              font-size: 12px;
              color: #d1d5db;
              margin-top: 3px;
            }

            .actions {
              display: flex;
              gap: 8px;
              flex-shrink: 0;
            }

            button {
              border: none;
              border-radius: 10px;
              padding: 9px 10px;
              background: white;
              color: #111827;
              font-weight: bold;
              font-size: 13px;
              cursor: pointer;
            }

            .closeBtn {
              background: #dc2626;
              color: white;
            }

            .status {
              position: fixed;
              left: 0;
              right: 0;
              top: 64px;
              z-index: 5;
              padding: 10px;
              text-align: center;
              font-size: 14px;
              color: #374151;
              background: #f3f4f6;
            }

            iframe {
              display: block;
              width: 100%;
              height: calc(100dvh - 64px);
              border: none;
              background: white;
            }

            @media (max-width: 480px) {
              .toolbar {
                height: 106px;
                align-items: flex-start;
                flex-direction: column;
              }

              .actions {
                width: 100%;
              }

              button {
                flex: 1;
                text-align: center;
              }

              .status {
                top: 106px;
              }

              iframe {
                height: calc(100dvh - 106px);
              }
            }
          </style>
        </head>

        <body>
          <div class="toolbar">
            <div class="title">
              <strong>${payload.reportName}</strong>
              <span>${payload.title}</span>
            </div>

            <div class="actions">
              <button id="shareBtn">${payload.share}</button>
              <button id="refreshBtn">${payload.refresh}</button>
              <button id="closeBtn" class="closeBtn">${payload.close}</button>
            </div>
          </div>

          <div id="status" class="status">${payload.preparing} ${payload.pleaseWait}</div>

          <iframe id="pdfFrame" src="${payload.pdfUrl}"></iframe>

          <script>
            const pdfUrl = ${JSON.stringify(payload.pdfUrl)}
            const reportName = ${JSON.stringify(payload.reportName)}
            const shareNotSupported = ${JSON.stringify(payload.shareNotSupported)}
            const reportCouldNotLoad = ${JSON.stringify(payload.reportCouldNotLoad)}

            const statusEl = document.getElementById('status')
            const pdfFrame = document.getElementById('pdfFrame')
            const shareBtn = document.getElementById('shareBtn')
            const refreshBtn = document.getElementById('refreshBtn')
            const closeBtn = document.getElementById('closeBtn')

            pdfFrame.addEventListener('load', () => {
              statusEl.style.display = 'none'
            })

            pdfFrame.addEventListener('error', () => {
              statusEl.textContent = reportCouldNotLoad
              statusEl.style.display = 'block'
            })

            shareBtn.addEventListener('click', async () => {
              try {
                if (navigator.share) {
                  await navigator.share({
                    title: reportName,
                    text: reportName,
                    url: pdfUrl
                  })
                } else {
                  await navigator.clipboard.writeText(pdfUrl)
                  alert(shareNotSupported)
                }
              } catch (err) {
                console.log(err)
              }
            })

            refreshBtn.addEventListener('click', () => {
              statusEl.style.display = 'block'
              statusEl.textContent = ${JSON.stringify(payload.preparing)}
              pdfFrame.src = pdfUrl.split('#')[0] + '&t=' + Date.now() + '#view=Fit&zoom=page-fit&toolbar=0&navpanes=0&scrollbar=1'
            })

            closeBtn.addEventListener('click', () => {
              window.close()
            })
          </script>
        </body>
      </html>
    `)
    reportWindow.document.close()
  }

  useEffect(() => {
    setBarcodeHistory(loadBarcodeHistory())
  }, [])

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data?.session

        if (!session?.user?.id) {
          clearLocalSession()
          setRestoringSession(false)
          return
        }

        let startedAt = Number(localStorage.getItem(SESSION_STARTED_AT_KEY))

        if (!startedAt) {
          startedAt = Date.now()
          localStorage.setItem(SESSION_STARTED_AT_KEY, String(startedAt))
        }

        if (Date.now() - startedAt >= SESSION_MAX_MS) {
          await supabase.auth.signOut()
          clearLocalSession()
          setMessage(t.sessionExpired)
          setRestoringSession(false)
          return
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, is_active')
          .eq('id', session.user.id)
          .single()

        if (profileError || !profileData) {
          await supabase.auth.signOut()
          clearLocalSession()
          setMessage(t.profileNotFound)
          setRestoringSession(false)
          return
        }

        if (profileData.is_active === false) {
          await supabase.auth.signOut()
          clearLocalSession()
          setMessage(t.inactiveBlocked)
          setRestoringSession(false)
          return
        }

        setUserProfile(profileData)
        setDisplayName(makeDisplayName(profileData, ''))
        setBarcodeHistory(loadBarcodeHistory())
      } catch (err) {
        console.log('Oturum geri yükleme hatası:', err)
      }

      setRestoringSession(false)
    }

    restoreSession()
  }, [])

  useEffect(() => {
    if (!userProfile?.id) {
      return
    }

    const checkUserActiveStatus = async () => {
      try {
        if (isSessionExpired()) {
          stopScanner()
          await supabase.auth.signOut()
          clearLocalSession()
          resetUserState()
          setMessage(t.sessionExpired)
          return
        }

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
          clearLocalSession()
          resetUserState()
          setMessage(t.inactiveAutoLogout)
        }
      } catch (err) {
        console.log('Aktiflik kontrol hatası:', err)
      }
    }

    checkUserActiveStatus()

    const intervalId = setInterval(checkUserActiveStatus, 10000)

    return () => clearInterval(intervalId)
  }, [userProfile?.id, language])

  const startScanner = async () => {
    if (scannerControlsRef.current) {
      stopScanner()
      return
    }

    setMessage('')
    setScannerOpen(true)
    setScannerMessage(t.cameraOpening)

    setTimeout(async () => {
      try {
        if (!videoRef.current) {
          setScannerOpen(false)
          setScannerMessage('')
          setMessage(t.cameraAreaMissing)
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
              setMessage(`${t.barcodeRead}: ${scannedText}`)

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
        setScannerMessage(t.showBarcode)
      } catch (err) {
        scannerControlsRef.current = null
        setScannerOpen(false)
        setScannerMessage('')
        setMessage(t.cameraError + err.message)
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
        setMessage(t.usernamePasswordRequired)
        setLoading(false)
        return
      }

      const hiddenEmail = `${cleanUsername}@app.local`

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: hiddenEmail,
        password: password,
      })

      if (authError) {
        setMessage(`${t.loginFailed}: ${authError.message}`)
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
        clearLocalSession()
        setMessage(t.profileNotFound)
        setLoading(false)
        return
      }

      if (profileData.is_active === false) {
        await supabase.auth.signOut()
        clearLocalSession()
        setMessage(t.inactiveBlocked)
        setLoading(false)
        return
      }

      localStorage.setItem(SESSION_STARTED_AT_KEY, String(Date.now()))

      await supabase.from('login_logs').insert({
        user_id: userId,
        event_type: 'login',
        device_name: getDeviceName(),
        app_version: 'web-v1.5',
      })

      setUserProfile(profileData)
      setDisplayName(makeDisplayName(profileData, cleanUsername))
      setBarcodeHistory(loadBarcodeHistory())
      setMessage('')
    } catch (err) {
      setMessage(t.unexpectedError + err.message)
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    stopScanner()

    await supabase.auth.signOut()
    clearLocalSession()
    resetUserState()
    setMessage(t.logoutSuccess)
  }

  const openReport = async (report) => {
    const cleanBarcode = barcode.trim()
    const reportName = getReportName(report)

    if (!cleanBarcode) {
      setMessage(t.barcodeRequired)
      return
    }

    if (isSessionExpired()) {
      await supabase.auth.signOut()
      clearLocalSession()
      resetUserState()
      setMessage(t.sessionExpired)
      return
    }

    saveBarcodeToHistory(cleanBarcode)
    stopScanner()

    const reportWindow = window.open('', '_blank')

    if (reportWindow) {
      reportWindow.document.write(`
        <html>
          <head>
            <title>${t.reportPagePreparing}</title>
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
              <h2>${t.reportPagePreparing}</h2>
              <p>${t.pleaseWait}</p>
            </div>
          </body>
        </html>
      `)
    }

    setLoading(true)
    setSelectedReportCode(report.code)
    setMessage(`${reportName} ${t.reportPreparing}`)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id

      if (!userId) {
        if (reportWindow) reportWindow.close()
        clearLocalSession()
        setMessage(t.sessionMissing)
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
        setMessage(t.reportUrlFailed + (result.error || 'Unknown error'))
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const pdfUrl = result.pdfUrl

      if (!pdfUrl) {
        if (reportWindow) reportWindow.close()
        setMessage(t.pdfUrlEmpty)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const { error: logError } = await supabase.from('report_logs').insert({
        user_id: userId,
        barcode: cleanBarcode,
        report_code: report.code,
        report_name: reportName,
        device_name: getDeviceName(),
        app_version: 'web-v1.5',
      })

      if (logError) {
        if (reportWindow) reportWindow.close()
        setMessage(t.reportLogFailed + logError.message)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      if (reportWindow) {
        writeReportWindow(reportWindow, reportName, pdfUrl)
      } else {
        window.location.href = makePdfProxyUrl(pdfUrl)
      }

      setMessage(`${reportName} ${t.reportOpened}`)
    } catch (err) {
      if (reportWindow) reportWindow.close()
      setMessage(t.unexpectedError + err.message)
    }

    setLoading(false)
    setSelectedReportCode('')
  }

  if (restoringSession) {
    return (
      <div className="page" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="card">
          <div className="topBar">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />
          </div>

          <h1>{t.appTitle}</h1>
          <p className="subtitle">{t.checkingSession}</p>
        </div>
      </div>
    )
  }

  if (userProfile) {
    return (
      <div className="page" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="card">
          <div className="topBar">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />

            <select
              className="languageSelect"
              value={language}
              onChange={(e) => changeLanguage(e.target.value)}
            >
              <option value="tr">Türkçe</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>

          <div className="welcomeBox">
            <h1>{t.welcome}, {displayName}</h1>
            <p>{t.appSubtitle}</p>
          </div>

          <div className="infoBox">
            <p><strong>{t.role}:</strong> {userProfile.role}</p>
            <p><strong>{t.status}:</strong> {t.active}</p>
          </div>

          <label>{t.barcode}</label>
          <input
            type="text"
            placeholder={t.barcodePlaceholder}
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
          />

          <button
            type="button"
            className="scanButton"
            onClick={startScanner}
            disabled={loading}
          >
            {scannerOpen ? t.cameraOpen : t.scanBarcode}
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
              {t.closeCamera}
            </button>
          </div>

          {barcodeHistory.length > 0 && (
            <div className="historyBox">
              <div className="historyHeader">
                <strong>{t.recentBarcodes}</strong>
                <button
                  type="button"
                  className="clearHistoryButton"
                  onClick={clearBarcodeHistory}
                >
                  {t.clear}
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
                      setMessage(`${t.selectedBarcode}: ${item}`)
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
                  ? `${getReportName(report)} ${t.reportPreparing}`
                  : getReportName(report)}
              </button>
            ))}
          </div>

          {message && <p className="message">{message}</p>}

          <button className="logoutButton" onClick={handleLogout}>
            {t.logout}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="card">
        <div className="topBar">
          <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />

          <select
            className="languageSelect"
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>

        <h1>{t.appTitle}</h1>
        <p className="subtitle">{t.appSubtitle}</p>

        <form onSubmit={handleLogin}>
          <label>{t.username}</label>
          <input
            type="text"
            placeholder={t.usernamePlaceholder}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label>{t.password}</label>
          <input
            type="password"
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" disabled={loading}>
            {loading ? t.loggingIn : t.login}
          </button>
        </form>

        {message && <p className="message">{message}</p>}
      </div>
    </div>
  )
}

export default App