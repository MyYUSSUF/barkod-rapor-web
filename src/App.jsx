import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'
import './App.css'

const NativePdfViewer = lazy(() => import('./NativePdfViewer'))

const API_BASE_URL =
  window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin

const HISTORY_KEY = 'barkod_rapor_history'
const LANGUAGE_KEY = 'barkod_rapor_language'
const DEVICE_TOKEN_KEY = 'barkod_rapor_device_token_v1'
const NOTIFICATION_PERMISSION_ASKED_KEY = 'barkod_rapor_notification_permission_asked_v2'
const REPORT_TIMEOUT_MS = 45000
const DEVICE_ACCESS_CHECK_MS = 10000
const APP_VERSION = 'v1.18'
const APP_LOG_VERSION = 'web-v1.18'

const SHIPMENT_CUSTOMERS = [
  {
    code: '61002',
    name: 'Rubyred (Amreya)',
  },
  {
    code: '61001',
    name: 'Rubyred (Borg)',
  },
  {
    code: 'M000172',
    name: 'Tema',
  },
]

const REPORTS = [
  {
    code: 'RAR00032',
    key: 'inspection',
    icon: 'inspect',
    requiresBarcode: true,
  },
  {
    code: 'RAR00033',
    key: 'workOrder',
    icon: 'work',
    requiresBarcode: true,
  },
  {
    code: 'RAR00034',
    key: 'surfaceControl',
    icon: 'surface',
    requiresBarcode: true,
  },
  {
    code: 'RAR00035',
    key: 'fixingWaiting',
    icon: 'fixing',
    requiresBarcode: false,
    permissionKey: 'can_view_fixing_report',
  },
  {
    code: 'RAR00036',
    key: 'shipmentTracking',
    icon: 'shipment',
    requiresBarcode: false,
    requiresDateRange: true,
    permissionKey: 'can_view_shipment_report',
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
    noBarcodeRequired: 'Barkod gerekmez',
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
    selectedDateRange: 'Seçilen tarih aralığı',
    selectedDayCount: 'gün',
    scannerReady: 'Okutmaya hazır',
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
    dateRangeInvalid: 'Başlangıç tarihi bitiş tarihinden sonra olamaz.',
    selectDateRange: 'Sevkiyat Takip için tarih aralığını seçin.',
    customer: 'Müşteri',
    selectCustomer: 'Müşteri seçin',
    customerRequired: 'Sevkiyat raporu için müşteri seçilmelidir.',
    selectedCustomer: 'Seçilen müşteri',
    reportPreparing: 'hazırlanıyor...',
    reportRequestTimeout: 'Rapor hazırlanması çok uzun sürdü. Lütfen tekrar deneyin.',
    sessionMissing: 'Oturum bulunamadı. Tekrar giriş yap.',
    reportUrlFailed: 'Rapor linki alınamadı: ',
    pdfUrlEmpty: 'PDF linki boş geldi.',
    reportLogFailed: 'Rapor log kaydı başarısız: ',
    reportPermissionDenied: 'Bu raporu görüntüleme yetkiniz bulunmuyor.',
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
    close: 'Kapat',
    reportCouldNotLoad: 'Rapor yüklenemedi.',
    versionText: 'Barkod Rapor Web',
    notificationUnsupported: 'Bu cihaz veya tarayıcı bildirimleri desteklemiyor.',
    notificationDenied: 'Bildirim izni verilmedi.',
    notificationKeyMissing: 'Bildirim anahtarı eksik. Vercel ayarlarını kontrol edin.',
    notificationSaved: 'Bildirimler açıldı. Bu cihaza bildirim gelebilir.',
    notificationError: 'Bildirim açılırken hata oluştu: ',
    devicePending: 'Bu cihaz yönetici onayı bekliyor.',
    deviceRevoked: 'Bu cihazın erişim izni kaldırıldı.',
    deviceAccessFailed: 'Cihaz doğrulaması yapılamadı: ',
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
    noBarcodeRequired: 'No barcode required',
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
    selectedDateRange: 'Selected date range',
    selectedDayCount: 'days',
    scannerReady: 'Ready to scan',
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
    dateRangeInvalid: 'Start date cannot be after end date.',
    selectDateRange: 'Select a date range for Shipment Tracking.',
    customer: 'Customer',
    selectCustomer: 'Select customer',
    customerRequired: 'A customer must be selected for the shipment report.',
    selectedCustomer: 'Selected customer',
    reportPreparing: 'is preparing...',
    reportRequestTimeout: 'Report preparation took too long. Please try again.',
    sessionMissing: 'Session not found. Please login again.',
    reportUrlFailed: 'Report link could not be received: ',
    pdfUrlEmpty: 'PDF link is empty.',
    reportLogFailed: 'Report log failed: ',
    reportPermissionDenied: 'You do not have permission to view this report.',
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
    close: 'Close',
    reportCouldNotLoad: 'Report could not be loaded.',
    versionText: 'Barcode Report Web',
    notificationUnsupported: 'This device or browser does not support notifications.',
    notificationDenied: 'Notification permission was not granted.',
    notificationKeyMissing: 'Notification key is missing. Check Vercel settings.',
    notificationSaved: 'Notifications enabled. This device can receive notifications.',
    notificationError: 'Notification setup failed: ',
    devicePending: 'This device is waiting for administrator approval.',
    deviceRevoked: 'Access for this device has been revoked.',
    deviceAccessFailed: 'Device verification failed: ',
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
    noBarcodeRequired: 'لا يحتاج إلى باركود',
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
    selectedDateRange: 'نطاق التاريخ المحدد',
    selectedDayCount: 'أيام',
    scannerReady: 'جاهز للمسح',
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
    dateRangeInvalid: 'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.',
    selectDateRange: 'اختر نطاق التاريخ لتتبع الشحنات.',
    customer: 'العميل',
    selectCustomer: 'اختر العميل',
    customerRequired: 'يجب اختيار العميل لتقرير الشحن.',
    selectedCustomer: 'العميل المحدد',
    reportPreparing: 'قيد التحضير...',
    reportRequestTimeout: 'استغرق تجهيز التقرير وقتًا طويلاً. يرجى المحاولة مرة أخرى.',
    sessionMissing: 'لم يتم العثور على الجلسة. سجّل الدخول مرة أخرى.',
    reportUrlFailed: 'تعذر الحصول على رابط التقرير: ',
    pdfUrlEmpty: 'رابط PDF فارغ.',
    reportLogFailed: 'فشل تسجيل التقرير: ',
    reportPermissionDenied: 'ليس لديك صلاحية لعرض هذا التقرير.',
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
    close: 'إغلاق',
    reportCouldNotLoad: 'تعذر تحميل التقرير.',
    versionText: 'نظام تقارير الباركود',
    notificationUnsupported: 'هذا الجهاز أو المتصفح لا يدعم الإشعارات.',
    notificationDenied: 'لم يتم السماح بالإشعارات.',
    notificationKeyMissing: 'مفتاح الإشعارات غير موجود. تحقق من إعدادات Vercel.',
    notificationSaved: 'تم تفعيل الإشعارات. يمكن لهذا الجهاز استقبال الإشعارات.',
    notificationError: 'حدث خطأ أثناء تفعيل الإشعارات: ',
    devicePending: 'هذا الجهاز بانتظار موافقة المسؤول.',
    deviceRevoked: 'تم إلغاء صلاحية هذا الجهاز.',
    deviceAccessFailed: 'تعذر التحقق من الجهاز: ',
  },
}

