import { Fragment, lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'
import './App.css'

const NativePdfViewer = lazy(() => import('./NativePdfViewer'))

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, '')
const API_BASE_URL =
  configuredApiBaseUrl ||
  (window.location.port === '5173'
    ? `http://${window.location.hostname}:3001`
    : window.location.origin)

const HISTORY_KEY = 'barkod_rapor_history'
const LANGUAGE_KEY = 'barkod_rapor_language'
const DEVICE_TOKEN_KEY = 'barkod_rapor_device_token_v1'
const NOTIFICATION_PERMISSION_ASKED_KEY = 'barkod_rapor_notification_permission_asked_v2'
const REPORT_TIMEOUT_MS = 45000
const DEVICE_ACCESS_CHECK_MS = 10000
const DESKTOP_ADMIN_PATH = '/yonetim'
const APP_VERSION = 'v1.29'
const APP_LOG_VERSION = 'web-v1.29'

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
  {
    code: 'RAR00037',
    key: 'yarnStock',
    icon: 'stock',
    requiresBarcode: false,
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
    cameraHint: 'Barkodu yeşil çizginin üzerine yatay ve net şekilde getir.',
    cameraAreaMissing: 'Kamera alanı bulunamadı.',
    cameraUnsupported: 'Bu cihaz kamera erişimini desteklemiyor.',
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
    privacyPolicy: 'Gizlilik Politikası',
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
    yarnStock: 'İplik Stok Raporu',
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
    cameraHint: 'Hold the barcode horizontally on the green line in good light.',
    cameraAreaMissing: 'Camera area not found.',
    cameraUnsupported: 'This device does not support camera access.',
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
    privacyPolicy: 'Privacy Policy',
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
    yarnStock: 'Yarn Stock Report',
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
    cameraHint: 'ضع الباركود أفقياً على الخط الأخضر وفي إضاءة جيدة.',
    cameraAreaMissing: 'لم يتم العثور على مساحة الكاميرا.',
    cameraUnsupported: 'هذا الجهاز لا يدعم الوصول إلى الكاميرا.',
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
    privacyPolicy: 'سياسة الخصوصية',
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
    yarnStock: 'Yarn Stock Report',
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

function AppFooter({ text, privacyLabel }) {
  return (
    <p className="appFooter">
      <span>{text}</span>
      <a href="/privacy-policy.html" target="_blank" rel="noreferrer">
        {privacyLabel}
      </a>
    </p>
  )
}

function StartupSplash({ onComplete }) {
  const canvasRef = useRef(null)
  const brandFrameRef = useRef(null)
  const animationFrameRef = useRef(0)
  const completeTimerRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    const brandFrame = brandFrameRef.current

    if (!canvas || !brandFrame) {
      onComplete()
      return undefined
    }

    const ctx = canvas.getContext('2d')

    if (!ctx) {
      onComplete()
      return undefined
    }

    const sourceLogo = new Image()
    const particles = []
    const solidRed = [220, 0, 0]
    const solidBlack = [0, 0, 0]
    let logoMask = null
    let startedAt = 0
    let disposed = false
    let started = false

    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
    const getLuminance = (red, green, blue) => red * 0.299 + green * 0.587 + blue * 0.114
    const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3)

    const getSolidLogoColor = (red, green, blue, x, y, width, height) => {
      const isRedDominant = red > green + 24 && red > blue + 24
      const isElvanWord = x < width * 0.5 && y > height * 0.43 && y < height * 0.73

      return isRedDominant || isElvanWord ? solidRed : solidBlack
    }

    const isSymbolShadowArtifact = (red, green, blue, x, y, width, height) => {
      const isRedDominant = red > green + 24 && red > blue + 24
      const isCenteredSymbolArea =
        x > width * 0.26 && x < width * 0.74 && y < height * 0.55

      return isCenteredSymbolArea && !isRedDominant
    }

    const getLogoPixelAlpha = (red, green, blue, sourceAlpha, x, y, width, height) => {
      if (isSymbolShadowArtifact(red, green, blue, x, y, width, height)) {
        return 0
      }

      const color = getSolidLogoColor(red, green, blue, x, y, width, height)
      const sourceAlphaFactor = sourceAlpha / 255
      const luminance = getLuminance(red, green, blue)
      const darkness = clamp((245 - luminance) / 160)
      const redDominance = red - Math.max(green, blue)
      const redStrength = clamp((redDominance - 8) / 96)
      const whiteDistance = Math.max(255 - red, 255 - green, 255 - blue)
      const edgeStrength = clamp((whiteDistance - 8) / 88)
      const isRedColor = color === solidRed
      const alphaStrength = isRedColor
        ? Math.max(redStrength, darkness * 0.72) * edgeStrength
        : darkness

      return clamp(alphaStrength * sourceAlphaFactor)
    }

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const buildParticles = () => {
      particles.length = 0
      logoMask = null
      resizeCanvas()

      const rect = canvas.getBoundingClientRect()
      const logoWidth = sourceLogo.naturalWidth || sourceLogo.width
      const logoHeight = sourceLogo.naturalHeight || sourceLogo.height

      if (!logoWidth || !logoHeight || rect.width <= 0 || rect.height <= 0) {
        return
      }

      const targetWidth = Math.min(rect.width * 0.78, 560)
      const targetHeight = targetWidth * (logoHeight / logoWidth)
      const targetX = (rect.width - targetWidth) / 2
      const targetY = (rect.height - targetHeight) / 2
      const sampleWidth = Math.round(targetWidth)
      const sampleHeight = Math.round(targetHeight)
      const sampleCanvas = document.createElement('canvas')
      const sampleCtx = sampleCanvas.getContext('2d', {
        willReadFrequently: true,
      })
      const maskCanvas = document.createElement('canvas')
      const maskCtx = maskCanvas.getContext('2d')

      if (!sampleCtx || !maskCtx) {
        return
      }

      sampleCanvas.width = sampleWidth
      sampleCanvas.height = sampleHeight
      maskCanvas.width = sampleWidth
      maskCanvas.height = sampleHeight
      sampleCtx.drawImage(sourceLogo, 0, 0, sampleWidth, sampleHeight)

      const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight)
      const pixels = imageData.data
      const cleanImageData = sampleCtx.createImageData(sampleWidth, sampleHeight)
      const cleanPixels = cleanImageData.data

      for (let i = 0; i < pixels.length; i += 4) {
        const pixelIndex = i / 4
        const x = pixelIndex % sampleWidth
        const y = Math.floor(pixelIndex / sampleWidth)
        const red = pixels[i]
        const green = pixels[i + 1]
        const blue = pixels[i + 2]
        const alpha = pixels[i + 3]
        const logoAlpha = getLogoPixelAlpha(
          red,
          green,
          blue,
          alpha,
          x,
          y,
          sampleWidth,
          sampleHeight
        )
        const solidColor = getSolidLogoColor(
          red,
          green,
          blue,
          x,
          y,
          sampleWidth,
          sampleHeight
        )

        cleanPixels[i] = solidColor[0]
        cleanPixels[i + 1] = solidColor[1]
        cleanPixels[i + 2] = solidColor[2]
        cleanPixels[i + 3] = logoAlpha <= 0.015 ? 0 : Math.round(logoAlpha * 255)
      }

      maskCtx.putImageData(cleanImageData, 0, 0)

      const step = rect.width < 620 ? 4 : 3
      const candidates = []

      for (let y = 0; y < sampleHeight; y += step) {
        for (let x = 0; x < sampleWidth; x += step) {
          const index = (y * sampleWidth + x) * 4
          const red = pixels[index]
          const green = pixels[index + 1]
          const blue = pixels[index + 2]
          const alpha = pixels[index + 3]
          const logoAlpha = getLogoPixelAlpha(
            red,
            green,
            blue,
            alpha,
            x,
            y,
            sampleWidth,
            sampleHeight
          )

          if (logoAlpha > 0.18) {
            const solidColor = getSolidLogoColor(
              red,
              green,
              blue,
              x,
              y,
              sampleWidth,
              sampleHeight
            )

            candidates.push({
              x: targetX + x,
              y: targetY + y,
              color: `rgba(${solidColor[0]}, ${solidColor[1]}, ${solidColor[2]}, 1)`,
            })
          }
        }
      }

      const maxParticles = rect.width < 620 ? 2400 : 5600
      const stride = Math.max(1, Math.ceil(candidates.length / maxParticles))

      for (let i = 0; i < candidates.length; i += stride) {
        const target = candidates[i]

        particles.push({
          sx: -80 - Math.random() * rect.width * 0.55,
          sy: Math.random() * rect.height,
          tx: target.x,
          ty: target.y,
          r: 1.35 + Math.random() * 1.75,
          delay: Math.random() * 520,
          color: target.color,
        })
      }

      logoMask = {
        canvas: maskCanvas,
        x: targetX,
        y: targetY,
        width: targetWidth,
        height: targetHeight,
      }
    }

    const draw = (now) => {
      if (disposed) {
        return
      }

      const rect = canvas.getBoundingClientRect()
      const elapsed = now - startedAt

      ctx.clearRect(0, 0, rect.width, rect.height)

      for (const particle of particles) {
        const raw = clamp((elapsed - particle.delay) / 1450)
        const eased = easeOutCubic(raw)
        const settle = clamp((elapsed - 1700) / 650)
        const drift =
          Math.sin((elapsed + particle.tx) * 0.006) *
          (1 - eased) *
          (18 - settle * 12)
        const x = particle.sx + (particle.tx - particle.sx) * eased
        const y = particle.sy + (particle.ty - particle.sy) * eased + drift
        const alpha = raw < 0.08 ? raw / 0.08 : 1
        const sharpen = clamp((elapsed - 1780) / 300)

        ctx.globalAlpha = alpha * (1 - sharpen)
        ctx.fillStyle = particle.color
        ctx.beginPath()
        ctx.arc(x, y, particle.r * (1 + settle * 0.08), 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.globalAlpha = 1

      if (logoMask) {
        const cleanLogoAlpha = clamp((elapsed - 1720) / 340)
        ctx.globalAlpha = cleanLogoAlpha
        ctx.drawImage(
          logoMask.canvas,
          logoMask.x,
          logoMask.y,
          logoMask.width,
          logoMask.height
        )
        ctx.globalAlpha = 1
      }

      if (elapsed > 2700) {
        brandFrame.classList.add('isLeaving')
      }

      if (elapsed < 3300) {
        animationFrameRef.current = requestAnimationFrame(draw)
      }
    }

    const start = () => {
      if (started) {
        return
      }

      started = true
      buildParticles()
      startedAt = performance.now()
      animationFrameRef.current = requestAnimationFrame(draw)
      completeTimerRef.current = window.setTimeout(onComplete, 3250)
    }

    sourceLogo.onload = start
    sourceLogo.onerror = onComplete
    sourceLogo.src = '/elvan-logo.png'

    if (sourceLogo.complete && sourceLogo.naturalWidth > 0) {
      start()
    }

    const handleResize = () => {
      buildParticles()
    }

    window.addEventListener('resize', handleResize)

    return () => {
      disposed = true
      window.removeEventListener('resize', handleResize)
      window.cancelAnimationFrame(animationFrameRef.current)
      window.clearTimeout(completeTimerRef.current)
    }
  }, [onComplete])

  return (
    <div className="startupSplash" role="status" aria-label="ELVAN açılıyor">
      <div className="startupSplashFrame" ref={brandFrameRef}>
        <canvas ref={canvasRef} className="startupSplashCanvas" />
      </div>
    </div>
  )
}

