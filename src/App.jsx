import { Fragment, useEffect, useRef, useState } from 'react'
import { BrowserCodeReader, BrowserMultiFormatReader } from '@zxing/browser'
import { supabase } from './lib/supabaseClient'
import PdfViewer from './PdfViewer'
import './App.css'

const API_BASE_URL =
  window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin

const HISTORY_KEY = 'barkod_rapor_history'
const LANGUAGE_KEY = 'barkod_rapor_language'
const NOTIFICATION_PERMISSION_ASKED_KEY = 'barkod_rapor_notification_permission_asked_v2'
const REPORT_TIMEOUT_MS = 45000
const APP_VERSION = 'v1.18'
const APP_LOG_VERSION = 'web-v1.18'

const REPORTS = [
  {
    code: 'RAR00032',
    key: 'inspection',
    requiresBarcode: true,
  },
  {
    code: 'RAR00033',
    key: 'workOrder',
    requiresBarcode: true,
  },
  {
    code: 'RAR00034',
    key: 'surfaceControl',
    requiresBarcode: true,
  },
  {
    code: 'RAR00035',
    key: 'fixingWaiting',
    requiresBarcode: false,
  },
  {
    code: 'RAR00036',
    key: 'shipmentTracking',
    requiresBarcode: false,
    requiresDateRange: true,
    customerCode: '61002',
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
    barcode: 'Barkod',
    barcodePlaceholder: 'Barkodu gir veya okut',
    clearBarcode: 'Temizle',
    scanBarcode: 'Kamerayla Barkod Okut',
    cameraOpen: 'Kamera Açık',
    closeCamera: 'Kamerayı Kapat',
    cameraOpening: 'Kamera açılıyor...',
    alignBarcode: 'Barkodu çerçevenin içine hizalayın.',
    cameraHint: 'Net okuma için barkodu ışık alan yerde, çerçeveye paralel tutun.',
    cameraAreaMissing: 'Kamera alanı bulunamadı.',
    cameraError: 'Kamera açılamadı: ',
    barcodeRead: 'Barkod okundu',
    recentBarcodes: 'Son Barkodlar',
    clear: 'Temizle',
    selectedBarcode: 'Barkod seçildi',
    logout: 'Çıkış Yap',
    logoutConfirm: 'Çıkış yapmak istediğinize emin misiniz?',
    usernamePasswordRequired: 'Kullanıcı adı ve şifre zorunludur.',
    loginFailed: 'Giriş başarısız',
    profileNotFound: 'Profil bilgisi bulunamadı.',
    inactiveBlocked: 'Bu kullanıcı pasif durumda. Giriş engellendi.',
    inactiveAutoLogout: 'Bu kullanıcı pasif yapıldı. Oturum kapatıldı.',
    logoutSuccess: 'Çıkış yapıldı.',
    barcodeRequired: 'Önce barkod girilmelidir.',
    dateRangeRequired: 'Başlangıç tarihi ve bitiş tarihi zorunludur.',
    selectDateRange: 'Sevkiyat Takip için tarih aralığını seçin.',
    reportPreparing: 'hazırlanıyor...',
    reportRequestTimeout: 'Rapor hazırlanması çok uzun sürdü. Lütfen tekrar deneyin.',
    sessionMissing: 'Oturum bulunamadı. Tekrar giriş yap.',
    reportUrlFailed: 'Rapor linki alınamadı: ',
    pdfUrlEmpty: 'PDF linki boş geldi.',
    reportLogFailed: 'Rapor log kaydı başarısız: ',
    reportOpened: 'açıldı ve log kaydedildi.',
    unexpectedError: 'Beklenmeyen hata: ',
    inspection: 'Inspection Raporu',
    workOrder: 'İş Emri Raporu',
    surfaceControl: 'Yüzey Kontrol Raporu',
    fixingWaiting: 'Fikse Bekleyenler',
    shipmentTracking: 'Sevkiyat Takip',
    startDate: 'Başlangıç Tarihi',
    endDate: 'Bitiş Tarihi',
    reportPagePreparing: 'Rapor hazırlanıyor...',
    pleaseWait: 'Lütfen bekleyin.',
    openPdf: 'PDF’i Aç',
    sharePdf: 'PDF Olarak Paylaş',
    close: 'Kapat',
    pdfPreparing: 'PDF hazırlanıyor...',
    pdfFetchFailed: 'PDF alınamadı.',
    shareFailed: 'Paylaşım yapılamadı.',
    shareNotSupported: 'PDF paylaşımı desteklenmiyor. Link kopyalandı.',
    reportCouldNotLoad: 'Rapor yüklenemedi.',
    versionText: 'Barkod Rapor Web',
    notificationUnsupported: 'Bu cihaz veya tarayıcı bildirimleri desteklemiyor.',
    notificationDenied: 'Bildirim izni verilmedi.',
    notificationKeyMissing: 'Bildirim anahtarı eksik. Vercel ayarlarını kontrol edin.',
    notificationSaved: 'Bildirimler açıldı. Bu cihaza bildirim gelebilir.',
    notificationError: 'Bildirim açılırken hata oluştu: ',
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
    barcode: 'Barcode',
    barcodePlaceholder: 'Enter or scan barcode',
    clearBarcode: 'Clear',
    scanBarcode: 'Scan Barcode with Camera',
    cameraOpen: 'Camera Open',
    closeCamera: 'Close Camera',
    cameraOpening: 'Opening camera...',
    alignBarcode: 'Align the barcode inside the frame.',
    cameraHint: 'For clear scanning, keep the barcode parallel to the frame in good light.',
    cameraAreaMissing: 'Camera area not found.',
    cameraError: 'Camera could not be opened: ',
    barcodeRead: 'Barcode read',
    recentBarcodes: 'Recent Barcodes',
    clear: 'Clear',
    selectedBarcode: 'Barcode selected',
    logout: 'Logout',
    logoutConfirm: 'Are you sure you want to logout?',
    usernamePasswordRequired: 'Username and password are required.',
    loginFailed: 'Login failed',
    profileNotFound: 'Profile information not found.',
    inactiveBlocked: 'This user is inactive. Login blocked.',
    inactiveAutoLogout: 'This user was deactivated. Session closed.',
    logoutSuccess: 'Logged out.',
    barcodeRequired: 'Barcode is required first.',
    dateRangeRequired: 'Start date and end date are required.',
    selectDateRange: 'Select a date range for Shipment Tracking.',
    reportPreparing: 'is preparing...',
    reportRequestTimeout: 'Report preparation took too long. Please try again.',
    sessionMissing: 'Session not found. Please login again.',
    reportUrlFailed: 'Report link could not be received: ',
    pdfUrlEmpty: 'PDF link is empty.',
    reportLogFailed: 'Report log failed: ',
    reportOpened: 'opened and log saved.',
    unexpectedError: 'Unexpected error: ',
    inspection: 'Inspection Report',
    workOrder: 'Work Order Report',
    surfaceControl: 'Surface Control Report',
    fixingWaiting: 'Fixing Waiting List',
    shipmentTracking: 'Shipment Tracking',
    startDate: 'Start Date',
    endDate: 'End Date',
    reportPagePreparing: 'Report is preparing...',
    pleaseWait: 'Please wait.',
    openPdf: 'Open PDF',
    sharePdf: 'Share as PDF',
    close: 'Close',
    pdfPreparing: 'Preparing PDF...',
    pdfFetchFailed: 'PDF could not be received.',
    shareFailed: 'Sharing failed.',
    shareNotSupported: 'PDF sharing is not supported. Link copied.',
    reportCouldNotLoad: 'Report could not be loaded.',
    versionText: 'Barcode Report Web',
    notificationUnsupported: 'This device or browser does not support notifications.',
    notificationDenied: 'Notification permission was not granted.',
    notificationKeyMissing: 'Notification key is missing. Check Vercel settings.',
    notificationSaved: 'Notifications enabled. This device can receive notifications.',
    notificationError: 'Notification setup failed: ',
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
    barcode: 'الباركود',
    barcodePlaceholder: 'أدخل أو امسح الباركود',
    clearBarcode: 'مسح',
    scanBarcode: 'مسح الباركود بالكاميرا',
    cameraOpen: 'الكاميرا مفتوحة',
    closeCamera: 'إغلاق الكاميرا',
    cameraOpening: 'جارٍ فتح الكاميرا...',
    alignBarcode: 'ضع الباركود داخل الإطار.',
    cameraHint: 'للقراءة بوضوح، اجعل الباركود موازيًا للإطار وفي إضاءة جيدة.',
    cameraAreaMissing: 'لم يتم العثور على مساحة الكاميرا.',
    cameraError: 'تعذر فتح الكاميرا: ',
    barcodeRead: 'تمت قراءة الباركود',
    recentBarcodes: 'آخر الباركودات',
    clear: 'مسح',
    selectedBarcode: 'تم اختيار الباركود',
    logout: 'تسجيل الخروج',
    logoutConfirm: 'هل أنت متأكد أنك تريد تسجيل الخروج؟',
    usernamePasswordRequired: 'اسم المستخدم وكلمة المرور مطلوبان.',
    loginFailed: 'فشل تسجيل الدخول',
    profileNotFound: 'لم يتم العثور على بيانات الملف الشخصي.',
    inactiveBlocked: 'هذا المستخدم غير نشط. تم منع الدخول.',
    inactiveAutoLogout: 'تم تعطيل هذا المستخدم. تم إغلاق الجلسة.',
    logoutSuccess: 'تم تسجيل الخروج.',
    barcodeRequired: 'يجب إدخال الباركود أولاً.',
    dateRangeRequired: 'تاريخ البداية وتاريخ النهاية مطلوبان.',
    selectDateRange: 'اختر نطاق التاريخ لتتبع الشحنات.',
    reportPreparing: 'قيد التحضير...',
    reportRequestTimeout: 'استغرق تجهيز التقرير وقتًا طويلاً. يرجى المحاولة مرة أخرى.',
    sessionMissing: 'لم يتم العثور على الجلسة. سجّل الدخول مرة أخرى.',
    reportUrlFailed: 'تعذر الحصول على رابط التقرير: ',
    pdfUrlEmpty: 'رابط PDF فارغ.',
    reportLogFailed: 'فشل تسجيل التقرير: ',
    reportOpened: 'تم فتحه وحفظ السجل.',
    unexpectedError: 'خطأ غير متوقع: ',
    inspection: 'تقرير الفحص',
    workOrder: 'تقرير أمر العمل',
    surfaceControl: 'تقرير مراقبة السطح',
    fixingWaiting: 'قائمة انتظار التثبيت',
    shipmentTracking: 'متابعة الشحن',
    startDate: 'تاريخ البداية',
    endDate: 'تاريخ النهاية',
    reportPagePreparing: 'جارٍ تجهيز التقرير...',
    pleaseWait: 'يرجى الانتظار.',
    openPdf: 'فتح PDF',
    sharePdf: 'مشاركة كملف PDF',
    close: 'إغلاق',
    pdfPreparing: 'جارٍ تجهيز PDF...',
    pdfFetchFailed: 'تعذر الحصول على PDF.',
    shareFailed: 'تعذرت المشاركة.',
    shareNotSupported: 'مشاركة PDF غير مدعومة. تم نسخ الرابط.',
    reportCouldNotLoad: 'تعذر تحميل التقرير.',
    versionText: 'نظام تقارير الباركود',
    notificationUnsupported: 'هذا الجهاز أو المتصفح لا يدعم الإشعارات.',
    notificationDenied: 'لم يتم السماح بالإشعارات.',
    notificationKeyMissing: 'مفتاح الإشعارات غير موجود. تحقق من إعدادات Vercel.',
    notificationSaved: 'تم تفعيل الإشعارات. يمكن لهذا الجهاز استقبال الإشعارات.',
    notificationError: 'حدث خطأ أثناء تفعيل الإشعارات: ',
  },
}