function createDeviceToken() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(32)
    window.crypto.getRandomValues(bytes)

    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replaceAll('=', '')
  }

  return `${Date.now()}-${Math.random()}-${Math.random()}-${Math.random()}`
}

function getOrCreateDeviceToken() {
  const existingToken = localStorage.getItem(DEVICE_TOKEN_KEY)

  if (existingToken && existingToken.length >= 32) {
    return existingToken
  }

  const newToken = createDeviceToken()
  localStorage.setItem(DEVICE_TOKEN_KEY, newToken)
  return newToken
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
  } catch {
    return value
  }
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

    return parsed
      .map((item) => {
        if (typeof item === 'string') {
          return {
            value: item.trim(),
            reportCode: '',
            reportName: '',
          }
        }

        if (item && typeof item === 'object') {
          return {
            value: String(item.value || item.barcode || '').trim(),
            reportCode: String(item.reportCode || '').trim(),
            reportName: String(item.reportName || '').trim(),
          }
        }

        return null
      })
      .filter((item) => item?.value)
  } catch {
    return []
  }
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

const REPORT_ICON_PATHS = {
  inspect: (
    <>
      <path d="M8 4h8l3 3v13H5V4h3z" />
      <path d="M15 4v4h4" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </>
  ),
  work: (
    <>
      <path d="M9 7V5h6v2" />
      <path d="M4 8h16v11H4V8z" />
      <path d="M4 13h16" />
      <path d="M10 13v2h4v-2" />
    </>
  ),
  surface: (
    <>
      <path d="M4 16l5-8 4 5 3-4 4 7" />
      <path d="M4 19h16" />
      <path d="M7 12h2" />
      <path d="M14 12h2" />
    </>
  ),
  fixing: (
    <>
      <path d="M6 7h12" />
      <path d="M8 7v10" />
      <path d="M16 7v10" />
      <path d="M7 17h10" />
      <path d="M10 10h4" />
    </>
  ),
  shipment: (
    <>
      <path d="M3 8h11v8H3V8z" />
      <path d="M14 11h4l3 3v2h-7v-5z" />
      <path d="M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
      <path d="M17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </>
  ),
}

function ReportIcon({ type }) {
  return (
    <svg
      className="reportButtonIcon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      >
        {REPORT_ICON_PATHS[type] || REPORT_ICON_PATHS.inspect}
      </g>
    </svg>
  )
}