function App() {
  const videoRef = useRef(null)
  const shipmentDateBoxRef = useRef(null)
  const shipmentCustomerSelectRef = useRef(null)
  const shipmentStartInputRef = useRef(null)
  const scannerControlsRef = useRef(null)
  const scannerResultHandledRef = useRef(false)
  const scannerStartingRef = useRef(false)
  const scannerStartTokenRef = useRef(0)

  const [language, setLanguage] = useState(() => {
    return localStorage.getItem(LANGUAGE_KEY) || 'tr'
  })

  const t = LANGUAGES[language]
  const isArabic = language === 'ar'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [startupSplashVisible, setStartupSplashVisible] = useState(true)
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
  const [screen, setScreen] = useState(() => {
    return window.location.pathname === DESKTOP_ADMIN_PATH ? 'desktop-admin' : 'main'
  })
  const [pdfViewerData, setPdfViewerData] = useState(null)

  const [adminNotificationTitle, setAdminNotificationTitle] = useState('Elvan Barkod Rapor')
  const [adminNotificationBody, setAdminNotificationBody] = useState('')
  const [adminNotificationSending, setAdminNotificationSending] = useState(false)
  const [adminNotificationMessage, setAdminNotificationMessage] = useState('')

  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [expandedAdminUserId, setExpandedAdminUserId] = useState('')
  const [expandedAdminLogId, setExpandedAdminLogId] = useState('')
  const [adminLogView, setAdminLogView] = useState('login')
  const [adminLogLimit, setAdminLogLimit] = useState(12)
  const [activeAdminSection, setActiveAdminSection] = useState('logs')
  const [activeDesktopAdminView, setActiveDesktopAdminView] = useState('dashboard')
  const [desktopAdminSearch, setDesktopAdminSearch] = useState('')
  const [desktopDeviceFilter, setDesktopDeviceFilter] = useState('all')
  const [desktopPasswordDrafts, setDesktopPasswordDrafts] = useState({})
  const [newAdminUser, setNewAdminUser] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'user',
    can_view_fixing_report: false,
    can_view_shipment_report: false,
  })
  const [creatingAdminUser, setCreatingAdminUser] = useState(false)
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

  const hideStartupSplash = useCallback(() => {
    setStartupSplashVisible(false)
  }, [])

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

    scannerStartTokenRef.current += 1
    scannerStartingRef.current = false

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

  const getReportLanguageForAppLanguage = () => {
    return language === 'tr' ? 'tr' : 'en'
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
    setActiveAdminSection('logs')
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

  const updateAdminUserPassword = async (user) => {
    const userName = user.full_name || user.email || user.id
    const newPassword = String(desktopPasswordDrafts[user.id] || '').trim()

    if (!newPassword) {
      setAdminMessage(`${userName} için yeni şifre girilmelidir.`)
      return
    }

    const confirmed = window.confirm(
      `${userName} kullanıcısının şifresi değiştirilecek. Devam edilsin mi?`
    )

    if (!confirmed) {
      return
    }

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
          action: 'update_password',
          userId: user.id,
          password: newPassword,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Şifre güncellenemedi.')
      }

      setDesktopPasswordDrafts((current) => ({
        ...current,
        [user.id]: '',
      }))
      setAdminMessage('Şifre güncellendi.')
    } catch (err) {
      setAdminMessage(err.message)
    }
  }

  const deleteAdminUser = async (user) => {
    const userName = user.full_name || user.email || user.id
    const confirmed = window.confirm(
      `${userName} kullanıcısı kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?`
    )

    if (!confirmed) {
      return
    }

    setAdminMessage('')

    try {
      const accessToken = await getAccessToken()

      if (!accessToken) {
        setAdminMessage(t.sessionMissing)
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/admin-panel`, {
        method: 'DELETE',
        headers: makeAuthorizedHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          userId: user.id,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Kullanıcı silinemedi.')
      }

      setExpandedAdminUserId('')
      setAdminMessage('Kullanıcı tamamen silindi.')
      await loadAdminPanelData()
    } catch (err) {
      setAdminMessage(err.message)
    }
  }

  const createAdminUser = async (e) => {
    e.preventDefault()
    setAdminMessage('')
    setCreatingAdminUser(true)

    try {
      const accessToken = await getAccessToken()

      if (!accessToken) {
        setAdminMessage(t.sessionMissing)
        setCreatingAdminUser(false)
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/admin-panel`, {
        method: 'POST',
        headers: makeAuthorizedHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(newAdminUser),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result.error || 'Kullanıcı oluşturulamadı.')
      }

      setNewAdminUser({
        username: '',
        full_name: '',
        password: '',
        role: 'user',
        can_view_fixing_report: false,
        can_view_shipment_report: false,
      })
      setAdminMessage('Kullanıcı eklendi.')
      await loadAdminPanelData()
    } catch (err) {
      setAdminMessage(err.message)
    }

    setCreatingAdminUser(false)
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
          ? 'Cihaz onaylandı.'
          : 'Cihaz izni kaldırıldı veya istek reddedildi.'
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

        if (!deviceResult.approved && profileData.role !== 'admin') {
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
    const handleRouteChange = () => {
      setScreen(
        window.location.pathname === DESKTOP_ADMIN_PATH ? 'desktop-admin' : 'main'
      )
    }

    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [])

  useEffect(() => {
    if (screen !== 'desktop-admin' || userProfile?.role !== 'admin') {
      return
    }

    loadAdminPanelData()
    // Masaüstü yönetim linki açıldığında admin verisi bir kez yenilenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, userProfile?.id, userProfile?.role])

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

        if (!deviceResult.approved && userProfile.role !== 'admin') {
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

  const stopMediaStream = (stream) => {
    if (!stream) {
      return
    }

    stream.getTracks().forEach((track) => track.stop())
  }

  const improveCameraTrack = async (targetStream) => {
    try {
      const stream = targetStream || videoRef.current?.srcObject

      if (!stream) {
        return
      }

      const track = stream.getVideoTracks()[0]

      if (!track || !track.getCapabilities || !track.applyConstraints) {
        return
      }

      const capabilities = track.getCapabilities()
      const advanced = []

      if (capabilities.zoom && track.getSettings) {
        const settings = track.getSettings()
        const minZoom = capabilities.zoom.min

        if (typeof minZoom === 'number' && settings.zoom !== minZoom) {
          advanced.push({ zoom: minZoom })
        }
      }

      if (
        capabilities.focusMode &&
        Array.isArray(capabilities.focusMode) &&
        capabilities.focusMode.includes('continuous')
      ) {
        advanced.push({ focusMode: 'continuous' })
      }

      if (
        capabilities.exposureMode &&
        Array.isArray(capabilities.exposureMode) &&
        capabilities.exposureMode.includes('continuous')
      ) {
        advanced.push({ exposureMode: 'continuous' })
      }

      if (
        capabilities.whiteBalanceMode &&
        Array.isArray(capabilities.whiteBalanceMode) &&
        capabilities.whiteBalanceMode.includes('continuous')
      ) {
        advanced.push({ whiteBalanceMode: 'continuous' })
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
        aspectRatio: { ideal: 16 / 9 },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        aspectRatio: { ideal: 16 / 9 },
        width: { ideal: 960 },
        height: { ideal: 540 },
      },
    },
    {
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        aspectRatio: { ideal: 4 / 3 },
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

  const getDeviceCameraConstraintProfiles = (deviceId) => [
    {
      audio: false,
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    },
    {
      audio: false,
      video: {
        deviceId: { exact: deviceId },
      },
    },
  ]

  const getPreferredCameraDeviceId = async (BrowserCodeReader) => {
    const videoInputDevices = await BrowserCodeReader.listVideoInputDevices()

    if (!videoInputDevices || videoInputDevices.length === 0) {
      return undefined
    }

    const backCamera = videoInputDevices.find((device) => {
      const label = device.label || ''
      return /back|rear|environment|arka|kamera|camera 0/i.test(label)
    })

    return (
      backCamera?.deviceId ||
      videoInputDevices[videoInputDevices.length - 1]?.deviceId
    )
  }

  const openCameraStream = async (BrowserCodeReader) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(t.cameraUnsupported)
    }

    let lastError

    for (const constraints of getCameraConstraintProfiles()) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints)
      } catch (constraintError) {
        lastError = constraintError
        console.log(
          'Camera constraint profile failed:',
          constraintError?.name || constraintError?.message || constraintError
        )
      }
    }

    try {
      const selectedDeviceId = await getPreferredCameraDeviceId(BrowserCodeReader)

      if (selectedDeviceId) {
        for (const constraints of getDeviceCameraConstraintProfiles(
          selectedDeviceId
        )) {
          try {
            return await navigator.mediaDevices.getUserMedia(constraints)
          } catch (deviceError) {
            lastError = deviceError
            console.log(
              'Camera device profile failed:',
              deviceError?.name || deviceError?.message || deviceError
            )
          }
        }
      }
    } catch (deviceListError) {
      console.log(
        'Camera device list failed:',
        deviceListError?.name || deviceListError?.message || deviceListError
      )
    }

    throw lastError || new Error(t.cameraUnsupported)
  }

  const createBarcodeReader = (
    BrowserMultiFormatReader,
    DecodeHintType,
    BarcodeFormat
  ) => {
    const hints = new Map()

    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ])
    hints.set(DecodeHintType.TRY_HARDER, true)

    return new BrowserMultiFormatReader(hints, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 300,
      tryPlayVideoTimeout: 7000,
    })
  }

  const startScanner = async () => {
    if (scannerControlsRef.current || scannerOpen || scannerStartingRef.current) {
      stopScanner()
      return
    }

    const startToken = scannerStartTokenRef.current + 1

    scannerStartTokenRef.current = startToken
    scannerStartingRef.current = true
    clearUserMessage()
    setScannerOpen(true)
    setScannerMessage(t.cameraOpening)
    scannerResultHandledRef.current = false

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 300))

      if (scannerStartTokenRef.current !== startToken) {
        return
      }

      if (!videoRef.current) {
        scannerStartingRef.current = false
        setScannerOpen(false)
        setScannerMessage('')
        showUserMessage(t.cameraAreaMissing, 'error')
        return
      }

      const [
        { BrowserCodeReader, BrowserMultiFormatReader },
        { BarcodeFormat, DecodeHintType },
      ] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ])
      const codeReader = createBarcodeReader(
        BrowserMultiFormatReader,
        DecodeHintType,
        BarcodeFormat
      )

      const handleScanResult = (result, error, controlsFromCallback) => {
        if (!result || scannerResultHandledRef.current) {
          return
        }

        const scannedText = String(result.getText() || '').trim()

        if (!scannedText) {
          return
        }

        scannerResultHandledRef.current = true

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

      const stream = await openCameraStream(BrowserCodeReader)

      if (scannerStartTokenRef.current !== startToken) {
        stopMediaStream(stream)
        return
      }

      await improveCameraTrack(stream)

      const controls = await codeReader.decodeFromStream(
        stream,
        videoRef.current,
        handleScanResult
      )

      if (scannerStartTokenRef.current !== startToken) {
        controls.stop()
        return
      }

      scannerControlsRef.current = controls
      scannerStartingRef.current = false
      setScannerMessage(t.alignBarcode)
    } catch (err) {
      if (scannerStartTokenRef.current === startToken) {
        scannerControlsRef.current = null
        scannerStartingRef.current = false
        setScannerOpen(false)
        setScannerMessage('')
        showUserMessage(t.cameraError + err.message, 'error')
      }
    }
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

      if (!deviceResult.approved && profileData.role !== 'admin') {
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
          reportLanguage: getReportLanguageForAppLanguage(),
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

  const selectedAdminLogs =
    adminLogView === 'login' ? adminData.loginLogs : adminData.reportLogs
  const visibleAdminLogs = selectedAdminLogs.slice(0, adminLogLimit)
  const pendingDevices = adminData.devices.filter((device) => device.status === 'pending')
  const approvedDevices = adminData.devices.filter((device) => device.status === 'approved')
  const pendingDeviceCount = pendingDevices.length
  const approvedDeviceCount = approvedDevices.length
  const allActiveUsers = adminData.users.filter(
    (user) => user.is_active !== false
  )
  const allInactiveUsers = adminData.users.filter(
    (user) => user.is_active === false
  )
  const activeUserCount = allActiveUsers.length
  const inactiveUserCount = allInactiveUsers.length
  const adminUserCount = adminData.users.filter((user) => user.role === 'admin').length
  const allAdminActivity = [
    ...adminData.loginLogs.map((log) => ({
      ...log,
      activityType: 'login',
      activityLabel: log.event_type === 'logout' ? 'Çıkış yaptı' : 'Giriş yaptı',
    })),
    ...adminData.reportLogs.map((log) => ({
      ...log,
      activityType: 'report',
      activityLabel: log.report_name || 'Rapor açtı',
    })),
  ]
    .sort((left, right) => {
      return new Date(right.created_at) - new Date(left.created_at)
    })
  const latestAdminActivity = allAdminActivity.slice(0, 10)
  const cleanDesktopSearch = desktopAdminSearch.trim().toLowerCase()
  const textMatchesDesktopSearch = (...values) => {
    if (!cleanDesktopSearch) {
      return true
    }

    return values.some((value) => {
      return String(value || '').toLowerCase().includes(cleanDesktopSearch)
    })
  }
  const filteredDesktopDevices = adminData.devices.filter((device) => {
    return (
      (desktopDeviceFilter === 'all' || device.status === desktopDeviceFilter) &&
      textMatchesDesktopSearch(
        device.user_name,
        device.user_email,
        device.device_name,
        device.status
      )
    )
  })
  const filteredPendingAdminDevices = filteredDesktopDevices.filter(
    (device) => device.status === 'pending'
  )
  const filteredDesktopUsers = adminData.users.filter((user) => {
    return textMatchesDesktopSearch(
      user.full_name,
      user.email,
      user.role,
      user.is_active === false ? 'pasif' : 'aktif'
    )
  })
  const filteredDesktopActivity = allAdminActivity.filter((log) => {
    return textMatchesDesktopSearch(
      log.user_name,
      log.user_email,
      log.activityLabel,
      log.barcode,
      log.device_name
    )
  })
  const visibleDesktopActivity = cleanDesktopSearch
    ? filteredDesktopActivity
    : latestAdminActivity
  const filteredDesktopReports = adminData.reportLogs.filter((log) => {
    return textMatchesDesktopSearch(
      log.user_name,
      log.user_email,
      log.report_name,
      log.report_code,
      log.barcode,
      log.device_name
    )
  })
  const desktopReportGroups = Object.values(
    filteredDesktopReports.reduce((groups, log) => {
      const groupKey = log.report_code || log.report_name || 'unknown'
      const group = groups[groupKey] || {
        key: groupKey,
        title: log.report_name || log.report_code || 'Bilinmeyen rapor',
        subtitle: log.report_code || 'Kod yok',
        count: 0,
        lastDate: log.created_at,
      }

      group.count += 1

      if (
        log.created_at &&
        (!group.lastDate || new Date(log.created_at) > new Date(group.lastDate))
      ) {
        group.lastDate = log.created_at
      }

      groups[groupKey] = group
      return groups
    }, {})
  ).sort((left, right) => new Date(right.lastDate || 0) - new Date(left.lastDate || 0))
  const desktopUserGroups = [
    {
      key: 'admins',
      title: 'Adminler',
      description: 'Cihaz onayı beklemeden yönetim yapabilen hesaplar',
      users: filteredDesktopUsers.filter((user) => user.role === 'admin'),
    },
    {
      key: 'pending',
      title: 'Onay Bekleyenler',
      description: 'Yeni cihazı yönetici onayı bekleyen kullanıcılar',
      users: filteredDesktopUsers.filter(
        (user) => user.role !== 'admin' && (user.pending_device_count || 0) > 0
      ),
    },
    {
      key: 'active',
      title: 'Aktif Kullanıcılar',
      description: 'Onaylı cihazla çalışan normal kullanıcılar',
      users: filteredDesktopUsers.filter(
        (user) =>
          user.role !== 'admin' &&
          user.is_active !== false &&
          (user.pending_device_count || 0) === 0 &&
          (user.approved_device_count || 0) > 0
      ),
    },
    {
      key: 'setup',
      title: 'Kurulum Bekleyenler',
      description: 'Henüz onaylı cihaz kaydı olmayan aktif kullanıcılar',
      users: filteredDesktopUsers.filter(
        (user) =>
          user.role !== 'admin' &&
          user.is_active !== false &&
          (user.pending_device_count || 0) === 0 &&
          (user.approved_device_count || 0) === 0
      ),
    },
    {
      key: 'inactive',
      title: 'Pasif Kullanıcılar',
      description: 'Girişi kapatılmış hesaplar',
      users: filteredDesktopUsers.filter(
        (user) => user.role !== 'admin' && user.is_active === false
      ),
    },
  ]
  const desktopDeviceGroups = [
    {
      key: 'pending',
      title: 'Onay Bekleyen Cihazlar',
      description: 'Yönetici kararı bekleyen giriş denemeleri',
      devices: filteredDesktopDevices.filter((device) => device.status === 'pending'),
    },
    {
      key: 'approved',
      title: 'Onaylı Cihazlar',
      description: 'Uygulamaya giriş yapabilen cihazlar',
      devices: filteredDesktopDevices.filter((device) => device.status === 'approved'),
    },
  ]
  const getDeviceStatusLabel = (status) => {
    if (status === 'approved') return 'Onaylı'
    if (status === 'pending') return 'Onay Bekliyor'
    return 'İzin Kaldırıldı'
  }
  const adminSections = [
    {
      key: 'logs',
      title: 'Son Hareketler',
      summary: `${selectedAdminLogs.length} kayıt`,
    },
    {
      key: 'users',
      title: 'Kullanıcı ve Cihaz Yönetimi',
      summary: `${adminData.users.length} kullanıcı`,
    },
    {
      key: 'create',
      title: 'Kullanıcı Ekle',
      summary: 'Yeni hesap',
    },
    {
      key: 'notify',
      title: 'Bildirim Gönder',
      summary: `${adminData.subscriptionCount} cihaz`,
    },
  ]
  const desktopAdminSections = [
    {
      key: 'dashboard',
      title: 'Operasyon',
      count: `${pendingDeviceCount} bekleyen`,
    },
    {
      key: 'users',
      title: 'Kullanıcılar',
      count: `${activeUserCount} aktif`,
    },
    {
      key: 'devices',
      title: 'Cihazlar',
      count: `${adminData.devices.length} cihaz`,
    },
    {
      key: 'reports',
      title: 'Raporlar',
      count: `${adminData.reportLogs.length} kayıt`,
    },
    {
      key: 'tools',
      title: 'Araçlar',
      count: 'Kullanıcı ve bildirim',
    },
  ]

  const renderDesktopDeviceCard = (device) => (
    <article key={device.id} className={`desktopEntityCard is-${device.status}`}>
      <div className="desktopEntityMain">
        <span className={`adminStatusBadge is-${device.status}`}>
          {getDeviceStatusLabel(device.status)}
        </span>
        <strong>{device.user_name || device.user_email || '-'}</strong>
        <small>{device.user_email || 'E-posta yok'}</small>
        <p>{device.device_name || 'Cihaz bilgisi alınamadı'}</p>
      </div>

      <dl className="desktopMiniMeta">
        <div>
          <dt>İlk istek</dt>
          <dd>{formatDateTime(device.created_at)}</dd>
        </div>
        <div>
          <dt>Son görülme</dt>
          <dd>{formatDateTime(device.last_seen_at)}</dd>
        </div>
      </dl>

      <div className="desktopAdminRowActions">
        {device.status !== 'approved' && (
          <button
            type="button"
            className="adminSmallButton adminApproveButton"
            onClick={() => updateAdminDevice(device.id, 'approve_device')}
          >
            Onayla
          </button>
        )}
        <button
          type="button"
          className="adminSmallButton adminRejectButton"
          onClick={() => updateAdminDevice(device.id, 'revoke_device')}
        >
          {device.status === 'approved' ? 'İzni Kaldır' : 'Reddet'}
        </button>
      </div>
    </article>
  )

  const renderDesktopUserCard = (user) => {
    const userDevices = user.devices || []
    const passwordDraft = desktopPasswordDrafts[user.id] || ''

    return (
      <article key={user.id} className="desktopEntityCard desktopUserCard">
        <div className="desktopUserCardHeader">
          <div className="desktopEntityMain">
            <span
              className={`adminStatusBadge ${
                user.is_active === false ? 'is-revoked' : 'is-approved'
              }`}
            >
              {user.is_active === false ? 'Pasif' : 'Aktif'}
            </span>
            {user.role === 'admin' && <span className="adminRoleBadge">Admin</span>}
            <strong>{user.full_name || user.email || '-'}</strong>
            <small>{user.email}</small>
          </div>

          <dl className="desktopMiniMeta">
            <div>
              <dt>Onaylı cihaz</dt>
              <dd>{user.approved_device_count || 0}</dd>
            </div>
            <div>
              <dt>Bekleyen</dt>
              <dd>{user.pending_device_count || 0}</dd>
            </div>
            <div>
              <dt>Son cihaz</dt>
              <dd>{formatDateTime(user.last_device_seen_at)}</dd>
            </div>
          </dl>
        </div>

        <div className="desktopUserBodyGrid">
          <section className="desktopSubPanel">
            <strong>Rapor Yetkileri</strong>
            <label className="desktopPermissionCheck">
              <input
                type="checkbox"
                checked={
                  user.role === 'admin' || user.can_view_fixing_report === true
                }
                disabled={user.role === 'admin'}
                onChange={(e) =>
                  updateAdminUser(user.id, {
                    can_view_fixing_report: e.target.checked,
                  })
                }
              />
              Fikse Bekleyenler
            </label>
            <label className="desktopPermissionCheck">
              <input
                type="checkbox"
                checked={
                  user.role === 'admin' || user.can_view_shipment_report === true
                }
                disabled={user.role === 'admin'}
                onChange={(e) =>
                  updateAdminUser(user.id, {
                    can_view_shipment_report: e.target.checked,
                  })
                }
              />
              Sevkiyat Takip
            </label>
            {user.role === 'admin' && (
              <small>Admin hesapları tüm raporları görür.</small>
            )}
          </section>

          <section className="desktopSubPanel">
            <strong>Şifre Yenile</strong>
            <div className="desktopInlineForm">
              <input
                type="password"
                value={passwordDraft}
                onChange={(e) =>
                  setDesktopPasswordDrafts((current) => ({
                    ...current,
                    [user.id]: e.target.value,
                  }))
                }
                placeholder="Yeni şifre"
                autoComplete="new-password"
              />
              <button
                type="button"
                className="adminSmallButton adminRoleButton"
                onClick={() => updateAdminUserPassword(user)}
              >
                Değiştir
              </button>
            </div>
          </section>
        </div>

        <section className="desktopSubPanel">
          <strong>Cihazlar</strong>
          <div className="desktopDeviceChips">
            {userDevices.map((device) => (
              <span key={device.id} className={`desktopDeviceChip is-${device.status}`}>
                {getDeviceStatusLabel(device.status)} · {device.device_name || 'Cihaz'}
              </span>
            ))}
            {userDevices.length === 0 && (
              <span className="desktopDeviceChip">Cihaz kaydı yok</span>
            )}
          </div>
        </section>

        <div className="desktopAdminRowActions">
          <button
            type="button"
            className={`adminSmallButton ${
              user.is_active === false ? 'adminApproveButton' : 'adminRejectButton'
            }`}
            onClick={() =>
              updateAdminUser(user.id, {
                is_active: user.is_active === false,
              })
            }
            disabled={user.id === userProfile.id && user.is_active !== false}
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
            disabled={user.id === userProfile.id}
          >
            {user.role === 'admin' ? 'User Yap' : 'Admin Yap'}
          </button>
          <button
            type="button"
            className="adminSmallButton adminDeleteUserButton"
            onClick={() => deleteAdminUser(user)}
            disabled={user.id === userProfile.id}
          >
            Tamamen Sil
          </button>
        </div>
      </article>
    )
  }

  const renderDesktopActivityItem = (log) => (
    <article key={`${log.activityType}-${log.id}`} className="desktopTimelineItem">
      <div>
        <span>{log.activityType === 'report' ? 'Rapor' : 'Oturum'}</span>
        <strong>{log.user_name || log.user_email || '-'}</strong>
        <small>
          {log.activityLabel}
          {log.barcode ? ` · ${log.barcode}` : ''}
        </small>
      </div>
      <time>{formatDateTime(log.created_at)}</time>
    </article>
  )

  const dateRangeDayCount = getDateRangeDayCount(startDate, endDate)

  if (startupSplashVisible) {
    return <StartupSplash onComplete={hideStartupSplash} />
  }

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

  if (userProfile && screen === 'desktop-admin') {
    if (userProfile.role !== 'admin') {
      return (
        <div className="desktopAdminPage" dir="ltr">
          <main className="desktopAdminAccessCard">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />
            <h1>Yönetim erişimi yok</h1>
            <p>Bu sayfayı kullanmak için admin yetkisi gerekir.</p>
            <button type="button" className="logoutButton" onClick={handleLogout}>
              {t.logout}
            </button>
          </main>
        </div>
      )
    }

    return (
      <div className="desktopAdminPage" dir="ltr">
        <aside className="desktopAdminSidebar">
          <div className="desktopAdminBrand">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />
            <div>
              <strong>ELVAN Admin Panel</strong>
              <span>Kullanıcı, cihaz ve rapor yönetimi</span>
            </div>
          </div>

          <nav className="desktopAdminNav" aria-label="Yönetim bölümleri">
            {desktopAdminSections.map((section) => (
              <button
                key={section.key}
                type="button"
                className={
                  activeDesktopAdminView === section.key ? 'isActive' : ''
                }
                onClick={() => setActiveDesktopAdminView(section.key)}
              >
                <span>{section.title}</span>
                <small>{section.count}</small>
              </button>
            ))}
          </nav>

          <div className="desktopAdminSidebarFooter">
            <div className="desktopAdminProfile">
              <span className="desktopAdminProfileAvatar" aria-hidden="true">
                {(userProfile.full_name || userProfile.email || 'A')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <strong>
                  {userProfile.full_name || userProfile.email || 'Yönetici'}
                </strong>
                <small>Yönetici hesabı</small>
              </div>
            </div>

            <button
              type="button"
              className="desktopAdminLogout"
              onClick={handleLogout}
            >
              {t.logout}
            </button>
          </div>
        </aside>

        <main className="desktopAdminMain">
          <header className="desktopAdminHeader">
            <div className="desktopAdminHeaderCopy">
              <span className="eyebrow">ELVAN ADMIN PANEL</span>
              <h1>
                {desktopAdminSections.find(
                  (section) => section.key === activeDesktopAdminView
                )?.title || 'Yönetim'}
              </h1>
              <p>Canlı kullanıcı, cihaz ve rapor yönetimi</p>
            </div>

            <div className="desktopAdminHeaderActions">
              <input
                type="search"
                value={desktopAdminSearch}
                onChange={(e) => setDesktopAdminSearch(e.target.value)}
                placeholder="Kullanıcı, cihaz, barkod ara"
                aria-label="Yönetim panelinde ara"
              />

              <select
                value={desktopDeviceFilter}
                onChange={(e) => setDesktopDeviceFilter(e.target.value)}
                aria-label="Cihaz durum filtresi"
              >
                <option value="all">Tüm cihazlar</option>
                <option value="pending">Onay bekleyen</option>
                <option value="approved">Onaylı</option>
              </select>

              <button
                type="button"
                className="desktopAdminRefresh"
                onClick={loadAdminPanelData}
                disabled={adminLoading}
              >
                {adminLoading ? 'Yenileniyor...' : 'Verileri Yenile'}
              </button>
            </div>
          </header>

          {adminMessage && <p className="message">{adminMessage}</p>}

          <section className="desktopAdminRuleStrip">
            <strong>Cihaz kuralı</strong>
            <span>
              Admin cihazları otomatik onaylanır. Normal kullanıcıda ilk cihaz otomatik açılır, sonraki cihazlar onay bekler.
            </span>
          </section>

          {activeDesktopAdminView === 'dashboard' && (
            <section className="desktopAdminContent">
              <div className="desktopAdminStats">
                <article>
                  <span>Aktif Kullanıcı</span>
                  <strong>{activeUserCount}</strong>
                  <small>{inactiveUserCount} pasif kullanıcı</small>
                </article>
                <article>
                  <span>Onay Bekleyen</span>
                  <strong>{pendingDeviceCount}</strong>
                  <small>{approvedDeviceCount} onaylı cihaz</small>
                </article>
                <article>
                  <span>Admin</span>
                  <strong>{adminUserCount}</strong>
                  <small>Yönetici hesabı</small>
                </article>
                <article>
                  <span>Rapor Log</span>
                  <strong>{adminData.reportLogs.length}</strong>
                  <small>{adminData.loginLogs.length} giriş kaydı</small>
                </article>
              </div>

              <div className="desktopAdminTwoColumn">
                <section className="desktopAdminPanel desktopPriorityPanel">
                  <div className="desktopPanelHeader">
                    <div>
                      <strong>Bugün Bakılacaklar</strong>
                      <small>Panel otomatik olarak dikkat isteyen işleri öne alır.</small>
                    </div>
                    <span>{filteredPendingAdminDevices.length}</span>
                  </div>

                  <div className="desktopEntityGrid">
                    {filteredPendingAdminDevices.map(renderDesktopDeviceCard)}

                    {filteredPendingAdminDevices.length === 0 && (
                      <p className="adminEmptyState">
                        Onay bekleyen cihaz yok. Operasyon temiz görünüyor.
                      </p>
                    )}
                  </div>
                </section>

                <section className="desktopAdminPanel">
                  <div className="desktopPanelHeader">
                    <div>
                      <strong>Son Hareketler</strong>
                      <small>Girişler ve rapor görüntülemeleri birlikte listelenir.</small>
                    </div>
                    <span>{visibleDesktopActivity.length}</span>
                  </div>

                  <div className="desktopTimeline">
                    {visibleDesktopActivity.map(renderDesktopActivityItem)}

                    {visibleDesktopActivity.length === 0 && (
                      <p className="adminEmptyState">Kayıt bulunamadı.</p>
                    )}
                  </div>
                </section>
              </div>

              <section className="desktopAdminPanel">
                <div className="desktopPanelHeader">
                  <div>
                    <strong>Kullanıcı Grupları</strong>
                    <small>Kayıtlar role, cihaz durumuna ve aktifliğe göre ayrılır.</small>
                  </div>
                  <span>{filteredDesktopUsers.length}</span>
                </div>

                <div className="desktopGroupSummaryGrid">
                  {desktopUserGroups.map((group) => (
                    <article key={group.key}>
                      <span>{group.title}</span>
                      <strong>{group.users.length}</strong>
                      <small>{group.description}</small>
                    </article>
                  ))}
                </div>
              </section>
            </section>
          )}

          {activeDesktopAdminView === 'devices' && (
            <section className="desktopAdminContent">
              {desktopDeviceGroups.map((group) => (
                <section key={group.key} className="desktopAdminPanel">
                  <div className="desktopPanelHeader">
                    <div>
                      <strong>{group.title}</strong>
                      <small>{group.description}</small>
                    </div>
                    <span>{group.devices.length}</span>
                  </div>

                  <div className="desktopEntityGrid">
                    {group.devices.map(renderDesktopDeviceCard)}
                    {group.devices.length === 0 && (
                      <p className="adminEmptyState">Bu grupta cihaz yok.</p>
                    )}
                  </div>
                </section>
              ))}

              <div className="desktopAdminRuleStrip">
                <strong>Not</strong>
                <span>
                  Reddedilen veya izni kaldırılan cihazlar günlük yönetim listesinden gizlenir.
                </span>
              </div>
            </section>
          )}

          {activeDesktopAdminView === 'users' && (
            <section className="desktopAdminContent">
              {desktopUserGroups.map((group) => (
                <section key={group.key} className="desktopAdminPanel">
                  <div className="desktopPanelHeader">
                    <div>
                      <strong>{group.title}</strong>
                      <small>{group.description}</small>
                    </div>
                    <span>{group.users.length}</span>
                  </div>

                  <div className="desktopUserGrid">
                    {group.users.map(renderDesktopUserCard)}
                    {group.users.length === 0 && (
                      <p className="adminEmptyState">Bu grupta kullanıcı yok.</p>
                    )}
                  </div>
                </section>
              ))}
            </section>
          )}

          {activeDesktopAdminView === 'reports' && (
            <section className="desktopAdminContent">
              <section className="desktopAdminPanel">
                <div className="desktopPanelHeader">
                  <div>
                    <strong>Rapor Grupları</strong>
                    <small>Rapor hareketleri rapor koduna göre otomatik özetlenir.</small>
                  </div>
                  <span>{desktopReportGroups.length}</span>
                </div>

                <div className="desktopGroupSummaryGrid">
                  {desktopReportGroups.map((group) => (
                    <article key={group.key}>
                      <span>{group.title}</span>
                      <strong>{group.count}</strong>
                      <small>
                        {group.subtitle} · Son: {formatDateTime(group.lastDate)}
                      </small>
                    </article>
                  ))}
                  {desktopReportGroups.length === 0 && (
                    <p className="adminEmptyState">Rapor kaydı bulunamadı.</p>
                  )}
                </div>
              </section>

              <section className="desktopAdminPanel">
                <div className="desktopPanelHeader">
                  <div>
                    <strong>Rapor Hareketleri</strong>
                    <small>Arama alanı kullanıcı, barkod, rapor ve cihaz üzerinde çalışır.</small>
                  </div>
                  <span>{filteredDesktopReports.length}</span>
                </div>

                <div className="desktopTableWrap">
                  <table className="desktopAdminTable">
                    <thead>
                      <tr>
                        <th>Tarih</th>
                        <th>Kullanıcı</th>
                        <th>Rapor</th>
                        <th>Barkod</th>
                        <th>Cihaz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDesktopReports.map((log) => (
                        <tr key={log.id}>
                          <td>{formatDateTime(log.created_at)}</td>
                          <td>
                            <strong>{log.user_name || '-'}</strong>
                            <small>{log.user_email || ''}</small>
                          </td>
                          <td>
                            <strong>{log.report_name || '-'}</strong>
                            <small>{log.report_code || ''}</small>
                          </td>
                          <td>{log.barcode || '-'}</td>
                          <td>{log.device_name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </section>
          )}

          {activeDesktopAdminView === 'tools' && (
            <section className="desktopToolsGrid">
              <section className="desktopAdminPanel desktopFormPanel">
                <div className="desktopPanelHeader">
                  <div>
                    <strong>Kullanıcı Ekle</strong>
                    <small>Supabase Auth ve profil kaydı birlikte oluşturulur.</small>
                  </div>
                  <span>Yeni</span>
                </div>

                <form className="adminCreateUserForm" onSubmit={createAdminUser}>
                  <div className="adminFormGrid">
                    <label>
                      Kullanıcı Adı
                      <input
                        type="text"
                        value={newAdminUser.username}
                        onChange={(e) =>
                          setNewAdminUser((current) => ({
                            ...current,
                            username: e.target.value,
                          }))
                        }
                        placeholder="ornek: ahmet"
                        autoComplete="off"
                        disabled={creatingAdminUser}
                      />
                    </label>

                    <label>
                      Ad Soyad
                      <input
                        type="text"
                        value={newAdminUser.full_name}
                        onChange={(e) =>
                          setNewAdminUser((current) => ({
                            ...current,
                            full_name: e.target.value,
                          }))
                        }
                        placeholder="Kullanıcı adı"
                        autoComplete="off"
                        disabled={creatingAdminUser}
                      />
                    </label>

                    <label>
                      Şifre
                      <input
                        type="password"
                        value={newAdminUser.password}
                        onChange={(e) =>
                          setNewAdminUser((current) => ({
                            ...current,
                            password: e.target.value,
                          }))
                        }
                        placeholder="Şifre"
                        autoComplete="new-password"
                        disabled={creatingAdminUser}
                      />
                    </label>

                    <label>
                      Rol
                      <select
                        value={newAdminUser.role}
                        onChange={(e) =>
                          setNewAdminUser((current) => ({
                            ...current,
                            role: e.target.value,
                          }))
                        }
                        disabled={creatingAdminUser}
                      >
                        <option value="user">Kullanıcı</option>
                        <option value="admin">Admin</option>
                      </select>
                    </label>
                  </div>

                  <div className="adminPermissionPanel">
                    <strong>Başlangıç Rapor Yetkileri</strong>
                    <label className="adminPermissionToggle">
                      <input
                        type="checkbox"
                        checked={
                          newAdminUser.role === 'admin' ||
                          newAdminUser.can_view_fixing_report
                        }
                        disabled={creatingAdminUser || newAdminUser.role === 'admin'}
                        onChange={(e) =>
                          setNewAdminUser((current) => ({
                            ...current,
                            can_view_fixing_report: e.target.checked,
                          }))
                        }
                      />
                      <span>Fikse Bekleyenler</span>
                    </label>

                    <label className="adminPermissionToggle">
                      <input
                        type="checkbox"
                        checked={
                          newAdminUser.role === 'admin' ||
                          newAdminUser.can_view_shipment_report
                        }
                        disabled={creatingAdminUser || newAdminUser.role === 'admin'}
                        onChange={(e) =>
                          setNewAdminUser((current) => ({
                            ...current,
                            can_view_shipment_report: e.target.checked,
                          }))
                        }
                      />
                      <span>Sevkiyat Takip</span>
                    </label>
                    {newAdminUser.role === 'admin' && (
                      <small>Admin kullanıcıları tüm raporları görebilir.</small>
                    )}
                  </div>

                  <button
                    type="submit"
                    className="mainButton"
                    disabled={creatingAdminUser}
                  >
                    {creatingAdminUser ? 'Ekleniyor...' : 'Kullanıcı Ekle'}
                  </button>
                </form>
              </section>

              <section className="desktopAdminPanel desktopFormPanel">
                <div className="desktopPanelHeader">
                  <div>
                    <strong>Bildirim Gönder</strong>
                    <small>Bildirim izni olan cihazlara gönderilir.</small>
                  </div>
                  <span>{adminData.subscriptionCount}</span>
                </div>

                <label htmlFor="desktopNotificationTitle">Bildirim Başlığı</label>
                <input
                  id="desktopNotificationTitle"
                  type="text"
                  value={adminNotificationTitle}
                  onChange={(e) => setAdminNotificationTitle(e.target.value)}
                  placeholder="Elvan Barkod Rapor"
                  disabled={adminNotificationSending}
                />

                <label htmlFor="desktopNotificationBody">Bildirim Mesajı</label>
                <textarea
                  id="desktopNotificationBody"
                  className="adminTextarea"
                  value={adminNotificationBody}
                  onChange={(e) => setAdminNotificationBody(e.target.value)}
                  placeholder="Gönderilecek mesajı yaz"
                  disabled={adminNotificationSending}
                  rows={5}
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
              </section>
            </section>
          )}

        </main>
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
                {activeUserCount} aktif / {adminData.users.length} toplam
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
                {pendingDeviceCount}
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

          <div className="adminSectionNav" role="tablist" aria-label="Admin bölümleri">
            {adminSections.map((section) => (
              <button
                key={section.key}
                type="button"
                role="tab"
                aria-selected={activeAdminSection === section.key}
                className={`adminSectionButton${
                  activeAdminSection === section.key ? ' isActive' : ''
                }`}
                onClick={() => setActiveAdminSection(section.key)}
              >
                <strong>{section.title}</strong>
                <span>{section.summary}</span>
              </button>
            ))}
          </div>

          {activeAdminSection === 'notify' && (
          <div className="historyBox adminSectionPanel">
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
          )}

          {activeAdminSection === 'create' && (
          <div className="historyBox adminSectionPanel">
            <div className="historyHeader">
              <strong>Kullanıcı Ekle</strong>
            </div>

            <form className="adminCreateUserForm" onSubmit={createAdminUser}>
              <div className="adminFormGrid">
                <label>
                  Kullanıcı Adı
                  <input
                    type="text"
                    value={newAdminUser.username}
                    onChange={(e) =>
                      setNewAdminUser((current) => ({
                        ...current,
                        username: e.target.value,
                      }))
                    }
                    placeholder="ornek: ahmet"
                    autoComplete="off"
                    disabled={creatingAdminUser}
                  />
                </label>

                <label>
                  Ad Soyad
                  <input
                    type="text"
                    value={newAdminUser.full_name}
                    onChange={(e) =>
                      setNewAdminUser((current) => ({
                        ...current,
                        full_name: e.target.value,
                      }))
                    }
                    placeholder="Kullanıcı adı"
                    autoComplete="off"
                    disabled={creatingAdminUser}
                  />
                </label>

                <label>
                  Şifre
                  <input
                    type="password"
                    value={newAdminUser.password}
                    onChange={(e) =>
                      setNewAdminUser((current) => ({
                        ...current,
                        password: e.target.value,
                      }))
                    }
                    placeholder="Şifre"
                    autoComplete="new-password"
                    disabled={creatingAdminUser}
                  />
                </label>

                <label>
                  Rol
                  <select
                    value={newAdminUser.role}
                    onChange={(e) =>
                      setNewAdminUser((current) => ({
                        ...current,
                        role: e.target.value,
                      }))
                    }
                    disabled={creatingAdminUser}
                  >
                    <option value="user">Kullanıcı</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </div>

              <div className="adminPermissionPanel">
                <strong>Başlangıç Rapor Yetkileri</strong>
                <label className="adminPermissionToggle">
                  <input
                    type="checkbox"
                    checked={
                      newAdminUser.role === 'admin' ||
                      newAdminUser.can_view_fixing_report
                    }
                    disabled={creatingAdminUser || newAdminUser.role === 'admin'}
                    onChange={(e) =>
                      setNewAdminUser((current) => ({
                        ...current,
                        can_view_fixing_report: e.target.checked,
                      }))
                    }
                  />
                  <span>Fikse Bekleyenler</span>
                </label>

                <label className="adminPermissionToggle">
                  <input
                    type="checkbox"
                    checked={
                      newAdminUser.role === 'admin' ||
                      newAdminUser.can_view_shipment_report
                    }
                    disabled={creatingAdminUser || newAdminUser.role === 'admin'}
                    onChange={(e) =>
                      setNewAdminUser((current) => ({
                        ...current,
                        can_view_shipment_report: e.target.checked,
                      }))
                    }
                  />
                  <span>Sevkiyat Takip</span>
                </label>
                {newAdminUser.role === 'admin' && (
                  <small>Admin kullanıcıları tüm raporları görebilir.</small>
                )}
              </div>

              <button
                type="submit"
                className="mainButton"
                disabled={creatingAdminUser}
              >
                {creatingAdminUser ? 'Ekleniyor...' : 'Kullanıcı Ekle'}
              </button>
            </form>
          </div>
          )}

          {activeAdminSection === 'users' && (
          <div className="historyBox adminSectionPanel">
            <div className="historyHeader">
              <strong>Kullanıcı ve Cihaz Yönetimi</strong>
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

                        <div className="adminUserDevices">
                          <strong>Cihazlar</strong>

                          {(user.devices || []).length === 0 && (
                            <p className="adminEmptyState">Bu kullanıcı için cihaz kaydı yok.</p>
                          )}

                          {(user.devices || []).map((device) => {
                            const statusLabel =
                              device.status === 'approved'
                                ? 'Onaylı'
                                : device.status === 'pending'
                                  ? 'Onay Bekliyor'
                                  : 'Reddedildi'

                            return (
                              <div key={device.id} className="adminDeviceRow">
                                <div className="adminDeviceInfo">
                                  <strong>{device.device_name || 'Bilinmeyen cihaz'}</strong>
                                  <small>
                                    İlk istek: {formatDateTime(device.created_at)}
                                  </small>
                                  <small>
                                    Son görülme: {formatDateTime(device.last_seen_at)}
                                  </small>
                                </div>

                                <div className="adminDeviceControls">
                                  <span className={`adminStatusBadge is-${device.status}`}>
                                    {statusLabel}
                                  </span>

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
                            )
                          })}
                        </div>

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

                        <p className="adminActionNote">
                          Pasif kullanıcı giriş yapamaz. Cihaz iznini kaldırmak sadece seçili cihazı etkiler.
                        </p>

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
                            {user.is_active === false
                              ? 'Kullanıcıyı Aktif Yap'
                              : 'Kullanıcıyı Pasif Yap'}
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

                          <button
                            type="button"
                            className="adminSmallButton adminDeleteUserButton"
                            onClick={() => deleteAdminUser(user)}
                            disabled={user.id === userProfile.id}
                            title={
                              user.id === userProfile.id
                                ? 'Kendi kullanıcını buradan silemezsin.'
                                : 'Kullanıcıyı tamamen sil'
                            }
                          >
                            Kullanıcıyı Tamamen Sil
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
          )}

          {activeAdminSection === 'logs' && (
          <div className="historyBox adminSectionPanel">
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
          )}

          <button type="button" className="logoutButton" onClick={handleLogout}>
            {t.logout}
          </button>

          <AppFooter
            text={`${t.versionText} ${APP_VERSION}`}
            privacyLabel={t.privacyPolicy}
          />
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

          <AppFooter
            text={`${t.versionText} ${APP_VERSION}`}
            privacyLabel={t.privacyPolicy}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={screen === 'desktop-admin' ? 'desktopAdminLoginPage' : 'page'}
      dir={isArabic ? 'rtl' : 'ltr'}
    >
      {screen === 'desktop-admin' && (
        <aside className="desktopAdminLoginIntro" dir="ltr">
          <div className="desktopAdminLoginBrand">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />
            <span>ELVAN DYEING</span>
          </div>

          <div className="desktopAdminLoginMessage">
            <span className="eyebrow">YÖNETİM MERKEZİ</span>
            <h1>Operasyonunuz tek ekranda.</h1>
            <p>
              Kullanıcılar, cihaz izinleri ve rapor hareketleri için güvenli
              masaüstü çalışma alanı.
            </p>
          </div>

          <div className="desktopAdminLoginHighlights">
            <span>Canlı kullanıcı yönetimi</span>
            <span>Cihaz onay ve erişim kontrolü</span>
            <span>Rapor hareketleri ve yetkiler</span>
          </div>
        </aside>
      )}

      <div
        className={screen === 'desktop-admin' ? 'card desktopAdminLoginCard' : 'card'}
      >
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
          <h1>
            {screen === 'desktop-admin' ? 'ELVAN Admin Panel' : t.appTitle}
          </h1>
          <p className="subtitle">
            {screen === 'desktop-admin'
              ? 'Kullanıcı, cihaz ve rapor yönetimi'
              : t.appSubtitle}
          </p>
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

        <AppFooter
          text={`${t.versionText} ${APP_VERSION}`}
          privacyLabel={t.privacyPolicy}
        />
      </div>
    </div>
  )
}

export default App