const escapeHtml = (value) => {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const fetchWithTimeout = async (url, options = {}, timeoutMs = REPORT_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

const cleanVapidPublicKey = (value) => {
  return String(value || '')
    .replace('Public Key:', '')
    .replace('Public key:', '')
    .replace('PUBLIC KEY:', '')
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replaceAll(' ', '')
    .replaceAll('\n', '')
    .replaceAll('\r', '')
    .replaceAll('=', '')
    .trim()
}

const getVapidPublicKey = () => {
  return cleanVapidPublicKey(import.meta.env.VITE_VAPID_PUBLIC_KEY)
}

const urlBase64ToUint8Array = (base64String) => {
  const cleanBase64String = cleanVapidPublicKey(base64String)
  const padding = '='.repeat((4 - (cleanBase64String.length % 4)) % 4)
  const base64 = (cleanBase64String + padding)
    .replaceAll('-', '+')
    .replaceAll('_', '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray
}

const formatDateTime = (value) => {
  if (!value) {
    return '-'
  }

  try {
    return new Intl.DateTimeFormat('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch (err) {
    return value
  }
}

const tableWrapStyle = {
  width: '100%',
  overflowX: 'auto',
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  marginTop: '12px',
}

const tableStyle = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '13px',
}

const thStyle = {
  textAlign: 'left',
  padding: '10px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f9fafb',
  color: '#17324d',
  whiteSpace: 'nowrap',
}

const tdStyle = {
  padding: '10px',
  borderBottom: '1px solid #f3f4f6',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
}

const adminGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: '12px',
  marginTop: '14px',
}

const statBoxStyle = {
  border: '1px solid #e5e7eb',
  borderRadius: '16px',
  padding: '14px',
  background: '#ffffff',
}

const smallButtonStyle = {
  padding: '9px 12px',
  border: 'none',
  borderRadius: '10px',
  color: '#ffffff',
  fontWeight: 800,
  cursor: 'pointer',
  marginRight: '6px',
  marginTop: '4px',
}

function App() {
  const videoRef = useRef(null)
  const scannerControlsRef = useRef(null)
  const scannerResultHandledRef = useRef(false)

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
  const [dateRangeReportCode, setDateRangeReportCode] = useState('')
  const [userProfile, setUserProfile] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [barcodeHistory, setBarcodeHistory] = useState([])
  const [message, setMessage] = useState('')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [screen, setScreen] = useState('main')
  const [pdfViewerData, setPdfViewerData] = useState(null)

  const [adminNotificationTitle, setAdminNotificationTitle] = useState('Elvan Barkod Rapor')
  const [adminNotificationBody, setAdminNotificationBody] = useState('')
  const [adminNotificationSending, setAdminNotificationSending] = useState(false)
  const [adminNotificationMessage, setAdminNotificationMessage] = useState('')

  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [adminData, setAdminData] = useState({
    users: [],
    loginLogs: [],
    reportLogs: [],
    subscriptionCount: 0,
  })

  const changeLanguage = (value) => {
    setLanguage(value)
    localStorage.setItem(LANGUAGE_KEY, value)
  }

  const getDeviceName = () => {
    return navigator.userAgent || 'Web Browser'
  }

  function stopScanner(options = {}) {
    const { keepResultHandled = false } = options

    try {
      if (scannerControlsRef.current) {
        scannerControlsRef.current.stop()
        scannerControlsRef.current = null
      }
    } catch (err) {
      console.log('Scanner stop error:', err)
    }

    try {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((track) => track.stop())
        videoRef.current.srcObject = null
      }
    } catch (err) {
      console.log('Camera stream stop error:', err)
    }

    if (!keepResultHandled) {
      scannerResultHandledRef.current = false
    }

    setScannerOpen(false)
    setScannerMessage('')
  }

  const resetUserState = () => {
    stopScanner()
    setUserProfile(null)
    setUsername('')
    setPassword('')
    setBarcode('')
    setStartDate('')
    setEndDate('')
    setDateRangeReportCode('')
    setSelectedReportCode('')
    setDisplayName('')
    setNotificationsEnabled(false)
    setAdminNotificationBody('')
    setAdminNotificationMessage('')
    setAdminMessage('')
    setScreen('main')
    setPdfViewerData(null)
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

  const getReportMeta = (report) => {
    if (report.requiresDateRange) {
      return `${t.startDate} / ${t.endDate}`
    }

    if (report.requiresBarcode) {
      return t.barcode
    }

    return report.code
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

  const clearBarcodeInput = () => {
    setBarcode('')
    setMessage('')
  }

  const makePdfProxyUrl = (pdfUrl) => {
    return `${window.location.origin}/api/report-pdf?url=${encodeURIComponent(pdfUrl)}`
  }

  const sanitizePdfFileName = (value) => {
    return String(value || 'report')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'report'
  }

  const canUseNotifications = () => {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  }

  const registerPushSubscription = async (userId, options = {}) => {
    const { forceRenew = false, showMessage = false } = options

    try {
      if (!canUseNotifications()) {
        if (showMessage) {
          setMessage(t.notificationUnsupported)
        }
        return false
      }

      if (Notification.permission !== 'granted') {
        return false
      }

      const publicKey = getVapidPublicKey()

      if (!publicKey) {
        if (showMessage) {
          setMessage(t.notificationKeyMissing)
        }
        return false
      }

      const applicationServerKey = urlBase64ToUint8Array(publicKey)

      if (applicationServerKey.length !== 65) {
        throw new Error(`Public Key uzunluğu geçersiz. Beklenen 65 byte, gelen ${applicationServerKey.length} byte.`)
      }

      await navigator.serviceWorker.register('/sw.js')
      const readyRegistration = await navigator.serviceWorker.ready

      let subscription = await readyRegistration.pushManager.getSubscription()

      if (subscription && forceRenew) {
        const oldEndpoint = subscription.endpoint

        try {
          await subscription.unsubscribe()
        } catch (unsubscribeError) {
          console.log('Eski bildirim aboneliği iptal edilemedi:', unsubscribeError)
        }

        if (oldEndpoint) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', oldEndpoint)
        }

        subscription = null
      }

      if (!subscription) {
        subscription = await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      }

      const subscriptionJson = subscription.toJSON()

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            user_id: userId,
            endpoint: subscription.endpoint,
            subscription: subscriptionJson,
            user_agent: getDeviceName(),
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'endpoint',
          }
        )

      if (error) {
        throw new Error(error.message)
      }

      setNotificationsEnabled(true)

      if (showMessage) {
        setMessage(t.notificationSaved)
      }

      return true
    } catch (err) {
      if (showMessage) {
        setMessage(t.notificationError + err.message)
      } else {
        console.log('Bildirim kaydı hatası:', err)
      }

      return false
    }
  }

  const requestNotificationPermissionOnce = async () => {
    try {
      if (!canUseNotifications()) {
        return 'unsupported'
      }

      if (Notification.permission === 'granted') {
        return 'granted'
      }

      if (Notification.permission === 'denied') {
        localStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, 'true')
        return 'denied'
      }

      const alreadyAsked = localStorage.getItem(NOTIFICATION_PERMISSION_ASKED_KEY)

      if (alreadyAsked === 'true') {
        return Notification.permission
      }

      localStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, 'true')
      const permission = await Notification.requestPermission()

      return permission
    } catch (err) {
      console.log('Bildirim izni isteme hatası:', err)
      return 'error'
    }
  }

  const getAccessToken = async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    return sessionData?.session?.access_token || ''
  }

  const loadAdminPanelData = async () => {
    setAdminLoading(true)
    setAdminMessage('')

    try {
      const accessToken = await getAccessToken()

      if (!accessToken) {
        setAdminMessage(t.sessionMissing)
        setAdminLoading(false)
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/admin-panel`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Admin panel verisi alınamadı.')
      }

      setAdminData({
        users: result.users || [],
        loginLogs: result.loginLogs || [],
        reportLogs: result.reportLogs || [],
        subscriptionCount: result.subscriptionCount || 0,
      })
    } catch (err) {
      setAdminMessage(err.message)
    }

    setAdminLoading(false)
  }

  const openAdminPanel = async () => {
    setScreen('admin')
    await loadAdminPanelData()
  }

  const updateAdminUser = async (userId, patch) => {
    setAdminMessage('')

    try {
      const accessToken = await getAccessToken()

      if (!accessToken) {
        setAdminMessage(t.sessionMissing)
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/admin-panel`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          userId,
          ...patch,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Kullanıcı güncellenemedi.')
      }

      setAdminMessage('Kullanıcı güncellendi.')
      await loadAdminPanelData()
    } catch (err) {
      setAdminMessage(err.message)
    }
  }

  const sendAdminNotification = async () => {
    setAdminNotificationMessage('')
    setAdminNotificationSending(true)

    try {
      const cleanTitle = adminNotificationTitle.trim() || 'Elvan Barkod Rapor'
      const cleanBody = adminNotificationBody.trim()

      if (!cleanBody) {
        setAdminNotificationMessage('Bildirim mesajı boş olamaz.')
        setAdminNotificationSending(false)
        return
      }

      const accessToken = await getAccessToken()

      if (!accessToken) {
        setAdminNotificationMessage(t.sessionMissing)
        setAdminNotificationSending(false)
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: cleanTitle,
          body: cleanBody,
          url: '/',
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Bildirim gönderilemedi.')
      }

      setAdminNotificationMessage(
        `Bildirim gönderildi. Başarılı: ${result.sent || 0}, Başarısız: ${result.failed || 0}, Toplam: ${result.total || 0}`
      )
      setAdminNotificationBody('')
    } catch (err) {
      setAdminNotificationMessage('Bildirim gönderilemedi: ' + err.message)
    }

    setAdminNotificationSending(false)
  }

  const writeReportStatusWindow = (reportWindow, title, detail, type = 'loading') => {
    if (!reportWindow) {
      return
    }

    const safeTitle = escapeHtml(title)
    const safeDetail = escapeHtml(detail)
    const safeClose = escapeHtml(t.close)
    const isError = type === 'error'

    reportWindow.document.open()
    reportWindow.document.write(`
      <!doctype html>
      <html lang="${language}" dir="${isArabic ? 'rtl' : 'ltr'}">
        <head>
          <title>${safeTitle}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { box-sizing: border-box; }

            body {
              margin: 0;
              min-height: 100vh;
              font-family: Arial, sans-serif;
              background: #ffffff;
              color: #111827;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }

            .box {
              width: 100%;
              max-width: 440px;
              background: white;
              border: 1px solid #e5e7eb;
              border-radius: 22px;
              padding: 24px;
              box-shadow: 0 18px 50px rgba(17, 24, 39, 0.14);
              text-align: center;
            }

            .loader {
              width: 46px;
              height: 46px;
              margin: 0 auto 18px;
              border-radius: 999px;
              border: 5px solid #e5e7eb;
              border-top-color: ${isError ? '#b91c1c' : '#17324d'};
              animation: spin 1s linear infinite;
            }

            .errorIcon {
              width: 48px;
              height: 48px;
              margin: 0 auto 18px;
              border-radius: 999px;
              background: #fee2e2;
              color: #b91c1c;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 28px;
              font-weight: 900;
            }

            h2 {
              margin: 0 0 10px;
              font-size: 22px;
              color: #17324d;
            }

            p {
              margin: 0;
              color: #6b7280;
              line-height: 1.45;
              word-break: break-word;
              white-space: pre-line;
            }

            button {
              display: block;
              width: 100%;
              margin-top: 18px;
              padding: 15px;
              border: none;
              border-radius: 15px;
              background: #b91c1c;
              color: white;
              font-size: 16px;
              font-weight: 900;
              cursor: pointer;
            }

            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          </style>
        </head>

        <body>
          <div class="box">
            ${isError ? '<div class="errorIcon">!</div>' : '<div class="loader"></div>'}
            <h2>${safeTitle}</h2>
            <p>${safeDetail}</p>
            ${
              isError
                ? `<button onclick="window.close()">${safeClose}</button>`
                : ''
            }
          </div>
        </body>
      </html>
    `)
    reportWindow.document.close()
  }

  const writeShareWindow = (reportWindow, reportName, pdfUrl, barcodeValue) => {
    const safeReportName = sanitizePdfFileName(reportName)
    const safeBarcode = sanitizePdfFileName(barcodeValue || 'Barkodsuz')
    const pdfFileName = `${safeReportName}_${safeBarcode}.pdf`

    const pdfFileUrl =
      `${makePdfProxyUrl(pdfUrl)}&filename=${encodeURIComponent(pdfFileName)}`

    if (!reportWindow) {
      window.location.href = pdfFileUrl
      return
    }

    reportWindow.document.open()
    reportWindow.document.write(`
      <!doctype html>
      <html lang="${language}" dir="${isArabic ? 'rtl' : 'ltr'}">
        <head>
          <title>${escapeHtml(reportName)}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            * { box-sizing: border-box; }

            body {
              margin: 0;
              min-height: 100vh;
              font-family: Arial, sans-serif;
              background: #ffffff;
              color: #111827;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }

            .box {
              width: 100%;
              max-width: 430px;
              background: white;
              border: 1px solid #e5e7eb;
              border-radius: 22px;
              padding: 24px;
              box-shadow: 0 18px 50px rgba(17, 24, 39, 0.14);
              text-align: center;
            }

            .badge {
              display: inline-block;
              margin-bottom: 12px;
              padding: 8px 12px;
              border-radius: 999px;
              background: #f3f4f6;
              color: #17324d;
              font-size: 12px;
              font-weight: 900;
            }

            h2 {
              margin: 0 0 8px;
              font-size: 22px;
              color: #17324d;
            }

            p {
              margin: 0 0 20px;
              color: #6b7280;
              line-height: 1.45;
              word-break: break-word;
            }

            button,
            a {
              display: block;
              width: 100%;
              margin-top: 12px;
              padding: 15px;
              border: none;
              border-radius: 15px;
              color: white;
              font-size: 16px;
              font-weight: 900;
              text-decoration: none;
              cursor: pointer;
            }

            .openBtn { background: #17324d; }
            .shareBtn { background: #0f766e; }
            .closeBtn { background: #b91c1c; }

            .status {
              min-height: 20px;
              margin-top: 14px;
              font-weight: 900;
              color: #b91c1c;
              line-height: 1.4;
            }
          </style>
        </head>

        <body>
          <div class="box">
            <span class="badge">PDF</span>
            <h2>${escapeHtml(reportName)}</h2>
            <p>${escapeHtml(pdfFileName)}</p>

            <a class="openBtn" href="${pdfFileUrl}" target="_blank" rel="noopener">
              ${escapeHtml(t.openPdf)}
            </a>

            <button id="shareBtn" class="shareBtn">
              ${escapeHtml(t.sharePdf)}
            </button>

            <button id="closeBtn" class="closeBtn">
              ${escapeHtml(t.close)}
            </button>

            <div id="status" class="status"></div>
          </div>

          <script>
            const pdfFileUrl = ${JSON.stringify(pdfFileUrl)}
            const pdfFileName = ${JSON.stringify(pdfFileName)}
            const reportName = ${JSON.stringify(reportName)}
            const pdfPreparing = ${JSON.stringify(t.pdfPreparing)}
            const pdfFetchFailed = ${JSON.stringify(t.pdfFetchFailed)}
            const shareFailed = ${JSON.stringify(t.shareFailed)}
            const shareNotSupported = ${JSON.stringify(t.shareNotSupported)}

            const shareBtn = document.getElementById('shareBtn')
            const closeBtn = document.getElementById('closeBtn')
            const statusEl = document.getElementById('status')

            shareBtn.addEventListener('click', async () => {
              try {
                statusEl.textContent = pdfPreparing

                const response = await fetch(pdfFileUrl)

                if (!response.ok) {
                  throw new Error(pdfFetchFailed + ' HTTP ' + response.status)
                }

                const blob = await response.blob()
                const file = new File([blob], pdfFileName, {
                  type: 'application/pdf'
                })

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                  await navigator.share({
                    title: reportName,
                    text: pdfFileName,
                    files: [file]
                  })

                  statusEl.textContent = ''
                } else if (navigator.share) {
                  await navigator.share({
                    title: reportName,
                    text: pdfFileName,
                    url: pdfFileUrl
                  })

                  statusEl.textContent = ''
                } else {
                  await navigator.clipboard.writeText(pdfFileUrl)
                  statusEl.textContent = shareNotSupported
                }
              } catch (err) {
                statusEl.textContent = err.message || shareFailed
              }
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
    return () => {
      stopScanner()
    }
  }, [])

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const session = data?.session

        if (!session?.user?.id) {
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
          setMessage(t.profileNotFound)
          setRestoringSession(false)
          return
        }

        if (profileData.is_active === false) {
          await supabase.auth.signOut()
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

  useEffect(() => {
    if (!userProfile?.id) {
      return
    }

    if (!canUseNotifications()) {
      return
    }

    if (Notification.permission === 'granted') {
      registerPushSubscription(userProfile.id, {
        forceRenew: false,
        showMessage: false,
      })
    }
  }, [userProfile?.id])

  const improveCameraTrack = async () => {
    try {
      const stream = videoRef.current?.srcObject

      if (!stream) {
        return
      }

      const track = stream.getVideoTracks()[0]

      if (!track || !track.getCapabilities || !track.applyConstraints) {
        return
      }

      const capabilities = track.getCapabilities()
      const advanced = []

      if (
        capabilities.focusMode &&
        Array.isArray(capabilities.focusMode) &&
        capabilities.focusMode.includes('continuous')
      ) {
        advanced.push({ focusMode: 'continuous' })
      }

      if (advanced.length > 0) {
        await track.applyConstraints({ advanced })
      }
    } catch (err) {
      console.log('Camera improve skipped:', err)
    }
  }

  const startScanner = async () => {
    if (scannerControlsRef.current || scannerOpen) {
      stopScanner()
      return
    }

    setMessage('')
    setScannerOpen(true)
    setScannerMessage(t.cameraOpening)
    scannerResultHandledRef.current = false

    setTimeout(async () => {
      try {
        if (!videoRef.current) {
          setScannerOpen(false)
          setScannerMessage('')
          setMessage(t.cameraAreaMissing)
          return
        }

        const codeReader = new BrowserMultiFormatReader()

        const handleScanResult = (result, error, controlsFromCallback) => {
          if (!result || scannerResultHandledRef.current) {
            return
          }

          scannerResultHandledRef.current = true

          const scannedText = result.getText()

          setBarcode(scannedText)
          saveBarcodeToHistory(scannedText)
          setMessage(`${t.barcodeRead}: ${scannedText}`)

          if (navigator.vibrate) {
            navigator.vibrate([120, 50, 120])
          }

          try {
            if (controlsFromCallback) {
              controlsFromCallback.stop()
            }
          } catch (err) {
            console.log('Scanner callback stop error:', err)
          }

          scannerControlsRef.current = null
          stopScanner({ keepResultHandled: true })
        }

        const constraints = {
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        }

        let controls

        try {
          controls = await codeReader.decodeFromConstraints(
            constraints,
            videoRef.current,
            handleScanResult
          )
        } catch (constraintError) {
          console.log('decodeFromConstraints failed, trying device list:', constraintError)

          const videoInputDevices = await BrowserCodeReader.listVideoInputDevices()
          let selectedDeviceId = undefined

          if (videoInputDevices && videoInputDevices.length > 0) {
            const backCamera = videoInputDevices.find((device) => {
              const label = device.label || ''
              return /back|rear|environment|arka|camera 0/i.test(label)
            })

            selectedDeviceId =
              backCamera?.deviceId ||
              videoInputDevices[videoInputDevices.length - 1]?.deviceId
          }

          controls = await codeReader.decodeFromVideoDevice(
            selectedDeviceId,
            videoRef.current,
            handleScanResult
          )
        }

        scannerControlsRef.current = controls
        setScannerMessage(t.alignBarcode)

        setTimeout(() => {
          improveCameraTrack()
        }, 700)
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

      const notificationPermission = await requestNotificationPermissionOnce()
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
        setMessage(t.profileNotFound)
        setLoading(false)
        return
      }

      if (profileData.is_active === false) {
        await supabase.auth.signOut()
        setMessage(t.inactiveBlocked)
        setLoading(false)
        return
      }

      await supabase.from('login_logs').insert({
        user_id: userId,
        event_type: 'login',
        device_name: getDeviceName(),
        app_version: APP_LOG_VERSION,
      })

      setUserProfile(profileData)
      setDisplayName(makeDisplayName(profileData, cleanUsername))
      setBarcodeHistory(loadBarcodeHistory())
      setMessage('')

      if (notificationPermission === 'granted') {
        await registerPushSubscription(userId, {
          forceRenew: true,
          showMessage: false,
        })
      }
    } catch (err) {
      setMessage(t.unexpectedError + err.message)
    }

    setLoading(false)
  }

  const handleLogout = async () => {
    const confirmed = window.confirm(t.logoutConfirm)

    if (!confirmed) {
      return
    }

    stopScanner()

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id || userProfile?.id

      if (userId) {
        await supabase.from('login_logs').insert({
          user_id: userId,
          event_type: 'logout',
          device_name: getDeviceName(),
          app_version: APP_LOG_VERSION,
        })
      }
    } catch (err) {
      console.log('Çıkış log kaydı hatası:', err)
    }

    await supabase.auth.signOut()
    resetUserState()
    setMessage(t.logoutSuccess)
  }

  const openReport = async (report) => {
    const cleanBarcode = barcode.trim()
    const reportName = getReportName(report)
    const requiresBarcode = report.requiresBarcode !== false
    const requiresDateRange = report.requiresDateRange === true
    const cleanStartDate = startDate.trim()
    const cleanEndDate = endDate.trim()

    if (requiresBarcode && !cleanBarcode) {
      setMessage(t.barcodeRequired)
      return
    }

    if (requiresDateRange && dateRangeReportCode !== report.code) {
      setDateRangeReportCode(report.code)
      setMessage(t.selectDateRange)
      return
    }

    if (requiresDateRange && (!cleanStartDate || !cleanEndDate)) {
      setDateRangeReportCode(report.code)
      setMessage(t.dateRangeRequired)
      return
    }

    if (!requiresDateRange) {
      setDateRangeReportCode('')
    }

    if (cleanBarcode) {
      saveBarcodeToHistory(cleanBarcode)
    }

    stopScanner()
    setLoading(true)
    setSelectedReportCode(report.code)
    setMessage(`${reportName} ${t.reportPreparing}`)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id

      if (!userId) {
        setMessage(t.sessionMissing)
        setUserProfile(null)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/report-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          barcode: requiresBarcode ? cleanBarcode : '',
          reportCode: report.code,
          requiresBarcode,
          startDate: requiresDateRange ? cleanStartDate : undefined,
          endDate: requiresDateRange ? cleanEndDate : undefined,
          customerCode: requiresDateRange ? report.customerCode : undefined,
        }),
      })

      const responseText = await response.text()
      let result = {}

      try {
        result = JSON.parse(responseText)
      } catch (err) {
        result = {
          error: responseText || 'Unknown error',
        }
      }

      if (!response.ok) {
        setMessage(
          t.reportUrlFailed +
          (result.error || 'Unknown error') +
          ` (${report.code}${cleanBarcode ? ' - ' + cleanBarcode : ''})`
        )

        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const pdfUrl = result.pdfUrl

      if (!pdfUrl) {
        setMessage(
          `${t.pdfUrlEmpty} (${report.code}${cleanBarcode ? ' - ' + cleanBarcode : ''})`
        )

        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const { error: logError } = await supabase.from('report_logs').insert({
        user_id: userId,
        barcode: requiresDateRange ? 'Tarihli' : (cleanBarcode || 'Barkodsuz'),
        report_code: report.code,
        report_name: reportName,
        device_name: getDeviceName(),
        app_version: APP_LOG_VERSION,
      })

      if (logError) {
        setMessage(t.reportLogFailed + logError.message)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const safeReportName = sanitizePdfFileName(reportName)
      const safeBarcode = sanitizePdfFileName(
        requiresDateRange
          ? `${cleanStartDate}_${cleanEndDate}`
          : (cleanBarcode || 'Barkodsuz')
      )
      const pdfFileName = `${safeReportName}_${safeBarcode}.pdf`

      setPdfViewerData({
        pdfUrl:
          `${makePdfProxyUrl(pdfUrl)}&filename=${encodeURIComponent(pdfFileName)}`,
        fileName: pdfFileName,
        reportName,
      })

      setMessage('')
    } catch (err) {
      const errorText =
        err.name === 'AbortError'
          ? `${t.reportRequestTimeout} (${report.code}${cleanBarcode ? ' - ' + cleanBarcode : ''})`
          : `${t.unexpectedError}${err.message}`

      setMessage(errorText)
    }

    setLoading(false)
    setSelectedReportCode('')
  }

  const activeReport = selectedReportCode
    ? REPORTS.find((report) => report.code === selectedReportCode)
    : null

  if (pdfViewerData) {
    return (
      <PdfViewer
        pdfUrl={pdfViewerData.pdfUrl}
        fileName={pdfViewerData.fileName}
        reportName={pdfViewerData.reportName}
        language={language}
        onClose={() => setPdfViewerData(null)}
      />
    )
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

  if (userProfile && screen === 'admin' && userProfile.role === 'admin') {
    return (
      <div className="page" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="card" style={{ maxWidth: '980px' }}>
          <div className="topBar">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />

            <button
              type="button"
              className="clearBarcodeButton"
              onClick={() => setScreen('main')}
            >
              Ana Ekrana Dön
            </button>
          </div>

          <div className="welcomeBox">
            <span className="eyebrow">YÖNETİCİ PANELİ</span>
            <h1>Admin Panel</h1>
          </div>

          <div style={adminGridStyle}>
            <div style={statBoxStyle}>
              <strong>Kullanıcı</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.users.length}
              </p>
            </div>

            <div style={statBoxStyle}>
              <strong>Bildirim Cihazı</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.subscriptionCount}
              </p>
            </div>

            <div style={statBoxStyle}>
              <strong>Login Log</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.loginLogs.length}
              </p>
            </div>

            <div style={statBoxStyle}>
              <strong>Rapor Log</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.reportLogs.length}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="scanButton"
            onClick={loadAdminPanelData}
            disabled={adminLoading}
          >
            {adminLoading ? 'Yenileniyor...' : 'Admin Verilerini Yenile'}
          </button>

          {adminMessage && <p className="message">{adminMessage}</p>}

          <div className="historyBox">
            <div className="historyHeader">
              <strong>Bildirim Gönder</strong>
            </div>

            <label>Bildirim Başlığı</label>
            <input
              type="text"
              value={adminNotificationTitle}
              onChange={(e) => setAdminNotificationTitle(e.target.value)}
              placeholder="Elvan Barkod Rapor"
              disabled={adminNotificationSending}
            />

            <label>Bildirim Mesajı</label>
            <textarea
              value={adminNotificationBody}
              onChange={(e) => setAdminNotificationBody(e.target.value)}
              placeholder="Gönderilecek mesajı yaz"
              disabled={adminNotificationSending}
              rows={4}
              style={{
                width: '100%',
                minHeight: '100px',
                padding: '14px',
                borderRadius: '14px',
                border: '1px solid #d1d5db',
                resize: 'vertical',
                fontSize: '15px',
                fontFamily: 'inherit',
              }}
            />

            <button
              type="button"
              className="mainButton"
              onClick={sendAdminNotification}
              disabled={adminNotificationSending}
            >
              {adminNotificationSending ? 'Gönderiliyor...' : 'Bildirimi Gönder'}
            </button>

            {adminNotificationMessage && (
              <p className="message">{adminNotificationMessage}</p>
            )}
          </div>

          <div className="historyBox">
            <div className="historyHeader">
              <strong>Kullanıcılar</strong>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Kullanıcı</th>
                    <th style={thStyle}>Ad Soyad</th>
                    <th style={thStyle}>Rol</th>
                    <th style={thStyle}>Durum</th>
                    <th style={thStyle}>İşlem</th>
                  </tr>
                </thead>

                <tbody>
                  {adminData.users.map((user) => (
                    <tr key={user.id}>
                      <td style={tdStyle}>{user.email}</td>
                      <td style={tdStyle}>{user.full_name || '-'}</td>
                      <td style={tdStyle}>{user.role || 'user'}</td>
                      <td style={tdStyle}>{user.is_active === false ? 'Pasif' : 'Aktif'}</td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          style={{
                            ...smallButtonStyle,
                            background: user.is_active === false ? '#0f766e' : '#b91c1c',
                          }}
                          onClick={() => updateAdminUser(user.id, { is_active: user.is_active === false })}
                        >
                          {user.is_active === false ? 'Aktif Yap' : 'Pasif Yap'}
                        </button>

                        <button
                          type="button"
                          style={{
                            ...smallButtonStyle,
                            background: user.role === 'admin' ? '#4b5563' : '#17324d',
                          }}
                          onClick={() => updateAdminUser(user.id, { role: user.role === 'admin' ? 'user' : 'admin' })}
                        >
                          {user.role === 'admin' ? 'User Yap' : 'Admin Yap'}
                        </button>
                      </td>
                    </tr>
                  ))}

                  {adminData.users.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={5}>
                        Kullanıcı bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="historyBox">
            <div className="historyHeader">
              <strong>Son Giriş / Çıkış Logları</strong>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tarih</th>
                    <th style={thStyle}>Kullanıcı</th>
                    <th style={thStyle}>İşlem</th>
                    <th style={thStyle}>Cihaz</th>
                  </tr>
                </thead>

                <tbody>
                  {adminData.loginLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={tdStyle}>{formatDateTime(log.created_at)}</td>
                      <td style={tdStyle}>{log.user_name || log.user_email || '-'}</td>
                      <td style={tdStyle}>{log.event_type || '-'}</td>
                      <td style={tdStyle}>{log.device_name || '-'}</td>
                    </tr>
                  ))}

                  {adminData.loginLogs.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={4}>
                        Log bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="historyBox">
            <div className="historyHeader">
              <strong>Son Rapor Logları</strong>
            </div>

            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Tarih</th>
                    <th style={thStyle}>Kullanıcı</th>
                    <th style={thStyle}>Barkod</th>
                    <th style={thStyle}>Rapor</th>
                    <th style={thStyle}>Cihaz</th>
                  </tr>
                </thead>

                <tbody>
                  {adminData.reportLogs.map((log) => (
                    <tr key={log.id}>
                      <td style={tdStyle}>{formatDateTime(log.created_at)}</td>
                      <td style={tdStyle}>{log.user_name || log.user_email || '-'}</td>
                      <td style={tdStyle}>{log.barcode || '-'}</td>
                      <td style={tdStyle}>{log.report_name || log.report_code || '-'}</td>
                      <td style={tdStyle}>{log.device_name || '-'}</td>
                    </tr>
                  ))}

                  {adminData.reportLogs.length === 0 && (
                    <tr>
                      <td style={tdStyle} colSpan={5}>
                        Rapor logu bulunamadı.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <button className="logoutButton" onClick={handleLogout}>
            {t.logout}
          </button>

          <p className="appFooter">
            {t.versionText} {APP_VERSION}
          </p>
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
            <span className="eyebrow">{t.appSubtitle}</span>
            <h1>{t.welcome}, {displayName}</h1>
          </div>

          {userProfile?.role === 'admin' && (
            <button
              type="button"
              className="scanButton"
              onClick={openAdminPanel}
            >
              Admin Panel
            </button>
          )}

          <label>{t.barcode}</label>
          <div className="barcodeInputRow">
            <input
              type="text"
              placeholder={t.barcodePlaceholder}
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
            />

            <button
              type="button"
              className="clearBarcodeButton"
              onClick={clearBarcodeInput}
              disabled={!barcode || loading}
            >
              {t.clearBarcode}
            </button>
          </div>

          <button
            type="button"
            className="scanButton"
            onClick={startScanner}
            disabled={loading}
          >
            {scannerOpen ? t.cameraOpen : t.scanBarcode}
          </button>

          {scannerOpen && (
            <div className="scannerOverlay">
              <div className="scannerPanel">
                <div className="scannerTop">
                  <div>
                    <strong>{t.cameraOpen}</strong>
                    <span>{t.alignBarcode}</span>
                  </div>

                  <button
                    type="button"
                    className="scannerCloseSmall"
                    onClick={stopScanner}
                  >
                    {t.close}
                  </button>
                </div>

                <div className="scannerViewport">
                  <video
                    ref={videoRef}
                    className="scannerVideo"
                    autoPlay
                    muted
                    playsInline
                  />

                  <div className="scannerShade"></div>

                  <div className="scanFrame">
                    <span className="corner cornerTopLeft"></span>
                    <span className="corner cornerTopRight"></span>
                    <span className="corner cornerBottomLeft"></span>
                    <span className="corner cornerBottomRight"></span>
                    <span className="scanLine"></span>
                  </div>
                </div>

                <div className="scannerBottom">
                  {scannerMessage && (
                    <p className="scannerMessage">{scannerMessage}</p>
                  )}

                  <p className="scannerHint">{t.cameraHint}</p>

                  <button
                    type="button"
                    className="stopScanButton"
                    onClick={stopScanner}
                  >
                    {t.closeCamera}
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading && activeReport && (
            <div className="reportProgress" role="status" aria-live="polite">
              <span className="reportProgressRing"></span>
              <div>
                <strong>{getReportName(activeReport)} {t.reportPreparing}</strong>
                <span>{t.pleaseWait}</span>
              </div>
            </div>
          )}

          <div className="reportButtons">
            {REPORTS.map((report, index) => (
              <Fragment key={report.code}>
                <button
                  className={`mainButton reportButton reportButton${index + 1}${
                    loading && selectedReportCode === report.code
                      ? ' reportButtonLoading'
                      : ''
                  }`}
                  onClick={() => openReport(report)}
                  disabled={loading}
                >
                  <span className="reportButtonMark">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <span className="reportButtonBody">
                    <strong>
                      {loading && selectedReportCode === report.code
                        ? `${getReportName(report)} ${t.reportPreparing}`
                        : getReportName(report)}
                    </strong>
                    <small>{getReportMeta(report)}</small>
                  </span>

                  <span className="reportButtonCode">
                    {report.code}
                  </span>
                </button>

                {report.requiresDateRange && dateRangeReportCode === report.code && (
                  <div className="dateRangeBox">
                    <div className="dateInputGrid">
                      <div>
                        <label htmlFor="shipmentStartDate">{t.startDate}</label>
                        <input
                          id="shipmentStartDate"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          disabled={loading}
                        />
                      </div>

                      <div>
                        <label htmlFor="shipmentEndDate">{t.endDate}</label>
                        <input
                          id="shipmentEndDate"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            ))}
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

          {message && (
            <p className="message messageToast" role="alert" aria-live="assertive">
              {message}
            </p>
          )}

          <button className="logoutButton" onClick={handleLogout}>
            {t.logout}
          </button>

          <p className="appFooter">
            {t.versionText} {APP_VERSION}
          </p>
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

        <div className="loginHero">
          <span className="eyebrow">ELVAN DYEING</span>
          <h1>{t.appTitle}</h1>
          <p className="subtitle">{t.appSubtitle}</p>
        </div>

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

        {message && (
          <p className="message messageToast" role="alert" aria-live="assertive">
            {message}
          </p>
        )}

        <p className="appFooter">
          {t.versionText} {APP_VERSION}
        </p>
      </div>
    </div>
  )
}

export default App