function App() {
  const videoRef = useRef(null)
  const shipmentDateBoxRef = useRef(null)
  const shipmentCustomerSelectRef = useRef(null)
  const shipmentStartInputRef = useRef(null)
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
  const [shipmentCustomerCode, setShipmentCustomerCode] = useState('')
  const [barcodeHistory, setBarcodeHistory] = useState(loadBarcodeHistory)
  const [message, setMessage] = useState('')
  const [messageKind, setMessageKind] = useState('error')
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerMessage, setScannerMessage] = useState('')
  const [screen, setScreen] = useState('main')
  const [pdfViewerData, setPdfViewerData] = useState(null)

  const [adminNotificationTitle, setAdminNotificationTitle] = useState('Elvan Barkod Rapor')
  const [adminNotificationBody, setAdminNotificationBody] = useState('')
  const [adminNotificationSending, setAdminNotificationSending] = useState(false)
  const [adminNotificationMessage, setAdminNotificationMessage] = useState('')

  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [expandedAdminDeviceId, setExpandedAdminDeviceId] = useState('')
  const [expandedAdminUserId, setExpandedAdminUserId] = useState('')
  const [expandedAdminLogId, setExpandedAdminLogId] = useState('')
  const [adminLogView, setAdminLogView] = useState('login')
  const [adminLogLimit, setAdminLogLimit] = useState(12)
  const [adminData, setAdminData] = useState({
    users: [],
    devices: [],
    loginLogs: [],
    reportLogs: [],
    subscriptionCount: 0,
  })

  const showUserMessage = (value, kind = 'error') => {
    setMessageKind(kind)
    setMessage(value)
  }

  const clearUserMessage = () => {
    setMessage('')
    setMessageKind('info')
  }

  const changeLanguage = (value) => {
    setLanguage(value)
    localStorage.setItem(LANGUAGE_KEY, value)
  }

  const getDeviceName = () => {
    return navigator.userAgent || 'Web Browser'
  }

  const getDeviceToken = () => {
    return getOrCreateDeviceToken()
  }

  const makeAuthorizedHeaders = (accessToken, extraHeaders = {}) => {
    return {
      ...extraHeaders,
      Authorization: `Bearer ${accessToken}`,
      'X-Device-Token': getDeviceToken(),
    }
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
    setShipmentCustomerCode('')
    setDateRangeReportCode('')
    setSelectedReportCode('')
    setDisplayName('')
    setAdminNotificationBody('')
    setAdminNotificationMessage('')
    setAdminMessage('')
    setScreen('main')
    setPdfViewerData(null)
  }

  const makeDisplayName = (profile) => {
    return profile?.full_name ? String(profile.full_name).trim() : ''
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

    return t.noBarcodeRequired
  }

  const saveBarcodeToHistory = (value, report = null) => {
    const cleanValue = value ? String(value).trim() : ''

    if (!cleanValue) {
      return
    }

    const currentHistory = loadBarcodeHistory()
    const historyItem = {
      value: cleanValue,
      reportCode: report?.code || '',
      reportName: report ? getReportName(report) : '',
    }

    const newHistory = [
      historyItem,
      ...currentHistory.filter((item) => {
        return !(
          item.value === cleanValue &&
          item.reportCode === historyItem.reportCode
        )
      }),
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
    clearUserMessage()
  }

  const focusShipmentControls = (target = 'date') => {
    window.setTimeout(() => {
      shipmentDateBoxRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })

      const targetElement =
        target === 'customer'
          ? shipmentCustomerSelectRef.current
          : shipmentStartInputRef.current

      targetElement?.focus({
        preventScroll: true,
      })
    }, 80)
  }

  const makePdfProxyUrl = (pdfUrl, reportCode, reportToken) => {
    const params = new URLSearchParams({
      url: pdfUrl,
      reportCode,
      reportToken,
    })

    return `${API_BASE_URL}/api/report-pdf?${params.toString()}`
  }

  const sanitizePdfFileName = (value) => {
    return String(value || 'report')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || 'report'
  }

  const formatDisplayDate = (value) => {
    const [year, month, day] = String(value || '').split('-')

    if (!year || !month || !day) {
      return value || ''
    }

    return `${day}.${month}.${year}`
  }

  const isInvalidDateRange = (fromDate, toDate) => {
    if (!fromDate || !toDate) {
      return false
    }

    return fromDate > toDate
  }

  const getDateRangeDayCount = (fromDate, toDate) => {
    if (!fromDate || !toDate || isInvalidDateRange(fromDate, toDate)) {
      return null
    }

    const fromTime = new Date(`${fromDate}T00:00:00`).getTime()
    const toTime = new Date(`${toDate}T00:00:00`).getTime()

    if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
      return null
    }

    return Math.floor((toTime - fromTime) / 86400000) + 1
  }

  const buildPdfMeta = ({
    requiresDateRange,
    cleanStartDate,
    cleanEndDate,
    cleanBarcode,
    customerName,
  }) => {
    if (requiresDateRange) {
      return `${t.customer}: ${customerName} · ${t.startDate}: ${formatDisplayDate(cleanStartDate)} · ${t.endDate}: ${formatDisplayDate(cleanEndDate)}`
    }

    return `${t.barcode}: ${cleanBarcode || 'Barkodsuz'}`
  }

  const canUseNotifications = () => {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  }

  const registerPushSubscription = async (userId, options = {}) => {
    const { forceRenew = false, showMessage = false } = options

    try {
      if (!canUseNotifications()) {
        if (showMessage) {
          showUserMessage(t.notificationUnsupported, 'warning')
        }
        return false
      }

      if (Notification.permission !== 'granted') {
        return false
      }

      const publicKey = getVapidPublicKey()

      if (!publicKey) {
        if (showMessage) {
          showUserMessage(t.notificationKeyMissing, 'warning')
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

      if (showMessage) {
        showUserMessage(t.notificationSaved, 'success')
      }

      return true
    } catch (err) {
      if (showMessage) {
        showUserMessage(t.notificationError + err.message, 'error')
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

  const checkDeviceAccess = async (accessToken, options = {}) => {
    const { register = false } = options
    const response = await fetch(`${API_BASE_URL}/api/device-access`, {
      method: register ? 'POST' : 'GET',
      headers: makeAuthorizedHeaders(accessToken, {
        'Content-Type': 'application/json',
      }),
      body: register
        ? JSON.stringify({
            deviceName: getDeviceName(),
          })
        : undefined,
    })

    const result = await response.json().catch(() => ({}))

    return {
      ok: response.ok,
      approved: result.approved === true,
      status: result.status || '',
      error: result.error || '',
    }
  }

  const getDeviceAccessMessage = (result) => {
    if (result?.status === 'pending') {
      return t.devicePending
    }

    if (['revoked', 'missing'].includes(result?.status)) {
      return t.deviceRevoked
    }

    return `${t.deviceAccessFailed}${result?.error || 'Unknown error'}`
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
        headers: makeAuthorizedHeaders(accessToken),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Admin panel verisi alınamadı.')
      }

      setAdminData({
        users: result.users || [],
        devices: result.devices || [],
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
        headers: makeAuthorizedHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
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

  const updateAdminDevice = async (deviceId, action) => {
    setAdminMessage('')

    try {
      const accessToken = await getAccessToken()

      if (!accessToken) {
        setAdminMessage(t.sessionMissing)
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/admin-panel`, {
        method: 'PATCH',
        headers: makeAuthorizedHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          deviceId,
          action,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Cihaz güncellenemedi.')
      }

      setAdminMessage(
        action === 'approve_device'
          ? 'Cihaz onaylandı. Önceki cihaz erişimi kapatıldı.'
          : 'Cihaz erişimi iptal edildi.'
      )
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
        headers: makeAuthorizedHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
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

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  useEffect(() => {
    const restoreSession = async () => {
      if (!isSupabaseConfigured) {
        setRestoringSession(false)
        return
      }

      try {
        const { data } = await supabase.auth.getSession()
        const session = data?.session

        if (!session?.user?.id) {
          setRestoringSession(false)
          return
        }

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select(
            'id, email, full_name, role, is_active, can_view_fixing_report, can_view_shipment_report'
          )
          .eq('id', session.user.id)
          .single()

        if (profileError || !profileData) {
          await supabase.auth.signOut()
          showUserMessage(t.profileNotFound, 'error')
          setRestoringSession(false)
          return
        }

        if (profileData.is_active === false) {
          await supabase.auth.signOut()
          showUserMessage(t.inactiveBlocked, 'error')
          setRestoringSession(false)
          return
        }

        const deviceResult = await checkDeviceAccess(session.access_token, {
          register: true,
        })

        if (!deviceResult.approved) {
          await supabase.auth.signOut()
          showUserMessage(getDeviceAccessMessage(deviceResult), 'warning')
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
    // Oturum geri yükleme yalnızca uygulama ilk açıldığında çalışmalıdır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          showUserMessage(t.inactiveAutoLogout, 'error')
          return
        }

        const accessToken = await getAccessToken()

        if (!accessToken) {
          return
        }

        const deviceResult = await checkDeviceAccess(accessToken)

        if (!deviceResult.approved) {
          stopScanner()
          await supabase.auth.signOut()
          resetUserState()
          showUserMessage(getDeviceAccessMessage(deviceResult), 'error')
        }
      } catch (err) {
        console.log('Aktiflik kontrol hatası:', err)
      }
    }

    checkUserActiveStatus()

    const intervalId = setInterval(checkUserActiveStatus, DEVICE_ACCESS_CHECK_MS)

    return () => clearInterval(intervalId)
    // Kontrol döngüsü yalnızca kullanıcı veya dil değiştiğinde yeniden kurulmalıdır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id, language])

  useEffect(() => {
    if (!userProfile?.id) {
      return
    }

    if (!canUseNotifications()) {
      return
    }

    if (Notification.permission === 'granted') {
      const subscriptionTimer = window.setTimeout(() => {
        registerPushSubscription(userProfile.id, {
          forceRenew: false,
          showMessage: false,
        })
      }, 0)

      return () => window.clearTimeout(subscriptionTimer)
    }
    // Abonelik yenileme yalnızca oturum kullanıcısı değiştiğinde çalışmalıdır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const getCameraConstraintProfiles = () => [
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
      },
    },
    {
      audio: false,
      video: true,
    },
  ]

  const startScanner = async () => {
    if (scannerControlsRef.current || scannerOpen) {
      stopScanner()
      return
    }

    clearUserMessage()
    setScannerOpen(true)
    setScannerMessage(t.cameraOpening)
    scannerResultHandledRef.current = false

    setTimeout(async () => {
      try {
        if (!videoRef.current) {
          setScannerOpen(false)
          setScannerMessage('')
          showUserMessage(t.cameraAreaMissing, 'error')
          return
        }

        const {
          BrowserCodeReader,
          BrowserMultiFormatReader,
        } = await import('@zxing/browser')
        const codeReader = new BrowserMultiFormatReader()

        const handleScanResult = (result, error, controlsFromCallback) => {
          if (!result || scannerResultHandledRef.current) {
            return
          }

          scannerResultHandledRef.current = true

          const scannedText = result.getText()

          setBarcode(scannedText)
          saveBarcodeToHistory(scannedText)
          showUserMessage(`${t.barcodeRead}: ${scannedText}`, 'success')

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

        let controls

        for (const constraints of getCameraConstraintProfiles()) {
          try {
            controls = await codeReader.decodeFromConstraints(
              constraints,
              videoRef.current,
              handleScanResult
            )
            break
          } catch (constraintError) {
            console.log(
              'Camera constraint profile failed:',
              constraintError?.name || constraintError?.message || constraintError
            )
          }
        }

        if (!controls) {
          console.log('Camera constraints failed, trying device list.')

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
        showUserMessage(t.cameraError + err.message, 'error')
      }
    }, 300)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    clearUserMessage()
    setLoading(true)

    try {
      const cleanUsername = username.trim().toLowerCase()

      if (!cleanUsername || !password) {
        showUserMessage(t.usernamePasswordRequired, 'warning')
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
        showUserMessage(`${t.loginFailed}: ${authError.message}`, 'error')
        setLoading(false)
        return
      }

      const userId = authData.user.id

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select(
          'id, email, full_name, role, is_active, can_view_fixing_report, can_view_shipment_report'
        )
        .eq('id', userId)
        .single()

      if (profileError || !profileData) {
        await supabase.auth.signOut()
        showUserMessage(t.profileNotFound, 'error')
        setLoading(false)
        return
      }

      if (profileData.is_active === false) {
        await supabase.auth.signOut()
        showUserMessage(t.inactiveBlocked, 'error')
        setLoading(false)
        return
      }

      const accessToken = authData.session?.access_token

      if (!accessToken) {
        await supabase.auth.signOut()
        showUserMessage(t.sessionMissing, 'error')
        setLoading(false)
        return
      }

      const deviceResult = await checkDeviceAccess(accessToken, {
        register: true,
      })

      if (!deviceResult.approved) {
        await supabase.auth.signOut()
        showUserMessage(getDeviceAccessMessage(deviceResult), 'warning')
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
      clearUserMessage()

      if (notificationPermission === 'granted') {
        await registerPushSubscription(userId, {
          forceRenew: true,
          showMessage: false,
        })
      }
    } catch (err) {
      showUserMessage(t.unexpectedError + err.message, 'error')
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
    showUserMessage(t.logoutSuccess, 'success')
  }

  const openReport = async (report) => {
    const cleanBarcode = barcode.trim()
    const reportName = getReportName(report)
    const requiresBarcode = report.requiresBarcode !== false
    const requiresDateRange = report.requiresDateRange === true
    const cleanStartDate = startDate.trim()
    const cleanEndDate = endDate.trim()
    const selectedShipmentCustomer = requiresDateRange
      ? SHIPMENT_CUSTOMERS.find(
          (customer) => customer.code === shipmentCustomerCode
        )
      : null

    if (
      report.permissionKey &&
      userProfile?.role !== 'admin' &&
      userProfile?.[report.permissionKey] !== true
    ) {
      showUserMessage(t.reportPermissionDenied, 'warning')
      return
    }

    if (requiresBarcode && !cleanBarcode) {
      showUserMessage(t.barcodeRequired, 'warning')
      return
    }

    if (requiresDateRange) {
      setDateRangeReportCode(report.code)
    }

    if (requiresDateRange && !selectedShipmentCustomer) {
      showUserMessage(
        dateRangeReportCode !== report.code
          ? t.selectCustomer
          : t.customerRequired,
        dateRangeReportCode !== report.code ? 'info' : 'warning'
      )
      focusShipmentControls('customer')
      return
    }

    if (requiresDateRange && (!cleanStartDate || !cleanEndDate)) {
      showUserMessage(
        dateRangeReportCode !== report.code
          ? t.selectDateRange
          : t.dateRangeRequired,
        dateRangeReportCode !== report.code ? 'info' : 'warning'
      )
      focusShipmentControls('date')
      return
    }

    if (requiresDateRange && isInvalidDateRange(cleanStartDate, cleanEndDate)) {
      showUserMessage(t.dateRangeInvalid, 'warning')
      focusShipmentControls('date')
      return
    }

    if (!requiresDateRange) {
      setDateRangeReportCode('')
    }

    if (cleanBarcode) {
      saveBarcodeToHistory(cleanBarcode, report)
    }

    stopScanner()
    setLoading(true)
    setSelectedReportCode(report.code)
    showUserMessage(`${reportName} ${t.reportPreparing}`, 'info')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id
      const accessToken = sessionData?.session?.access_token

      if (!userId || !accessToken) {
        showUserMessage(t.sessionMissing, 'error')
        setUserProfile(null)
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const response = await fetchWithTimeout(`${API_BASE_URL}/api/report-url`, {
        method: 'POST',
        headers: makeAuthorizedHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          barcode: requiresBarcode ? cleanBarcode : '',
          reportCode: report.code,
          requiresBarcode,
          startDate: requiresDateRange ? cleanStartDate : undefined,
          endDate: requiresDateRange ? cleanEndDate : undefined,
          customerCode: requiresDateRange
            ? selectedShipmentCustomer.code
            : undefined,
        }),
      })

      const responseText = await response.text()
      let result = {}

      try {
        result = JSON.parse(responseText)
      } catch {
        result = {
          error: responseText || 'Unknown error',
        }
      }

      if (!response.ok) {
        showUserMessage(
          t.reportUrlFailed +
          (result.error || 'Unknown error'),
          'error'
        )

        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const pdfUrl = result.pdfUrl
      const reportToken = result.reportToken

      if (!pdfUrl || !reportToken) {
        showUserMessage(
          t.pdfUrlEmpty,
          'error'
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
        showUserMessage(t.reportLogFailed + logError.message, 'error')
        setLoading(false)
        setSelectedReportCode('')
        return
      }

      const safeReportName = sanitizePdfFileName(reportName)
      const safeBarcode = sanitizePdfFileName(
        requiresDateRange
          ? `${selectedShipmentCustomer.name}_${cleanStartDate}_${cleanEndDate}`
          : (cleanBarcode || 'Barkodsuz')
      )
      const pdfFileName = `${safeReportName}_${safeBarcode}.pdf`

      setPdfViewerData({
        pdfUrl:
          `${makePdfProxyUrl(pdfUrl, report.code, reportToken)}&filename=${encodeURIComponent(pdfFileName)}`,
        fileName: pdfFileName,
        reportName,
        accessToken,
        deviceToken: getDeviceToken(),
        reportMeta: buildPdfMeta({
          requiresDateRange,
          cleanStartDate,
          cleanEndDate,
          cleanBarcode,
          customerName: selectedShipmentCustomer?.name || '',
        }),
      })

      clearUserMessage()
    } catch (err) {
      const errorText =
        err.name === 'AbortError'
          ? t.reportRequestTimeout
          : `${t.unexpectedError}${err.message}`

      showUserMessage(errorText, 'error')
    }

    setLoading(false)
    setSelectedReportCode('')
  }

  const activeReport = selectedReportCode
    ? REPORTS.find((report) => report.code === selectedReportCode)
    : null

  const visibleReports = REPORTS.filter((report) => {
    return (
      !report.permissionKey ||
      userProfile?.role === 'admin' ||
      userProfile?.[report.permissionKey] === true
    )
  })

  const sortedAdminDevices = [...adminData.devices].sort((left, right) => {
    const statusOrder = {
      pending: 0,
      approved: 1,
      revoked: 2,
    }
    const statusDifference =
      (statusOrder[left.status] ?? 3) - (statusOrder[right.status] ?? 3)

    if (statusDifference !== 0) {
      return statusDifference
    }

    return new Date(right.last_seen_at || 0) - new Date(left.last_seen_at || 0)
  })
  const selectedAdminLogs =
    adminLogView === 'login' ? adminData.loginLogs : adminData.reportLogs
  const visibleAdminLogs = selectedAdminLogs.slice(0, adminLogLimit)

  const dateRangeDayCount = getDateRangeDayCount(startDate, endDate)

  if (pdfViewerData) {
    return (
      <Suspense
        fallback={
          <div className="pdfBundleLoading" role="status">
            <span className="reportProgressRing"></span>
            <strong>{t.reportPagePreparing}</strong>
          </div>
        }
      >
        <NativePdfViewer
          pdfUrl={pdfViewerData.pdfUrl}
          fileName={pdfViewerData.fileName}
          reportName={pdfViewerData.reportName}
          reportMeta={pdfViewerData.reportMeta}
          accessToken={pdfViewerData.accessToken}
          deviceToken={pdfViewerData.deviceToken}
          language={language}
          onClose={() => setPdfViewerData(null)}
        />
      </Suspense>
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

  if (!isSupabaseConfigured) {
    return (
      <div className="page" dir="ltr">
        <div className="card">
          <div className="topBar">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />
          </div>

          <h1>Supabase ayarlari eksik</h1>
          <p className="subtitle">
            Proje klasorune .env dosyasi ekleyip VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY degerlerini yazin.
          </p>
        </div>
      </div>
    )
  }

  if (userProfile && screen === 'admin' && userProfile.role === 'admin') {
    return (
      <div className="page adminPage" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="card adminCard" style={{ maxWidth: '980px' }}>
          <div className="topBar adminTopBar">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />

            <button
              type="button"
              className="clearBarcodeButton adminBackButton"
              onClick={() => setScreen('main')}
            >
              Ana Ekrana Dön
            </button>
          </div>

          <div className="welcomeBox">
            <span className="eyebrow">YÖNETİCİ PANELİ</span>
            <h1>Admin Panel</h1>
          </div>

          <div className="adminStatsGrid" style={adminGridStyle}>
            <div className="adminStatBox" style={statBoxStyle}>
              <strong>Kullanıcı</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.users.length}
              </p>
            </div>

            <div className="adminStatBox" style={statBoxStyle}>
              <strong>Bildirim Cihazı</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.subscriptionCount}
              </p>
            </div>

            <div className="adminStatBox" style={statBoxStyle}>
              <strong>Login Log</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.loginLogs.length}
              </p>
            </div>

            <div className="adminStatBox" style={statBoxStyle}>
              <strong>Rapor Log</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.reportLogs.length}
              </p>
            </div>

            <div className="adminStatBox" style={statBoxStyle}>
              <strong>Onay Bekleyen Cihaz</strong>
              <p className="subtitle" style={{ margin: '8px 0 0' }}>
                {adminData.devices.filter((device) => device.status === 'pending').length}
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

            <label htmlFor="adminNotificationTitle">Bildirim Başlığı</label>
            <input
              id="adminNotificationTitle"
              type="text"
              value={adminNotificationTitle}
              onChange={(e) => setAdminNotificationTitle(e.target.value)}
              placeholder="Elvan Barkod Rapor"
              disabled={adminNotificationSending}
            />

            <label htmlFor="adminNotificationBody">Bildirim Mesajı</label>
            <textarea
              id="adminNotificationBody"
              className="adminTextarea"
              value={adminNotificationBody}
              onChange={(e) => setAdminNotificationBody(e.target.value)}
              placeholder="Gönderilecek mesajı yaz"
              disabled={adminNotificationSending}
              rows={4}
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
              <strong>Cihaz Onayları</strong>
              <span className="adminSectionCount">{adminData.devices.length}</span>
            </div>

            <div className="adminAccordionList">
              {sortedAdminDevices.map((device) => {
                const isExpanded = expandedAdminDeviceId === device.id
                const userName =
                  device.user_name || device.user_email || device.user_id || '-'
                const statusLabel =
                  device.status === 'approved'
                    ? 'Onaylı'
                    : device.status === 'pending'
                      ? 'Onay Bekliyor'
                      : 'Reddedildi'

                return (
                  <article
                    key={device.id}
                    className={`adminAccordionCard${isExpanded ? ' isOpen' : ''}`}
                  >
                    <button
                      type="button"
                      className="adminAccordionHeader"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedAdminDeviceId(isExpanded ? '' : device.id)
                      }
                    >
                      <span className="adminAccordionIdentity">
                        <strong>{userName}</strong>
                        {device.user_email && device.user_email !== userName && (
                          <small>{device.user_email}</small>
                        )}
                      </span>

                      <span className="adminAccordionMeta">
                        <span className={`adminStatusBadge is-${device.status}`}>
                          {statusLabel}
                        </span>
                        <span className="adminChevron" aria-hidden="true"></span>
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="adminAccordionBody">
                        <dl className="adminDetailGrid">
                          <div>
                            <dt>Cihaz</dt>
                            <dd>{device.device_name || '-'}</dd>
                          </div>
                          <div>
                            <dt>İlk İstek</dt>
                            <dd>{formatDateTime(device.created_at)}</dd>
                          </div>
                          <div>
                            <dt>Son Görülme</dt>
                            <dd>{formatDateTime(device.last_seen_at)}</dd>
                          </div>
                        </dl>

                        <div className="adminCardActions">
                          {device.status !== 'approved' && (
                            <button
                              type="button"
                              className="adminSmallButton adminApproveButton"
                              onClick={() =>
                                updateAdminDevice(device.id, 'approve_device')
                              }
                            >
                              {device.status === 'revoked'
                                ? 'Tekrar Onayla'
                                : 'Onayla'}
                            </button>
                          )}

                          {device.status === 'pending' && (
                            <button
                              type="button"
                              className="adminSmallButton adminRejectButton"
                              onClick={() =>
                                updateAdminDevice(device.id, 'revoke_device')
                              }
                            >
                              Reddet
                            </button>
                          )}

                          {device.status === 'approved' && (
                            <button
                              type="button"
                              className="adminSmallButton adminRejectButton"
                              onClick={() =>
                                updateAdminDevice(device.id, 'revoke_device')
                              }
                            >
                              İzni Kaldır
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}

              {adminData.devices.length === 0 && (
                <p className="adminEmptyState">Kayıtlı cihaz bulunamadı.</p>
              )}
            </div>
          </div>

          <div className="historyBox">
            <div className="historyHeader">
              <strong>Kullanıcılar</strong>
              <span className="adminSectionCount">{adminData.users.length}</span>
            </div>

            <div className="adminAccordionList">
              {adminData.users.map((user) => {
                const isExpanded = expandedAdminUserId === user.id
                const userName = user.full_name || user.email || '-'

                return (
                  <article
                    key={user.id}
                    className={`adminAccordionCard${isExpanded ? ' isOpen' : ''}`}
                  >
                    <button
                      type="button"
                      className="adminAccordionHeader"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedAdminUserId(isExpanded ? '' : user.id)
                      }
                    >
                      <span className="adminAccordionIdentity">
                        <strong>{userName}</strong>
                        <small>{user.email}</small>
                      </span>

                      <span className="adminAccordionMeta">
                        <span
                          className={`adminStatusBadge ${
                            user.is_active === false ? 'is-revoked' : 'is-approved'
                          }`}
                        >
                          {user.is_active === false ? 'Pasif' : 'Aktif'}
                        </span>
                        {user.role === 'admin' && (
                          <span className="adminRoleBadge">Admin</span>
                        )}
                        <span className="adminChevron" aria-hidden="true"></span>
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="adminAccordionBody">
                        <dl className="adminDetailGrid">
                          <div>
                            <dt>Rol</dt>
                            <dd>{user.role === 'admin' ? 'Admin' : 'Kullanıcı'}</dd>
                          </div>
                          <div>
                            <dt>Cihaz</dt>
                            <dd>
                              {user.approved_device_count || 0} onaylı
                              {(user.pending_device_count || 0) > 0
                                ? `, ${user.pending_device_count} bekliyor`
                                : ''}
                            </dd>
                          </div>
                          <div>
                            <dt>Son Cihaz</dt>
                            <dd>{formatDateTime(user.last_device_seen_at)}</dd>
                          </div>
                        </dl>

                        <div className="adminPermissionPanel">
                          <strong>Rapor Yetkileri</strong>
                          <label className="adminPermissionToggle">
                            <input
                              type="checkbox"
                              checked={
                                user.role === 'admin' ||
                                user.can_view_fixing_report === true
                              }
                              disabled={user.role === 'admin'}
                              onChange={(e) =>
                                updateAdminUser(user.id, {
                                  can_view_fixing_report: e.target.checked,
                                })
                              }
                            />
                            <span>Fikse Bekleyenler</span>
                          </label>

                          <label className="adminPermissionToggle">
                            <input
                              type="checkbox"
                              checked={
                                user.role === 'admin' ||
                                user.can_view_shipment_report === true
                              }
                              disabled={user.role === 'admin'}
                              onChange={(e) =>
                                updateAdminUser(user.id, {
                                  can_view_shipment_report: e.target.checked,
                                })
                              }
                            />
                            <span>Sevkiyat Takip</span>
                          </label>
                          {user.role === 'admin' && (
                            <small>Admin kullanıcıları tüm raporları görebilir.</small>
                          )}
                        </div>

                        <div className="adminCardActions">
                          <button
                            type="button"
                            className={`adminSmallButton ${
                              user.is_active === false
                                ? 'adminApproveButton'
                                : 'adminRejectButton'
                            }`}
                            onClick={() =>
                              updateAdminUser(user.id, {
                                is_active: user.is_active === false,
                              })
                            }
                          >
                            {user.is_active === false ? 'Aktif Yap' : 'Pasif Yap'}
                          </button>

                          <button
                            type="button"
                            className="adminSmallButton adminRoleButton"
                            onClick={() =>
                              updateAdminUser(user.id, {
                                role: user.role === 'admin' ? 'user' : 'admin',
                              })
                            }
                          >
                            {user.role === 'admin' ? 'Kullanıcı Yap' : 'Admin Yap'}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}

              {adminData.users.length === 0 && (
                <p className="adminEmptyState">Kullanıcı bulunamadı.</p>
              )}
            </div>
          </div>

          <div className="historyBox">
            <div className="historyHeader">
              <strong>Son Hareketler</strong>
            </div>

            <div className="adminLogTabs" role="tablist" aria-label="Log türü">
              <button
                type="button"
                className={adminLogView === 'login' ? 'isActive' : ''}
                onClick={() => {
                  setAdminLogView('login')
                  setAdminLogLimit(12)
                  setExpandedAdminLogId('')
                }}
              >
                Giriş / Çıkış
              </button>
              <button
                type="button"
                className={adminLogView === 'report' ? 'isActive' : ''}
                onClick={() => {
                  setAdminLogView('report')
                  setAdminLogLimit(12)
                  setExpandedAdminLogId('')
                }}
              >
                Raporlar
              </button>
            </div>

            <div className="adminAccordionList adminLogAccordionList">
              {visibleAdminLogs.map((log) => {
                const isExpanded = expandedAdminLogId === log.id
                const eventLabel =
                  adminLogView === 'login'
                    ? log.event_type === 'logout'
                      ? 'Çıkış yaptı'
                      : 'Giriş yaptı'
                    : log.report_name || 'Rapor açtı'

                return (
                  <article
                    key={log.id}
                    className={`adminAccordionCard${isExpanded ? ' isOpen' : ''}`}
                  >
                    <button
                      type="button"
                      className="adminAccordionHeader adminLogAccordionHeader"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedAdminLogId(isExpanded ? '' : log.id)
                      }
                    >
                      <span className="adminAccordionIdentity">
                        <strong>{log.user_name || log.user_email || '-'}</strong>
                        <small>{eventLabel}</small>
                      </span>

                      <span className="adminAccordionMeta">
                        <time>{formatDateTime(log.created_at)}</time>
                        <span className="adminChevron" aria-hidden="true"></span>
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="adminAccordionBody">
                        <dl className="adminDetailGrid">
                          <div>
                            <dt>Tarih</dt>
                            <dd>{formatDateTime(log.created_at)}</dd>
                          </div>
                          <div>
                            <dt>İşlem</dt>
                            <dd>{eventLabel}</dd>
                          </div>
                          {adminLogView === 'report' && (
                            <>
                              <div>
                                <dt>Barkod</dt>
                                <dd>{log.barcode || '-'}</dd>
                              </div>
                              <div>
                                <dt>Rapor</dt>
                                <dd>{log.report_name || '-'}</dd>
                              </div>
                            </>
                          )}
                          <div>
                            <dt>Cihaz</dt>
                            <dd>{log.device_name || '-'}</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                  </article>
                )
              })}

              {selectedAdminLogs.length === 0 && (
                <p className="adminEmptyState">Kayıt bulunamadı.</p>
              )}
            </div>

            {selectedAdminLogs.length > 12 && (
              <button
                type="button"
                className="adminLogMoreButton"
                onClick={() =>
                  setAdminLogLimit(
                    adminLogLimit >= selectedAdminLogs.length
                      ? 12
                      : Math.min(adminLogLimit + 12, selectedAdminLogs.length)
                  )
                }
              >
                {adminLogLimit >= selectedAdminLogs.length
                  ? 'Daralt'
                  : `${Math.min(
                      12,
                      selectedAdminLogs.length - adminLogLimit
                    )} Kayıt Daha Göster`}
              </button>
            )}
          </div>

          <button type="button" className="logoutButton" onClick={handleLogout}>
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
              aria-label="Dil seçimi"
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
            <h1>{displayName ? `${t.welcome}, ${displayName}` : t.welcome}</h1>
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

          <label htmlFor="barcodeInput">{t.barcode}</label>
          <div className="barcodeInputRow">
            <input
              id="barcodeInput"
              type="text"
              inputMode="text"
              autoComplete="off"
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
                  <div className="scannerStatusPill">
                    <span></span>
                    {t.scannerReady}
                  </div>

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
            {visibleReports.map((report, index) => (
              <Fragment key={report.code}>
                <button
                  type="button"
                  className={`mainButton reportButton reportButton${index + 1}${
                    loading && selectedReportCode === report.code
                      ? ' reportButtonLoading'
                      : ''
                  }`}
                  onClick={() => openReport(report)}
                  disabled={loading}
                >
                  <span className="reportButtonMark">
                    <ReportIcon type={report.icon} />
                  </span>

                  <span className="reportButtonBody">
                    <strong>
                      {loading && selectedReportCode === report.code
                        ? `${getReportName(report)} ${t.reportPreparing}`
                        : getReportName(report)}
                    </strong>
                    <small>{getReportMeta(report)}</small>
                  </span>

                  {loading && selectedReportCode === report.code && (
                    <span className="reportButtonProgressBar"></span>
                  )}
                </button>

                {report.requiresDateRange && dateRangeReportCode === report.code && (
                  <div className="dateRangeBox" ref={shipmentDateBoxRef}>
                    <div className="shipmentCustomerField">
                      <label htmlFor="shipmentCustomer">{t.customer}</label>
                      <select
                        id="shipmentCustomer"
                        ref={shipmentCustomerSelectRef}
                        value={shipmentCustomerCode}
                        onChange={(e) => setShipmentCustomerCode(e.target.value)}
                        disabled={loading}
                      >
                        <option value="">{t.selectCustomer}</option>
                        {SHIPMENT_CUSTOMERS.map((customer) => (
                          <option key={customer.code} value={customer.code}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="dateInputGrid">
                      <div>
                        <label htmlFor="shipmentStartDate">{t.startDate}</label>
                        <input
                          id="shipmentStartDate"
                          ref={shipmentStartInputRef}
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

                    {startDate && endDate && (
                      <div className="dateRangeSummary">
                        <strong>{t.selectedDateRange}</strong>
                        <span>
                          {formatDisplayDate(startDate)} - {formatDisplayDate(endDate)}
                          {dateRangeDayCount && (
                            <> · {dateRangeDayCount} {t.selectedDayCount}</>
                          )}
                        </span>
                        {shipmentCustomerCode && (
                          <>
                            <strong className="shipmentCustomerSummaryLabel">
                              {t.selectedCustomer}
                            </strong>
                            <span>
                              {
                                SHIPMENT_CUSTOMERS.find(
                                  (customer) =>
                                    customer.code === shipmentCustomerCode
                                )?.name
                              }
                            </span>
                          </>
                        )}
                      </div>
                    )}
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
                    key={`${item.value}-${item.reportCode || 'scan'}`}
                    className="historyItem"
                    onClick={() => {
                      setBarcode(item.value)
                      showUserMessage(`${t.selectedBarcode}: ${item.value}`, 'info')
                    }}
                  >
                    <strong>{item.value}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

          {message && (
            <p
              className={`message messageToast message${messageKind}`}
              role="alert"
              aria-live="assertive"
            >
              {message}
            </p>
          )}

          <button type="button" className="logoutButton" onClick={handleLogout}>
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
            aria-label="Dil seçimi"
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
          <label htmlFor="loginUsername">{t.username}</label>
          <input
            id="loginUsername"
            type="text"
            autoComplete="username"
            inputMode="text"
            placeholder={t.usernamePlaceholder}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />

          <label htmlFor="loginPassword">{t.password}</label>
          <input
            id="loginPassword"
            type="password"
            autoComplete="current-password"
            placeholder={t.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit" disabled={loading}>
            {loading ? t.loggingIn : t.login}
          </button>
        </form>

        {message && (
          <p
            className={`message messageToast message${messageKind}`}
            role="alert"
            aria-live="assertive"
          >
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
