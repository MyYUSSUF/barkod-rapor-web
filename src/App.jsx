import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { PushNotifications } from '@capacitor/push-notifications'
import {
  AppUpdate,
  AppUpdateAvailability,
  AppUpdateResultCode,
  FlexibleUpdateInstallStatus,
} from '@capawesome/capacitor-app-update'
import {
  confirmBarcodeCandidate,
  isBarcodeCenteredInFrame,
} from './lib/scannerValidation'
import {
  applyCameraTorch,
  supportsCameraTorch,
} from './lib/cameraTorch'
import {
  shouldRequestNativeNotificationPermission,
  shouldShowNativeNotificationRecovery,
} from './lib/nativeNotificationPermission'
import {
  ANDROID_BACK_ACTION,
  resolveAndroidBackAction,
} from './lib/androidBackNavigation'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'
import { ReportList } from './components/ReportList'
import { ConfirmationDialog } from './components/ConfirmationDialog'
import { SelectionDialog } from './components/SelectionDialog'
import {
  decideAndroidUpdateState,
  decideNativeUpdateState,
  isValidAppUpdatePolicy,
  normalizeAppUpdatePolicy,
  PLAY_UPDATE_STATUS,
  REMOTE_POLICY_STATUS,
} from './lib/appUpdatePolicy'
import {
  advanceSessionLifecycle,
  isAuthSessionUser,
  isSessionLifecycleCurrent,
} from './lib/sessionLifecycle'
import { blurAndroidImeTarget } from './lib/androidSystemInsets'
import './App.css'
import './IndustrialTheme.css'

const NativePdfViewer = lazy(() => import('./NativePdfViewer'))
const AndroidUpdateRecovery = registerPlugin('AndroidUpdateRecovery')

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
const NATIVE_NOTIFICATION_PERMISSION_ASKED_KEY =
  'barkod_rapor_native_notification_permission_asked_v1'
const NATIVE_NOTIFICATION_CHANNEL_ID = 'elvan_notifications'
const APP_UPDATE_POLICY_CACHE_KEY_PREFIX = 'barkod_rapor_update_policy_v2'
const REPORT_TIMEOUT_MS = 45000
const DEVICE_ACCESS_CHECK_MS = 10000
const APP_UPDATE_PERIODIC_CHECK_MS = 12 * 60 * 1000
const NOTIFICATION_OPERATION_TIMEOUT_MS = 10000
const NOTIFICATION_SEND_TIMEOUT_MS = 30000
const DESKTOP_ADMIN_PATH = '/yonetim'
const APP_VERSION = 'v1.32'
const APP_LOG_VERSION = 'web-v1.32'
const APP_UPDATE_PACKAGE_NAME = 'com.elvandying.barkodrapor'
const IOS_APP_STORE_ID = String(import.meta.env.VITE_IOS_APP_STORE_ID || '').trim()
const IOS_PUSH_PLATFORM =
  import.meta.env.VITE_IOS_PUSH_PLATFORM === 'ios-sandbox'
    ? 'ios-sandbox'
    : 'ios'
const ALL_ANDROID_UPDATES_MANDATORY = true
const ALL_IOS_UPDATES_MANDATORY = true
const LANGUAGE_OPTIONS = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
]
const PROFILE_SELECT_FIELDS =
  'id, email, full_name, role, is_active, can_view_fixing_report, can_view_shipment_report, can_view_yarn_stock_report'
const PROFILE_SELECT_FALLBACK_FIELDS =
  'id, email, full_name, role, is_active, can_view_fixing_report, can_view_shipment_report'

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
    permissionKey: 'can_view_yarn_stock_report',
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
    flashlight: 'Fener',
    turnFlashlightOn: 'Feneri aç',
    turnFlashlightOff: 'Feneri kapat',
    recentBarcodes: 'Son Barkodlar',
    clear: 'Temizle',
    selectedBarcode: 'Barkod seçildi',
    selectedDateRange: 'Seçilen tarih aralığı',
    selectedDayCount: 'gün',
    scannerReady: 'Okutmaya hazır',
    logout: 'Çıkış Yap',
    logoutTitle: 'Çıkış yapılsın mı?',
    logoutConfirm: 'Çıkış yapmak istediğinize emin misiniz?',
    cancel: 'Vazgeç',
    privacyPolicy: 'Gizlilik Politikası',
    usernamePasswordRequired: 'Kullanıcı adı ve şifre zorunludur.',
    loginFailed: 'Giriş başarısız',
    profileNotFound: 'Profil bilgisi bulunamadı.',
    inactiveBlocked: 'Bu kullanıcı pasif durumda. Giriş engellendi.',
    inactiveAutoLogout: 'Bu kullanıcı pasif yapıldı. Oturum kapatıldı.',
    logoutSuccess: 'Çıkış yapıldı.',
    logoutNotificationCleanupWarning:
      'Çıkış yapıldı; bu cihazın bildirim kaydı sunucuda tamamen temizlenemedi.',
    barcodeRequired: 'Önce barkod girilmelidir.',
    dateRangeRequired: 'Başlangıç tarihi ve bitiş tarihi zorunludur.',
    dateRangeInvalid: 'Başlangıç tarihi bitiş tarihinden sonra olamaz.',
    selectDateRange: 'Sevkiyat Takip için tarih aralığını seçin.',
    customer: 'Müşteri',
    selectCustomer: 'Müşteri seçin',
    customerRequired: 'Sevkiyat raporu için müşteri seçilmelidir.',
    selectedCustomer: 'Seçilen müşteri',
    openReport: 'Raporu Aç',
    languageSelection: 'Dil seçimi',
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
    selectDate: 'Tarih seçin',
    previousMonth: 'Önceki ay',
    nextMonth: 'Sonraki ay',
    today: 'Bugün',
    reportCouldNotLoad: 'Rapor yüklenemedi.',
    versionText: 'Barkod Rapor Web',
    notificationUnsupported: 'Bu cihaz veya tarayıcı bildirimleri desteklemiyor.',
    notificationDenied: 'Bildirim izni verilmedi.',
    notificationKeyMissing: 'Bildirim anahtarı eksik. Vercel ayarlarını kontrol edin.',
    notificationSaved: 'Bildirimler açıldı. Bu cihaza bildirim gelebilir.',
    notificationError: 'Bildirim açılırken hata oluştu: ',
    notificationSettingsTitle: 'Bildirimler kapalı',
    notificationSettingsBody:
      'Bu cihazda bildirim izni kapalı. İstersen Android ayarlarından açabilirsin.',
    notificationSettingsButton: 'Bildirim Ayarlarını Aç',
    devicePending: 'Bu cihaz yönetici onayı bekliyor.',
    deviceRevoked: 'Bu cihazın erişim izni kaldırıldı.',
    deviceAccessFailed: 'Cihaz doğrulaması yapılamadı: ',
    appUpdateTitle: 'Yeni sürüm mevcut',
    appUpdateBody:
      'ELVAN için yeni bir güncelleme var. Şimdi güncelleyebilir veya daha sonra devam edebilirsiniz.',
    appUpdateNow: 'Güncelle',
    appUpdateLater: 'Sonra',
    appUpdateOpening: 'Güncelleme hazırlanıyor...',
    appUpdateDownloading: 'Güncelleme indiriliyor',
    appUpdateDownloaded: 'Güncelleme indirildi',
    appUpdateDownloadedBody:
      'İndirme tamamlandı. Kurulum için uygulama yeniden başlatılacak.',
    appUpdateRestart: 'Yükle ve Yeniden Başlat',
    appUpdateStore: 'Uygulama Mağazasını Aç',
    appUpdateFailed:
      'Güncelleme başlatılamadı. Uygulama mağazasından güncelleyebilirsiniz.',
    appUpdateCanceled:
      'Güncelleme iptal edildi. Daha sonra tekrar deneyebilirsiniz.',
    appUpdateVersion: 'Sürüm',
    appUpdateRequiredTitle: 'Güncelleme gerekli',
    appUpdateRequiredBody:
      'Uygulamaya devam etmek için en son sürümü yükleyin.',
    appUpdateCheckingTitle: 'Sürüm kontrol ediliyor',
    appUpdateCheckingBody: 'Google Play ve güncelleme politikası kontrol ediliyor.',
    appUpdateCheckFailed:
      'Google Play sürüm kontrolü tamamlanamadı. İnternet bağlantınızı kontrol edip yeniden deneyin.',
    appUpdateRetry: 'Tekrar dene',
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
    flashlight: 'Light',
    turnFlashlightOn: 'Turn light on',
    turnFlashlightOff: 'Turn light off',
    recentBarcodes: 'Recent Barcodes',
    clear: 'Clear',
    selectedBarcode: 'Barcode selected',
    selectedDateRange: 'Selected date range',
    selectedDayCount: 'days',
    scannerReady: 'Ready to scan',
    logout: 'Logout',
    logoutTitle: 'Log out?',
    logoutConfirm: 'Are you sure you want to logout?',
    cancel: 'Cancel',
    privacyPolicy: 'Privacy Policy',
    usernamePasswordRequired: 'Username and password are required.',
    loginFailed: 'Login failed',
    profileNotFound: 'Profile information not found.',
    inactiveBlocked: 'This user is inactive. Login blocked.',
    inactiveAutoLogout: 'This user was deactivated. Session closed.',
    logoutSuccess: 'Logged out.',
    logoutNotificationCleanupWarning:
      'You were logged out, but this device notification record could not be fully removed from the server.',
    barcodeRequired: 'Barcode is required first.',
    dateRangeRequired: 'Start date and end date are required.',
    dateRangeInvalid: 'Start date cannot be after end date.',
    selectDateRange: 'Select a date range for Shipment Tracking.',
    customer: 'Customer',
    selectCustomer: 'Select customer',
    customerRequired: 'A customer must be selected for the shipment report.',
    selectedCustomer: 'Selected customer',
    openReport: 'Open Report',
    languageSelection: 'Language selection',
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
    fixingWaiting: 'Heat Setting',
    shipmentTracking: 'Shipment Tracking',
    yarnStock: 'Yarn Stock Report',
    startDate: 'Start Date',
    endDate: 'End Date',
    reportPagePreparing: 'Report is preparing...',
    pleaseWait: 'Please wait.',
    close: 'Close',
    selectDate: 'Select date',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    today: 'Today',
    reportCouldNotLoad: 'Report could not be loaded.',
    versionText: 'Barcode Report Web',
    notificationUnsupported: 'This device or browser does not support notifications.',
    notificationDenied: 'Notification permission was not granted.',
    notificationKeyMissing: 'Notification key is missing. Check Vercel settings.',
    notificationSaved: 'Notifications enabled. This device can receive notifications.',
    notificationError: 'Notification setup failed: ',
    notificationSettingsTitle: 'Notifications are off',
    notificationSettingsBody:
      'Notification permission is disabled on this device. You can enable it in Android settings.',
    notificationSettingsButton: 'Open Notification Settings',
    devicePending: 'This device is waiting for administrator approval.',
    deviceRevoked: 'Access for this device has been revoked.',
    deviceAccessFailed: 'Device verification failed: ',
    appUpdateTitle: 'New version available',
    appUpdateBody:
      'A new ELVAN update is available. You can update now or continue later.',
    appUpdateNow: 'Update',
    appUpdateLater: 'Later',
    appUpdateOpening: 'Preparing update...',
    appUpdateDownloading: 'Downloading update',
    appUpdateDownloaded: 'Update downloaded',
    appUpdateDownloadedBody:
      'Download is complete. The app will restart to install the update.',
    appUpdateRestart: 'Install and Restart',
    appUpdateStore: 'Open Store',
    appUpdateFailed:
      'The update could not be started. You can update from the app store.',
    appUpdateCanceled:
      'The update was cancelled. You can try again later.',
    appUpdateVersion: 'Version',
    appUpdateRequiredTitle: 'Update required',
    appUpdateRequiredBody:
      'Install the latest version to continue using the application.',
    appUpdateCheckingTitle: 'Checking app version',
    appUpdateCheckingBody: 'Checking Google Play and the update policy.',
    appUpdateCheckFailed:
      'The Google Play version check could not be completed. Check your connection and try again.',
    appUpdateRetry: 'Try again',
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
    flashlight: 'المصباح',
    turnFlashlightOn: 'تشغيل المصباح',
    turnFlashlightOff: 'إطفاء المصباح',
    recentBarcodes: 'آخر الباركودات',
    clear: 'مسح',
    selectedBarcode: 'تم اختيار الباركود',
    selectedDateRange: 'نطاق التاريخ المحدد',
    selectedDayCount: 'أيام',
    scannerReady: 'جاهز للمسح',
    logout: 'تسجيل الخروج',
    logoutTitle: 'تسجيل الخروج؟',
    logoutConfirm: 'هل أنت متأكد أنك تريد تسجيل الخروج؟',
    cancel: 'إلغاء',
    privacyPolicy: 'سياسة الخصوصية',
    usernamePasswordRequired: 'اسم المستخدم وكلمة المرور مطلوبان.',
    loginFailed: 'فشل تسجيل الدخول',
    profileNotFound: 'لم يتم العثور على بيانات الملف الشخصي.',
    inactiveBlocked: 'هذا المستخدم غير نشط. تم منع الدخول.',
    inactiveAutoLogout: 'تم تعطيل هذا المستخدم. تم إغلاق الجلسة.',
    logoutSuccess: 'تم تسجيل الخروج.',
    logoutNotificationCleanupWarning:
      'تم تسجيل الخروج، ولكن تعذر حذف سجل إشعارات هذا الجهاز بالكامل من الخادم.',
    barcodeRequired: 'يجب إدخال الباركود أولاً.',
    dateRangeRequired: 'تاريخ البداية وتاريخ النهاية مطلوبان.',
    dateRangeInvalid: 'تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية.',
    selectDateRange: 'اختر نطاق التاريخ لتتبع الشحنات.',
    customer: 'العميل',
    selectCustomer: 'اختر العميل',
    customerRequired: 'يجب اختيار العميل لتقرير الشحن.',
    selectedCustomer: 'العميل المحدد',
    openReport: 'فتح التقرير',
    languageSelection: 'اختيار اللغة',
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
    selectDate: 'اختر التاريخ',
    previousMonth: 'الشهر السابق',
    nextMonth: 'الشهر التالي',
    today: 'اليوم',
    reportCouldNotLoad: 'تعذر تحميل التقرير.',
    versionText: 'نظام تقارير الباركود',
    notificationUnsupported: 'هذا الجهاز أو المتصفح لا يدعم الإشعارات.',
    notificationDenied: 'لم يتم السماح بالإشعارات.',
    notificationKeyMissing: 'مفتاح الإشعارات غير موجود. تحقق من إعدادات Vercel.',
    notificationSaved: 'تم تفعيل الإشعارات. يمكن لهذا الجهاز استقبال الإشعارات.',
    notificationError: 'حدث خطأ أثناء تفعيل الإشعارات: ',
    notificationSettingsTitle: 'الإشعارات متوقفة',
    notificationSettingsBody:
      'إذن الإشعارات متوقف على هذا الجهاز. يمكنك تفعيله من إعدادات Android.',
    notificationSettingsButton: 'فتح إعدادات الإشعارات',
    devicePending: 'هذا الجهاز بانتظار موافقة المسؤول.',
    deviceRevoked: 'تم إلغاء صلاحية هذا الجهاز.',
    deviceAccessFailed: 'تعذر التحقق من الجهاز: ',
    appUpdateTitle: 'يتوفر إصدار جديد',
    appUpdateBody:
      'يتوفر تحديث جديد لتطبيق ELVAN. يمكنك التحديث الآن أو المتابعة لاحقًا.',
    appUpdateNow: 'تحديث',
    appUpdateLater: 'لاحقًا',
    appUpdateOpening: 'جارٍ تجهيز التحديث...',
    appUpdateDownloading: 'جارٍ تنزيل التحديث',
    appUpdateDownloaded: 'تم تنزيل التحديث',
    appUpdateDownloadedBody:
      'اكتمل التنزيل. ستتم إعادة تشغيل التطبيق لتثبيت التحديث.',
    appUpdateRestart: 'تثبيت وإعادة تشغيل',
    appUpdateStore: 'فتح متجر التطبيقات',
    appUpdateFailed:
      'تعذر بدء التحديث. يمكنك التحديث من متجر التطبيقات.',
    appUpdateCanceled:
      'تم إلغاء التحديث. يمكنك المحاولة لاحقًا.',
    appUpdateVersion: 'الإصدار',
    appUpdateRequiredTitle: 'التحديث مطلوب',
    appUpdateRequiredBody:
      'ثبّت أحدث إصدار للمتابعة في استخدام التطبيق.',
    appUpdateCheckingTitle: 'جارٍ التحقق من الإصدار',
    appUpdateCheckingBody: 'جارٍ التحقق من Google Play وسياسة التحديث.',
    appUpdateCheckFailed:
      'تعذر إكمال التحقق من إصدار Google Play. تحقق من اتصال الإنترنت ثم أعد المحاولة.',
    appUpdateRetry: 'أعد المحاولة',
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

const isNativeAndroidApp = () => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

const isNativeIosApp = () => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

const isNativeMobileApp = () => {
  return isNativeAndroidApp() || isNativeIosApp()
}

const getNativePushPlatform = () => {
  return isNativeIosApp() ? IOS_PUSH_PLATFORM : 'android'
}

const getAppUpdatePolicyCacheKey = (platform) => {
  return `${APP_UPDATE_POLICY_CACHE_KEY_PREFIX}_${platform}`
}

const readCachedAppUpdatePolicy = (platform = 'android') => {
  try {
    const cachedPolicy = JSON.parse(
      localStorage.getItem(getAppUpdatePolicyCacheKey(platform)) || '{}',
    )

    if (!isValidAppUpdatePolicy(cachedPolicy)) {
      return {
        policy: normalizeAppUpdatePolicy(),
        status: REMOTE_POLICY_STATUS.UNKNOWN,
      }
    }

    return {
      policy: normalizeAppUpdatePolicy(cachedPolicy),
      status: REMOTE_POLICY_STATUS.CACHE,
    }
  } catch {
    return {
      policy: normalizeAppUpdatePolicy(),
      status: REMOTE_POLICY_STATUS.UNKNOWN,
    }
  }
}

const fetchAppUpdatePolicy = async (platform = 'android') => {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 6000)

  try {
    const policyUrl =
      platform === 'ios'
        ? `${API_BASE_URL}/api/app-version?platform=ios`
        : `${API_BASE_URL}/api/app-version`
    const response = await fetch(policyUrl, {
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Sürüm politikası HTTP ${response.status}`)
    }

    const policyPayload = await response.json()

    if (!isValidAppUpdatePolicy(policyPayload)) {
      throw new Error('Sürüm politikası geçersiz.')
    }

    const policy = normalizeAppUpdatePolicy(policyPayload)

    try {
      localStorage.setItem(
        getAppUpdatePolicyCacheKey(platform),
        JSON.stringify(policy),
      )
    } catch (storageError) {
      console.log('Sürüm politikası önbelleğe alınamadı:', storageError)
    }

    return {
      policy,
      status: REMOTE_POLICY_STATUS.VERIFIED,
    }
  } catch (error) {
    console.log('Sürüm politikası alınamadı:', error)
    return readCachedAppUpdatePolicy(platform)
  } finally {
    window.clearTimeout(timeoutId)
  }
}

const getPlayUpdateStatus = (info) => {
  if (
    info?.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE ||
    info?.updateAvailability === AppUpdateAvailability.UPDATE_IN_PROGRESS ||
    info?.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED
  ) {
    return PLAY_UPDATE_STATUS.AVAILABLE
  }

  if (
    info?.updateAvailability === AppUpdateAvailability.UPDATE_NOT_AVAILABLE
  ) {
    return PLAY_UPDATE_STATUS.UNAVAILABLE
  }

  return PLAY_UPDATE_STATUS.UNKNOWN
}

const withTimeout = (promise, timeoutMs, message) => {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    window.clearTimeout(timeoutId)
  })
}

const waitForNativePushToken = async () => {
  let resolveToken
  let rejectToken
  let timeoutId

  const tokenPromise = new Promise((resolve, reject) => {
    resolveToken = resolve
    rejectToken = reject
  })

  const handles = await Promise.all([
    PushNotifications.addListener('registration', ({ value }) => {
      if (value) {
        resolveToken(value)
      } else {
        rejectToken(new Error('Bildirim anahtarı boş geldi.'))
      }
    }),
    PushNotifications.addListener('registrationError', ({ error }) => {
      rejectToken(new Error(error || 'Bildirim kaydı başarısız oldu.'))
    }),
  ])

  try {
    if (isNativeAndroidApp()) {
      try {
        await PushNotifications.createChannel({
          id: NATIVE_NOTIFICATION_CHANNEL_ID,
          name: 'ELVAN Bildirimleri',
          description: 'Rapor ve uygulama bildirimleri',
          importance: 4,
          visibility: 1,
          vibration: true,
        })
      } catch (channelError) {
        console.log('Android bildirim kanalı oluşturulamadı:', channelError)
      }
    }

    timeoutId = window.setTimeout(() => {
      rejectToken(new Error('Bildirim kaydı zaman aşımına uğradı.'))
    }, 15000)

    await PushNotifications.register()
    return await tokenPromise
  } finally {
    window.clearTimeout(timeoutId)
    await Promise.all(handles.map((handle) => handle.remove()))
  }
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

function normalizeProfile(profile) {
  if (!profile) {
    return profile
  }

  return {
    ...profile,
    can_view_yarn_stock_report:
      profile.can_view_yarn_stock_report === true,
  }
}

function isMissingYarnStockPermissionColumn(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`

  return message.includes('can_view_yarn_stock_report')
}

async function fetchProfileById(userId) {
  let { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT_FIELDS)
    .eq('id', userId)
    .single()

  if (error && isMissingYarnStockPermissionColumn(error)) {
    const fallbackResult = await supabase
      .from('profiles')
      .select(PROFILE_SELECT_FALLBACK_FIELDS)
      .eq('id', userId)
      .single()

    data = fallbackResult.data
    error = fallbackResult.error
  }

  return {
    data: normalizeProfile(data),
    error,
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

function AppUpdateNotice({
  notice,
  texts,
  onComplete,
  onDismiss,
  onOpenStore,
  onStart,
}) {
  if (!notice.visible) {
    return null
  }

  const isBusy = notice.status === 'starting' || notice.status === 'downloading'
  const isDownloaded = notice.status === 'downloaded'
  const isFailed =
    notice.status === 'failed' ||
    notice.status === 'canceled' ||
    notice.status === 'check-failed'
  const availableVersion =
    notice.info?.availableVersionName || notice.info?.availableVersionCode || ''
  const currentVersion =
    notice.info?.currentVersionName || notice.info?.currentVersionCode || ''
  const versionText =
    availableVersion && currentVersion
      ? `${texts.appUpdateVersion} ${currentVersion} → ${availableVersion}`
      : availableVersion
        ? `${texts.appUpdateVersion} ${availableVersion}`
        : ''

  let bodyText = notice.mandatory
    ? texts.appUpdateRequiredBody
    : texts.appUpdateBody

  if (notice.status === 'starting') {
    bodyText = texts.appUpdateOpening
  } else if (notice.status === 'downloading') {
    bodyText = `${texts.appUpdateDownloading}${
      notice.progress ? ` · ${notice.progress}%` : ''
    }`
  } else if (isDownloaded) {
    bodyText = texts.appUpdateDownloadedBody
  } else if (notice.status === 'failed') {
    bodyText = texts.appUpdateFailed
  } else if (notice.status === 'canceled') {
    bodyText = texts.appUpdateCanceled
  } else if (notice.status === 'check-failed') {
    bodyText = texts.appUpdateCheckFailed
  }

  const noticeContent = (
    <aside
      className={`appUpdateNotice${notice.mandatory ? ' isMandatory' : ''}`}
      role={notice.mandatory ? 'alertdialog' : 'status'}
      aria-live="assertive"
      aria-modal={notice.mandatory ? 'true' : undefined}
    >
      <div className="appUpdateNoticeIcon" aria-hidden="true">
        ↑
      </div>

      <div className="appUpdateNoticeBody">
        <strong>
          {isDownloaded
            ? texts.appUpdateDownloaded
            : notice.mandatory
              ? texts.appUpdateRequiredTitle
              : texts.appUpdateTitle}
        </strong>
        <span>{bodyText}</span>
        {versionText ? <small>{versionText}</small> : null}
      </div>

      <div className="appUpdateNoticeActions">
        {!notice.mandatory ? (
          <button
            type="button"
            className="appUpdateLaterButton"
            onClick={onDismiss}
            disabled={notice.status === 'starting'}
          >
            {texts.appUpdateLater}
          </button>
        ) : null}

        {isDownloaded ? (
          <button type="button" onClick={onComplete}>
            {texts.appUpdateRestart}
          </button>
        ) : isFailed ? (
          <>
            {notice.mandatory ? (
              <button type="button" onClick={onStart}>
                {texts.appUpdateRetry}
              </button>
            ) : null}
            <button type="button" onClick={onOpenStore}>
              {texts.appUpdateStore}
            </button>
          </>
        ) : (
          <button type="button" onClick={onStart} disabled={isBusy}>
            {isBusy ? texts.appUpdateOpening : texts.appUpdateNow}
          </button>
        )}
      </div>
    </aside>
  )

  return notice.mandatory ? (
    <div className="appUpdateBlocker">{noticeContent}</div>
  ) : (
    noticeContent
  )
}

function AppUpdateCheckGate({ texts }) {
  return (
    <div className="appUpdateBlocker">
      <aside className="appUpdateNotice isMandatory" role="status" aria-live="polite">
        <div className="appUpdateNoticeIcon appUpdateCheckSpinner" aria-hidden="true">
          ↑
        </div>
        <div className="appUpdateNoticeBody">
          <strong>{texts.appUpdateCheckingTitle}</strong>
          <span>{texts.appUpdateCheckingBody}</span>
        </div>
      </aside>
    </div>
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
    const solidRed = [237, 0, 0]
    const solidBlack = [0, 0, 0]
    let logoMask = null
    let startedAt = 0
    let disposed = false
    let started = false

    const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
    const getSplashDpr = () => Math.min(Math.max(window.devicePixelRatio || 1, 1), 3)
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
        x > width * 0.26 && x < width * 0.74 && y < height * 0.43

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
      const dpr = getSplashDpr()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
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
      const renderScale = getSplashDpr()
      const sampleWidth = Math.max(1, Math.round(targetWidth * renderScale))
      const sampleHeight = Math.max(1, Math.round(targetHeight * renderScale))
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
      sampleCtx.imageSmoothingEnabled = true
      sampleCtx.imageSmoothingQuality = 'high'
      maskCtx.imageSmoothingEnabled = true
      maskCtx.imageSmoothingQuality = 'high'
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
        cleanPixels[i + 3] =
          logoAlpha <= 0.015 ? 0 : Math.round(clamp(logoAlpha * 1.18) * 255)
      }

      maskCtx.putImageData(cleanImageData, 0, 0)

      const cssStep = rect.width < 620 ? 4 : 3
      const step = Math.max(1, Math.round(cssStep * renderScale))
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
              x: targetX + x / renderScale,
              y: targetY + y / renderScale,
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
  const scanFrameRef = useRef(null)
  const scannerPanelRef = useRef(null)
  const scannerTriggerRef = useRef(null)
  const scannerCloseButtonRef = useRef(null)
  const shipmentDateBoxRef = useRef(null)
  const shipmentCustomerSelectRef = useRef(null)
  const shipmentStartInputRef = useRef(null)
  const scannerControlsRef = useRef(null)
  const scannerCandidateRef = useRef(null)
  const scannerResultHandledRef = useRef(false)
  const scannerStartingRef = useRef(false)
  const scannerStartTokenRef = useRef(0)
  const scannerTorchTrackRef = useRef(null)
  const scannerTorchChangingRef = useRef(null)
  const appUpdateInitialCheckRef = useRef(false)
  const appUpdateCheckRunningRef = useRef(false)
  const appUpdateCheckQueuedRef = useRef(false)
  const appUpdateCheckQueuedGateRef = useRef(false)
  const appUpdateVerifiedRef = useRef(false)
  const nativePushRegistrationRef = useRef(null)
  const webPushRegistrationRef = useRef(null)
  const nativePushTokenRef = useRef('')
  const notificationSessionRef = useRef({ generation: 0, userId: '' })
  const logoutInProgressRef = useRef(false)
  const messageTimeoutRef = useRef(null)

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
  const [scannerTorchSupported, setScannerTorchSupported] = useState(false)
  const [scannerTorchOn, setScannerTorchOn] = useState(false)
  const [screen, setScreen] = useState(() => {
    return window.location.pathname === DESKTOP_ADMIN_PATH ? 'desktop-admin' : 'main'
  })
  const [pdfViewerData, setPdfViewerData] = useState(null)
  const [appUpdateNotice, setAppUpdateNotice] = useState({
    visible: false,
    info: null,
    status: 'idle',
    progress: 0,
    mandatory: false,
  })
  const [appUpdateCheckPending, setAppUpdateCheckPending] = useState(() =>
    isNativeMobileApp(),
  )
  const [logoutConfirmationOpen, setLogoutConfirmationOpen] = useState(false)
  const [logoutInProgress, setLogoutInProgress] = useState(false)
  const [nativeNotificationPermission, setNativeNotificationPermission] =
    useState('unknown')

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
    can_view_yarn_stock_report: false,
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
    window.clearTimeout(messageTimeoutRef.current)
    setMessageKind(kind)
    setMessage(value)
    messageTimeoutRef.current = window.setTimeout(() => {
      setMessage('')
    }, 3000)
  }

  const hideStartupSplash = useCallback(() => {
    setStartupSplashVisible(false)
  }, [])

  const clearUserMessage = () => {
    window.clearTimeout(messageTimeoutRef.current)
    setMessage('')
    setMessageKind('info')
  }

  const dismissAppUpdateNotice = () => {
    setAppUpdateNotice((current) => ({
      ...current,
      visible: false,
    }))
  }

  const openAppUpdateStore = async () => {
    try {
      if (isNativeIosApp()) {
        if (!IOS_APP_STORE_ID) {
          throw new Error('iOS App Store kimliği henüz yapılandırılmadı.')
        }

        await AppUpdate.openAppStore({ appId: IOS_APP_STORE_ID })
      } else {
        await AppUpdate.openAppStore({
          androidPackageName: APP_UPDATE_PACKAGE_NAME,
        })
      }
      setAppUpdateNotice((current) => ({
        ...current,
        visible: current.mandatory,
        status: 'idle',
      }))
    } catch (err) {
      console.log('Uygulama mağazası açma hatası:', err)
      setAppUpdateNotice((current) => ({
        ...current,
        visible: true,
        status: 'failed',
      }))
    }
  }

  const startOptionalAppUpdate = async () => {
    setAppUpdateNotice((current) => ({
      ...current,
      visible: true,
      status: 'starting',
      progress: 0,
    }))

    try {
      if (isNativeIosApp()) {
        await openAppUpdateStore()
        return
      }

      const info = await AppUpdate.getAppUpdateInfo()

      setAppUpdateNotice((current) => ({
        ...current,
        info,
      }))

      if (info.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
        setAppUpdateNotice((current) => ({
          ...current,
          visible: true,
          info,
          status: 'downloaded',
          progress: 100,
        }))
        return
      }

      if (info.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) {
        await openAppUpdateStore()
        return
      }

      if (!info.flexibleUpdateAllowed) {
        await openAppUpdateStore()
        return
      }

      const result = await AppUpdate.startFlexibleUpdate()

      if (result.code === AppUpdateResultCode.OK) {
        setAppUpdateNotice((current) => ({
          ...current,
          visible: true,
          info,
          status: 'downloading',
          progress: 0,
        }))
        return
      }

      setAppUpdateNotice((current) => ({
        ...current,
        visible: true,
        info,
        status:
          result.code === AppUpdateResultCode.CANCELED
            ? 'canceled'
            : 'failed',
        progress: 0,
      }))
    } catch (err) {
      console.log('Güncelleme başlatma hatası:', err)
      setAppUpdateNotice((current) => ({
        ...current,
        visible: true,
        status: 'failed',
        progress: 0,
      }))
    }
  }

  const startMandatoryAppUpdate = async () => {
    setAppUpdateNotice((current) => ({
      ...current,
      visible: true,
      status: 'starting',
    }))

    try {
      if (isNativeIosApp()) {
        await openAppUpdateStore()
        return
      }

      const info = await AppUpdate.getAppUpdateInfo()

      setAppUpdateNotice((current) => ({ ...current, info }))

      if (info.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
        await AppUpdate.completeFlexibleUpdate()
        return
      }

      const canResumeImmediateUpdate =
        info.updateAvailability === AppUpdateAvailability.UPDATE_IN_PROGRESS ||
        (info.updateAvailability === AppUpdateAvailability.UPDATE_AVAILABLE &&
          info.immediateUpdateAllowed)

      if (!canResumeImmediateUpdate) {
        await openAppUpdateStore()
        return
      }

      const result = await AndroidUpdateRecovery.resumeImmediateUpdate()

      if (
        result.code === AppUpdateResultCode.NOT_AVAILABLE ||
        result.code === AppUpdateResultCode.NOT_ALLOWED
      ) {
        await openAppUpdateStore()
        return
      }

      if (result.code !== AppUpdateResultCode.OK) {
        setAppUpdateNotice((current) => ({
          ...current,
          visible: true,
          status:
            result.code === AppUpdateResultCode.CANCELED
              ? 'canceled'
              : 'failed',
        }))
      }
    } catch (err) {
      console.log('Zorunlu güncelleme başlatma hatası:', err)
      setAppUpdateNotice((current) => ({
        ...current,
        visible: true,
        status: 'failed',
      }))
    }
  }

  const completeOptionalAppUpdate = async () => {
    setAppUpdateNotice((current) => ({
      ...current,
      visible: true,
      status: 'starting',
    }))

    try {
      await AppUpdate.completeFlexibleUpdate()
    } catch (err) {
      console.log('Güncelleme tamamlama hatası:', err)
      setAppUpdateNotice((current) => ({
        ...current,
        visible: true,
        status: 'failed',
      }))
    }
  }

  const renderAppUpdateNotice = () => (
    <AppUpdateNotice
      notice={appUpdateNotice}
      texts={t}
      onComplete={completeOptionalAppUpdate}
      onDismiss={dismissAppUpdateNotice}
      onOpenStore={openAppUpdateStore}
      onStart={
        appUpdateNotice.status === 'check-failed'
          ? () => checkNativeAppUpdate({ showGate: true })
          : appUpdateNotice.mandatory
          ? startMandatoryAppUpdate
          : startOptionalAppUpdate
      }
    />
  )

  const closeLogoutConfirmation = useCallback(() => {
    setLogoutConfirmationOpen(false)
  }, [])

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

  const beginNotificationSession = (userId) => {
    const normalizedUserId = String(userId || '').trim()
    const currentSession = notificationSessionRef.current

    if (currentSession.userId === normalizedUserId && normalizedUserId) {
      return currentSession
    }

    const nextSession = advanceSessionLifecycle(
      currentSession,
      normalizedUserId,
    )
    notificationSessionRef.current = nextSession
    return nextSession
  }

  const invalidateNotificationSession = (expectedUserId = '') => {
    const normalizedExpectedUserId = String(expectedUserId || '').trim()
    const currentSession = notificationSessionRef.current

    if (
      normalizedExpectedUserId &&
      currentSession.userId &&
      currentSession.userId !== normalizedExpectedUserId
    ) {
      return false
    }

    notificationSessionRef.current = advanceSessionLifecycle(
      currentSession,
      '',
    )
    return true
  }

  const getNotificationSession = (userId) => {
    const candidate = notificationSessionRef.current
    return candidate.userId === String(userId || '').trim()
      ? candidate
      : null
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
    scannerCandidateRef.current = null

    const torchTrack = scannerTorchTrackRef.current
    scannerTorchTrackRef.current = null
    scannerTorchChangingRef.current = null
    setScannerTorchSupported(false)
    setScannerTorchOn(false)

    if (torchTrack && torchTrack.readyState !== 'ended') {
      try {
        applyCameraTorch(torchTrack, false).catch(() => {})
        torchTrack.stop()
      } catch (err) {
        console.log('Camera torch release skipped:', err)
      }
    }

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
    invalidateNotificationSession()
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
    const {
      forceRenew = false,
      showMessage = false,
      notificationSession = getNotificationSession(userId),
    } = options

    if (
      !notificationSession ||
      !isSessionLifecycleCurrent(
        notificationSessionRef.current,
        notificationSession,
      )
    ) {
      return false
    }

    const currentRegistration = webPushRegistrationRef.current

    if (
      currentRegistration?.userId === userId &&
      currentRegistration?.generation === notificationSession.generation
    ) {
      return currentRegistration.promise
    }

    const isCurrent = () =>
      isSessionLifecycleCurrent(
        notificationSessionRef.current,
        notificationSession,
      )
    const registrationTask = (async () => {

      try {
      if (!canUseNotifications()) {
        if (showMessage && isCurrent()) {
          showUserMessage(t.notificationUnsupported, 'warning')
        }
        return false
      }

      if (Notification.permission !== 'granted' || !isCurrent()) {
        return false
      }

      const publicKey = getVapidPublicKey()

      if (!publicKey) {
        if (showMessage && isCurrent()) {
          showUserMessage(t.notificationKeyMissing, 'warning')
        }
        return false
      }

      const applicationServerKey = urlBase64ToUint8Array(publicKey)

      if (applicationServerKey.length !== 65) {
        throw new Error(`Public Key uzunluğu geçersiz. Beklenen 65 byte, gelen ${applicationServerKey.length} byte.`)
      }

      await navigator.serviceWorker.register('/sw.js')
      const readyRegistration = await withTimeout(
        navigator.serviceWorker.ready,
        NOTIFICATION_OPERATION_TIMEOUT_MS,
        'Bildirim servisi zaman aşımına uğradı.',
      )

      if (!isCurrent()) {
        return false
      }

      let subscription = await readyRegistration.pushManager.getSubscription()

      if (!isCurrent()) {
        return false
      }

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
            .eq('user_id', userId)
            .eq('endpoint', oldEndpoint)
        }

        subscription = null
      }

      if (!isCurrent()) {
        return false
      }

      if (!subscription) {
        subscription = await readyRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        })
      }

      if (!isCurrent()) {
        return false
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

      if (!isCurrent()) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', subscription.endpoint)
        return false
      }

      if (showMessage) {
        showUserMessage(t.notificationSaved, 'success')
      }

      return true
    } catch (err) {
      if (showMessage && isCurrent()) {
        showUserMessage(t.notificationError + err.message, 'error')
      } else if (isCurrent()) {
        console.log('Bildirim kaydı hatası:', err)
      }

        return false
      }
    })()
    const registrationRecord = {
      generation: notificationSession.generation,
      promise: registrationTask,
      userId,
    }
    webPushRegistrationRef.current = registrationRecord

    try {
      return await registrationTask
    } finally {
      if (webPushRegistrationRef.current === registrationRecord) {
        webPushRegistrationRef.current = null
      }
    }
  }

  const registerNativePushSubscription = async (userId, options = {}) => {
    const {
      requestPermission = false,
      notificationSession = getNotificationSession(userId),
    } = options

    if (
      !notificationSession ||
      !isSessionLifecycleCurrent(
        notificationSessionRef.current,
        notificationSession,
      )
    ) {
      return false
    }

    const currentRegistration = nativePushRegistrationRef.current

    if (
      currentRegistration?.userId === userId &&
      currentRegistration?.generation === notificationSession.generation
    ) {
      return currentRegistration.promise
    }

    const isCurrent = () =>
      isSessionLifecycleCurrent(
        notificationSessionRef.current,
        notificationSession,
      )
    const registrationTask = (async () => {
      try {
        const nativePushPlatform = getNativePushPlatform()
        let permission = await PushNotifications.checkPermissions()

        if (!isCurrent()) {
          return false
        }

        setNativeNotificationPermission(permission.receive || 'unknown')
        const alreadyAsked =
          localStorage.getItem(NATIVE_NOTIFICATION_PERMISSION_ASKED_KEY) ===
          'true'

        if (
          requestPermission &&
          shouldRequestNativeNotificationPermission({
            permission: permission.receive,
            alreadyAsked,
          })
        ) {
          permission = await PushNotifications.requestPermissions()
          setNativeNotificationPermission(permission.receive || 'unknown')

          try {
            localStorage.setItem(
              NATIVE_NOTIFICATION_PERMISSION_ASKED_KEY,
              'true',
            )
          } catch (storageError) {
            console.log(
              'Bildirim izin tercihi kaydedilemedi:',
              storageError,
            )
          }
        }

        if (!isCurrent()) {
          return false
        }

        if (permission.receive !== 'granted') {
          return false
        }

        const token = await waitForNativePushToken()

        if (!isCurrent()) {
          return false
        }

        nativePushTokenRef.current = token
        const { data: sessionData } = await supabase.auth.getSession()
        const authSession = sessionData?.session
        const nativeAppInfo = await CapacitorApp.getInfo().catch(() => null)

        if (!isCurrent() || !isAuthSessionUser(authSession, userId)) {
          return false
        }

        const response = await fetchWithTimeout(
          `${API_BASE_URL}/api/push-registration`,
          {
            method: 'POST',
            headers: makeAuthorizedHeaders(authSession.access_token, {
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
              token,
              platform: nativePushPlatform,
              deviceName: getDeviceName(),
              appVersion: nativeAppInfo
                ? `${nativeAppInfo.version || ''} (${nativeAppInfo.build || ''})`
                : APP_LOG_VERSION,
            }),
          },
          NOTIFICATION_OPERATION_TIMEOUT_MS,
        )
        const result = await response.json().catch(() => ({}))

        if (!isCurrent()) {
          if (response.ok) {
            fetchWithTimeout(
              `${API_BASE_URL}/api/push-registration`,
              {
                method: 'POST',
                headers: makeAuthorizedHeaders(authSession.access_token, {
                  'Content-Type': 'application/json',
                }),
                body: JSON.stringify({
                  action: 'unregister',
                  platform: nativePushPlatform,
                  token,
                }),
              },
              NOTIFICATION_OPERATION_TIMEOUT_MS,
            ).catch(() => {})
          }
          return false
        }

        if (!response.ok) {
          throw new Error(result.error || 'Bildirim kaydı yapılamadı.')
        }

        return true
      } catch (err) {
        console.log('Bildirim kaydı hatası:', err)
        return false
      }
    })()

    const registrationRecord = {
      generation: notificationSession.generation,
      promise: registrationTask,
      userId,
    }
    nativePushRegistrationRef.current = registrationRecord

    try {
      return await registrationTask
    } finally {
      if (nativePushRegistrationRef.current === registrationRecord) {
        nativePushRegistrationRef.current = null
      }
    }
  }

  const openNativeNotificationSettings = async () => {
    try {
      await AndroidUpdateRecovery.openNotificationSettings()
    } catch (err) {
      showUserMessage(t.notificationError + err.message, 'error')
    }
  }

  const requestNotificationPermissionOnce = async () => {
    try {
      if (isNativeMobileApp()) {
        return 'native'
      }

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

      const permission = await Notification.requestPermission()
      localStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, 'true')

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
    const response = await fetchWithTimeout(
      `${API_BASE_URL}/api/device-access`,
      {
        method: register ? 'POST' : 'GET',
        headers: makeAuthorizedHeaders(accessToken, {
          'Content-Type': 'application/json',
        }),
        body: register
          ? JSON.stringify({
              deviceName: getDeviceName(),
            })
          : undefined,
      },
      NOTIFICATION_OPERATION_TIMEOUT_MS,
    )

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
        can_view_yarn_stock_report: false,
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

      if (Array.from(cleanTitle).length > 120) {
        setAdminNotificationMessage('Bildirim başlığı en fazla 120 karakter olabilir.')
        setAdminNotificationSending(false)
        return
      }

      if (Array.from(cleanBody).length > 800) {
        setAdminNotificationMessage('Bildirim mesajı en fazla 800 karakter olabilir.')
        setAdminNotificationSending(false)
        return
      }

      const accessToken = await getAccessToken()

      if (!accessToken) {
        setAdminNotificationMessage(t.sessionMissing)
        setAdminNotificationSending(false)
        return
      }

      const response = await fetchWithTimeout(
        `${API_BASE_URL}/api/send-notification`,
        {
          method: 'POST',
          headers: makeAuthorizedHeaders(accessToken, {
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            title: cleanTitle,
            body: cleanBody,
            url: '/',
          }),
        },
        NOTIFICATION_SEND_TIMEOUT_MS,
      )

      const result = await response.json().catch(() => ({}))

      if (response.ok && Number(result.total || 0) === 0) {
        setAdminNotificationMessage(
          result.message || 'Bildirimin gönderilebileceği uygun cihaz yok.',
        )
        setAdminNotificationSending(false)
        return
      }

      const deliverySummary = [
        `Başarılı: ${result.sent || 0}`,
        `Web: ${result.webSent || 0}`,
        `Android: ${result.nativeSent || 0}`,
        `Başarısız: ${result.failed || 0}`,
        `Hedef: ${result.total || 0}`,
      ].join(', ')

      if (!response.ok) {
        throw new Error(
          `${result.error || 'Bildirim gönderilemedi.'} (${deliverySummary})`,
        )
      }

      const skippedCount = Object.values(result.skipped || {}).reduce(
        (total, value) => total + (Number(value) || 0),
        0,
      )
      setAdminNotificationMessage(
        `${result.failed > 0 ? 'Bildirim kısmen gönderildi.' : 'Bildirim gönderildi.'} ${deliverySummary}${
          skippedCount > 0 ? `, Atlanan: ${skippedCount}` : ''
        }`,
      )
      setAdminNotificationBody('')
    } catch (err) {
      setAdminNotificationMessage('Bildirim gönderilemedi: ' + err.message)
    }

    setAdminNotificationSending(false)
  }

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    return () => {
      window.clearTimeout(messageTimeoutRef.current)
      stopScanner()
    }
  }, [])

  useEffect(() => {
    if (!scannerOpen) {
      return undefined
    }

    const previouslyFocused = document.activeElement
    const scannerTrigger = scannerTriggerRef.current
    const previousBodyOverflow = document.body.style.overflow
    const focusTimer = window.setTimeout(() => {
      scannerCloseButtonRef.current?.focus()
    }, 0)
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        stopScanner()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const focusableButtons = Array.from(
        scannerPanelRef.current?.querySelectorAll('button:not(:disabled)') || []
      ).filter((button) => button.offsetParent !== null)

      if (focusableButtons.length === 0) {
        return
      }

      const firstButton = focusableButtons[0]
      const lastButton = focusableButtons[focusableButtons.length - 1]

      if (
        event.shiftKey &&
        (document.activeElement === firstButton ||
          !scannerPanelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        lastButton.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === lastButton ||
          !scannerPanelRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        firstButton.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)

    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousBodyOverflow
      document.removeEventListener('keydown', closeOnEscape)

      const focusTarget =
        previouslyFocused === document.body
          ? scannerTrigger
          : previouslyFocused

      if (typeof focusTarget?.focus === 'function') {
        focusTarget.focus()
      }
    }
  }, [scannerOpen])

  useEffect(() => {
    if (!scannerOpen || !isNativeAndroidApp()) {
      return undefined
    }

    let listenerHandle = null
    let active = true
    const stopScannerWhenHidden = () => {
      if (active && document.visibilityState === 'hidden') {
        stopScanner()
      }
    }

    document.addEventListener('visibilitychange', stopScannerWhenHidden)
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (active && !isActive) {
        stopScanner()
      }
    }).then((handle) => {
      if (active) {
        listenerHandle = handle
      } else {
        handle.remove()
      }
    })

    return () => {
      active = false
      document.removeEventListener('visibilitychange', stopScannerWhenHidden)
      listenerHandle?.remove()
    }
  }, [scannerOpen])

  useEffect(() => {
    if (
      scannerOpen &&
      (appUpdateCheckPending || appUpdateNotice.mandatory)
    ) {
      stopScanner()
    }
  }, [
    appUpdateCheckPending,
    appUpdateNotice.mandatory,
    scannerOpen,
  ])

  useEffect(() => {
    if (!isNativeAndroidApp()) {
      return undefined
    }

    let active = true
    let listenerHandle = null

    CapacitorApp.addListener('backButton', () => {
      if (!active) {
        return
      }

      const action = resolveAndroidBackAction({
        updateBlocked:
          appUpdateCheckPending || appUpdateNotice.mandatory,
        pdfOpen: Boolean(pdfViewerData),
        dialogOpen: Boolean(
          document.querySelector(
            '[aria-modal="true"]:is([role="dialog"], [role="alertdialog"])',
          ),
        ),
        screen,
        signedIn: Boolean(userProfile?.id),
      })

      if (action === ANDROID_BACK_ACTION.CLOSE_PDF) {
        setPdfViewerData(null)
      } else if (action === ANDROID_BACK_ACTION.CLOSE_DIALOG) {
        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        )
      } else if (action === ANDROID_BACK_ACTION.SHOW_MAIN) {
        stopScanner()
        setScreen('main')
      } else if (action === ANDROID_BACK_ACTION.MINIMIZE) {
        CapacitorApp.minimizeApp().catch((err) => {
          console.log('Uygulama küçültülemedi:', err)
        })
      }

    }).then((handle) => {
      if (active) {
        listenerHandle = handle
      } else {
        handle.remove()
      }
    })

    return () => {
      active = false
      listenerHandle?.remove()
    }
  }, [
    appUpdateCheckPending,
    appUpdateNotice.mandatory,
    pdfViewerData,
    screen,
    userProfile?.id,
  ])

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return undefined
    }

    let active = true
    let listenerHandle = null

    AppUpdate.addListener('onFlexibleUpdateStateChange', (state) => {
      if (!active) {
        return
      }

      const totalBytes = state.totalBytesToDownload || 0
      const downloadedBytes = state.bytesDownloaded || 0
      const progress =
        totalBytes > 0
          ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100))
          : 0

      if (state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADING) {
        setAppUpdateNotice((current) => ({
          ...current,
          visible: true,
          status: 'downloading',
          progress,
          mandatory: ALL_ANDROID_UPDATES_MANDATORY,
        }))
        return
      }

      if (
        state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED ||
        state.installStatus === FlexibleUpdateInstallStatus.INSTALLED
      ) {
        setAppUpdateNotice((current) => ({
          ...current,
          visible: true,
          status: 'downloaded',
          progress: 100,
          mandatory: ALL_ANDROID_UPDATES_MANDATORY,
        }))
        return
      }

      if (state.installStatus === FlexibleUpdateInstallStatus.FAILED) {
        setAppUpdateNotice((current) => ({
          ...current,
          visible: true,
          status: 'failed',
          mandatory: ALL_ANDROID_UPDATES_MANDATORY,
        }))
        return
      }

      if (state.installStatus === FlexibleUpdateInstallStatus.CANCELED) {
        setAppUpdateNotice((current) => ({
          ...current,
          visible: true,
          status: 'canceled',
          mandatory: ALL_ANDROID_UPDATES_MANDATORY,
        }))
      }
    })
      .then((handle) => {
        if (active) {
          listenerHandle = handle
        } else {
          handle.remove()
        }
      })
      .catch((err) => {
        console.log('Güncelleme dinleyici hatası:', err)
      })

    return () => {
      active = false
      listenerHandle?.remove()
    }
  }, [])

  const checkAndroidAppUpdate = useCallback(async (options = {}) => {
    const { showGate = false } = options

    if (!isNativeAndroidApp()) {
      return
    }

    if (appUpdateCheckRunningRef.current) {
      appUpdateCheckQueuedRef.current = true
      appUpdateCheckQueuedGateRef.current =
        appUpdateCheckQueuedGateRef.current || showGate
      return
    }

    let gateRequested = showGate

    do {
      appUpdateCheckRunningRef.current = true
      appUpdateCheckQueuedRef.current = false
      appUpdateCheckQueuedGateRef.current = false

      const gateShownForCheck =
        gateRequested && !appUpdateVerifiedRef.current

      if (gateShownForCheck) {
        setAppUpdateCheckPending(true)
      }

      try {
        const [appInfoResult, playInfoResult, policyResult, buildInfoResult] =
          await Promise.allSettled([
            withTimeout(
              CapacitorApp.getInfo(),
              8000,
              'Uygulama sürümü okunamadı.',
            ),
            withTimeout(
              AppUpdate.getAppUpdateInfo(),
              10000,
              'Google Play güncelleme kontrolü zaman aşımına uğradı.',
            ),
            fetchAppUpdatePolicy('android'),
            withTimeout(
              AndroidUpdateRecovery.getBuildInfo(),
              4000,
              'Android derleme türü okunamadı.',
            ),
          ])

        const appInfo =
          appInfoResult.status === 'fulfilled' ? appInfoResult.value : null
        const playInfo =
          playInfoResult.status === 'fulfilled' ? playInfoResult.value : null
        const policyCheck =
          policyResult.status === 'fulfilled'
            ? policyResult.value
            : readCachedAppUpdatePolicy('android')
        const updatePolicy = policyCheck.policy
        const currentVersionCode =
          appInfo?.build || playInfo?.currentVersionCode
        const displayedVersionCode = Number(currentVersionCode)
        const info = playInfo || {
          currentVersionCode: Number.isSafeInteger(displayedVersionCode)
            ? displayedVersionCode
            : null,
          currentVersionName: appInfo?.version || '',
        }
        const isDebugBuild =
          buildInfoResult.status === 'fulfilled' &&
          buildInfoResult.value?.debug === true
        const playStatus = getPlayUpdateStatus(playInfo)
        const decision = decideAndroidUpdateState({
          policy: updatePolicy,
          currentVersionCode,
          playStatus,
          remotePolicyStatus: policyCheck.status,
          previousCheckSucceeded: appUpdateVerifiedRef.current,
          allPlayUpdatesMandatory: ALL_ANDROID_UPDATES_MANDATORY,
          debugPlayCheckBypassed:
            isDebugBuild && playStatus === PLAY_UPDATE_STATUS.UNKNOWN,
        })

        if (decision.action === 'allow' || decision.action === 'require') {
          appUpdateVerifiedRef.current = true
        }

        if (decision.action === 'require') {
          setAppUpdateNotice({
            visible: true,
            info,
            status:
              playInfo?.installStatus ===
              FlexibleUpdateInstallStatus.DOWNLOADED
                ? 'downloaded'
                : 'available',
            progress:
              playInfo?.installStatus ===
              FlexibleUpdateInstallStatus.DOWNLOADED
                ? 100
                : 0,
            mandatory: true,
          })

          if (
            playInfo?.updateAvailability ===
            AppUpdateAvailability.UPDATE_IN_PROGRESS
          ) {
            setAppUpdateNotice((current) => ({
              ...current,
              status: 'starting',
            }))

            let resumeResult

            try {
              resumeResult =
                await AndroidUpdateRecovery.resumeImmediateUpdate()
            } catch (resumeError) {
              console.log('Yarım kalan güncelleme sürdürülemedi:', resumeError)
            }

            if (resumeResult?.code !== AppUpdateResultCode.OK) {
              setAppUpdateNotice((current) => ({
                ...current,
                visible: true,
                status:
                  resumeResult?.code === AppUpdateResultCode.CANCELED
                    ? 'canceled'
                    : 'failed',
                mandatory: true,
              }))
            }
          }
        } else if (decision.action === 'allow') {
          setAppUpdateNotice({
            visible: false,
            info,
            status: 'idle',
            progress: 0,
            mandatory: false,
          })
        } else if (decision.action === 'retry') {
          setAppUpdateNotice({
            visible: true,
            info,
            status: 'check-failed',
            progress: 0,
            mandatory: true,
          })
        }
      } catch (err) {
        console.log('Güncelleme kontrol hatası:', err)

        if (!appUpdateVerifiedRef.current) {
          setAppUpdateNotice((current) => ({
            ...current,
            visible: true,
            status: 'check-failed',
            mandatory: true,
          }))
        }
      } finally {
        appUpdateCheckRunningRef.current = false

        if (gateShownForCheck) {
          setAppUpdateCheckPending(false)
        }
      }

      gateRequested = appUpdateCheckQueuedGateRef.current
    } while (appUpdateCheckQueuedRef.current)
  }, [])

  const checkIosAppUpdate = useCallback(async (options = {}) => {
    const { showGate = false } = options

    if (!isNativeIosApp()) {
      return
    }

    if (appUpdateCheckRunningRef.current) {
      appUpdateCheckQueuedRef.current = true
      appUpdateCheckQueuedGateRef.current =
        appUpdateCheckQueuedGateRef.current || showGate
      return
    }

    let gateRequested = showGate

    do {
      appUpdateCheckRunningRef.current = true
      appUpdateCheckQueuedRef.current = false
      appUpdateCheckQueuedGateRef.current = false

      const gateShownForCheck =
        gateRequested && !appUpdateVerifiedRef.current

      if (gateShownForCheck) {
        setAppUpdateCheckPending(true)
      }

      try {
        const [appInfoResult, storeInfoResult, policyResult] =
          await Promise.allSettled([
            withTimeout(
              CapacitorApp.getInfo(),
              8000,
              'Uygulama sürümü okunamadı.',
            ),
            withTimeout(
              AppUpdate.getAppUpdateInfo(),
              10000,
              'App Store güncelleme kontrolü zaman aşımına uğradı.',
            ),
            fetchAppUpdatePolicy('ios'),
          ])

        const appInfo =
          appInfoResult.status === 'fulfilled' ? appInfoResult.value : null
        const storeInfo =
          storeInfoResult.status === 'fulfilled' ? storeInfoResult.value : null
        const policyCheck =
          policyResult.status === 'fulfilled'
            ? policyResult.value
            : readCachedAppUpdatePolicy('ios')
        const currentBuildNumber =
          appInfo?.build || storeInfo?.currentVersionCode
        const info = storeInfo || {
          currentVersionCode: currentBuildNumber || null,
          currentVersionName: appInfo?.version || '',
        }
        const decision = decideNativeUpdateState({
          policy: policyCheck.policy,
          currentVersionCode: currentBuildNumber,
          storeStatus: getPlayUpdateStatus(storeInfo),
          remotePolicyStatus: policyCheck.status,
          previousCheckSucceeded: appUpdateVerifiedRef.current,
          allStoreUpdatesMandatory: ALL_IOS_UPDATES_MANDATORY,
          // The first App Store release has no public lookup result yet.
          // The verified remote minimum remains fail-closed and authoritative.
          allowUnknownStoreStatus: true,
        })

        if (decision.action === 'allow' || decision.action === 'require') {
          appUpdateVerifiedRef.current = true
        }

        if (decision.action === 'require') {
          setAppUpdateNotice({
            visible: true,
            info,
            status: 'available',
            progress: 0,
            mandatory: true,
          })
        } else if (decision.action === 'allow') {
          setAppUpdateNotice({
            visible: false,
            info,
            status: 'idle',
            progress: 0,
            mandatory: false,
          })
        } else if (decision.action === 'retry') {
          setAppUpdateNotice({
            visible: true,
            info,
            status: 'check-failed',
            progress: 0,
            mandatory: true,
          })
        }
      } catch (err) {
        console.log('iOS güncelleme kontrol hatası:', err)

        if (!appUpdateVerifiedRef.current) {
          setAppUpdateNotice((current) => ({
            ...current,
            visible: true,
            status: 'check-failed',
            mandatory: true,
          }))
        }
      } finally {
        appUpdateCheckRunningRef.current = false

        if (gateShownForCheck) {
          setAppUpdateCheckPending(false)
        }
      }

      gateRequested = appUpdateCheckQueuedGateRef.current
    } while (appUpdateCheckQueuedRef.current)
  }, [])

  const checkNativeAppUpdate = useCallback(
    (options = {}) => {
      return isNativeIosApp()
        ? checkIosAppUpdate(options)
        : checkAndroidAppUpdate(options)
    },
    [checkAndroidAppUpdate, checkIosAppUpdate],
  )

  useEffect(() => {
    if (startupSplashVisible || appUpdateInitialCheckRef.current) {
      return
    }

    if (!isNativeMobileApp()) {
      setAppUpdateCheckPending(false)
      return
    }

    appUpdateInitialCheckRef.current = true
    checkNativeAppUpdate({ showGate: true })
  }, [checkNativeAppUpdate, startupSplashVisible])

  useEffect(() => {
    if (!isNativeMobileApp()) {
      return undefined
    }

    let active = true
    let listenerHandle = null

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (active && isActive && appUpdateInitialCheckRef.current) {
        checkNativeAppUpdate()
      }
    }).then((handle) => {
      if (active) {
        listenerHandle = handle
      } else {
        handle.remove()
      }
    })

    return () => {
      active = false
      listenerHandle?.remove()
    }
  }, [checkNativeAppUpdate])

  useEffect(() => {
    if (!isNativeMobileApp()) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        appUpdateInitialCheckRef.current
      ) {
        checkNativeAppUpdate()
      }
    }, APP_UPDATE_PERIODIC_CHECK_MS)

    return () => window.clearInterval(intervalId)
  }, [checkNativeAppUpdate])

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

        beginNotificationSession(session.user.id)

        const { data: profileData, error: profileError } = await fetchProfileById(
          session.user.id
        )

        if (profileError || !profileData) {
          await cleanupAndSignOutCurrentUser({
            expectedUserId: session.user.id,
            accessToken: session.access_token,
            message: t.profileNotFound,
          })
          setRestoringSession(false)
          return
        }

        if (profileData.is_active === false) {
          await cleanupAndSignOutCurrentUser({
            expectedUserId: session.user.id,
            accessToken: session.access_token,
            message: t.inactiveBlocked,
          })
          setRestoringSession(false)
          return
        }

        const deviceResult = await checkDeviceAccess(session.access_token, {
          register: true,
        })

        if (!deviceResult.approved && profileData.role !== 'admin') {
          await cleanupAndSignOutCurrentUser({
            expectedUserId: session.user.id,
            accessToken: session.access_token,
            message: getDeviceAccessMessage(deviceResult),
            messageKind: 'warning',
          })
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

    const checkedUserId = userProfile.id
    const checkedUserRole = userProfile.role
    let active = true
    let checkRunning = false

    const checkUserActiveStatus = async () => {
      if (!active || checkRunning || logoutInProgressRef.current) {
        return
      }

      checkRunning = true

      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const checkedSession = sessionData?.session

        if (!active || !isAuthSessionUser(checkedSession, checkedUserId)) {
          return
        }

        const accessToken = checkedSession.access_token
        const { data, error } = await supabase
          .from('profiles')
          .select('id, is_active')
          .eq('id', checkedUserId)
          .single()

        if (!active || error || !data) {
          return
        }

        if (data.is_active === false) {
          await cleanupAndSignOutCurrentUser({
            expectedUserId: checkedUserId,
            accessToken,
            message: t.inactiveAutoLogout,
          })
          return
        }

        const deviceResult = await checkDeviceAccess(accessToken)

        if (
          !active ||
          !isAuthSessionUser(
            (await supabase.auth.getSession()).data?.session,
            checkedUserId,
          )
        ) {
          return
        }

        if (!deviceResult.approved && checkedUserRole !== 'admin') {
          await cleanupAndSignOutCurrentUser({
            expectedUserId: checkedUserId,
            accessToken,
            message: getDeviceAccessMessage(deviceResult),
          })
        }
      } catch (err) {
        console.log('Aktiflik kontrol hatası:', err)
      } finally {
        checkRunning = false
      }
    }

    checkUserActiveStatus()

    const intervalId = setInterval(checkUserActiveStatus, DEVICE_ACCESS_CHECK_MS)

    return () => {
      active = false
      clearInterval(intervalId)
    }
    // Kontrol döngüsü yalnızca kullanıcı veya dil değiştiğinde yeniden kurulmalıdır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProfile?.id, language])

  useEffect(() => {
    if (!userProfile?.id) {
      return
    }

    if (isNativeMobileApp()) {
      if (appUpdateCheckPending || appUpdateNotice.mandatory) {
        return
      }

      const subscriptionTimer = window.setTimeout(() => {
        registerNativePushSubscription(userProfile.id, {
          requestPermission:
            localStorage.getItem(NATIVE_NOTIFICATION_PERMISSION_ASKED_KEY) !==
            'true',
        })
      }, 0)

      return () => window.clearTimeout(subscriptionTimer)
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
  }, [
    appUpdateCheckPending,
    appUpdateNotice.mandatory,
    userProfile?.id,
  ])

  useEffect(() => {
    if (
      !isNativeMobileApp() ||
      !userProfile?.id ||
      appUpdateCheckPending ||
      appUpdateNotice.mandatory
    ) {
      return undefined
    }

    const notificationSession = getNotificationSession(userProfile.id)

    if (!notificationSession) {
      return undefined
    }

    let active = true
    let listenerHandle = null

    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (active && isActive) {
        registerNativePushSubscription(userProfile.id, {
          requestPermission: false,
          notificationSession,
        })
      }
    }).then((handle) => {
      if (active) {
        listenerHandle = handle
      } else {
        handle.remove()
      }
    })

    return () => {
      active = false
      listenerHandle?.remove()
    }
    // Foreground token refresh must follow the active signed-in Android user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appUpdateCheckPending,
    appUpdateNotice.mandatory,
    userProfile?.id,
  ])

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

  const toggleScannerTorch = async () => {
    const track = scannerTorchTrackRef.current

    if (!scannerTorchSupported || !supportsCameraTorch(track)) {
      if (scannerTorchOn) {
        stopScanner()
        return
      }

      scannerTorchTrackRef.current = null
      setScannerTorchSupported(false)
      setScannerTorchOn(false)
      return
    }

    if (scannerTorchChangingRef.current) {
      return
    }

    const nextTorchState = !scannerTorchOn
    scannerTorchChangingRef.current = track

    try {
      await applyCameraTorch(track, nextTorchState)

      if (scannerTorchTrackRef.current === track) {
        setScannerTorchOn(nextTorchState)
      }
    } catch (err) {
      console.log('Camera torch change skipped:', err)

      if (scannerTorchTrackRef.current === track) {
        if (!nextTorchState) {
          stopScanner()
          return
        }

        scannerTorchTrackRef.current = null
        setScannerTorchSupported(false)
        setScannerTorchOn(false)
      }
    } finally {
      if (scannerTorchChangingRef.current === track) {
        scannerTorchChangingRef.current = null
      }
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
    scannerCandidateRef.current = null
    scannerTorchTrackRef.current = null
    scannerTorchChangingRef.current = null
    setScannerTorchSupported(false)
    setScannerTorchOn(false)

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

        const video = videoRef.current
        const scanFrame = scanFrameRef.current
        const resultPoints = result.getResultPoints?.() || []
        const points = resultPoints.map((point) => ({
          x: Number(point?.getX?.()),
          y: Number(point?.getY?.()),
        }))
        const isCentered =
          video &&
          scanFrame &&
          isBarcodeCenteredInFrame({
            points,
            sourceWidth: video.videoWidth,
            sourceHeight: video.videoHeight,
            videoRect: video.getBoundingClientRect(),
            frameRect: scanFrame.getBoundingClientRect(),
          })

        if (!isCentered) {
          return
        }

        const confirmation = confirmBarcodeCandidate(
          scannerCandidateRef.current,
          scannedText,
          performance.now()
        )

        scannerCandidateRef.current = confirmation.candidate

        if (!confirmation.confirmed) {
          return
        }

        scannerResultHandledRef.current = true

        setBarcode(scannedText)
        saveBarcodeToHistory(scannedText)

        if (navigator.vibrate) {
          navigator.vibrate(180)
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

      if (scannerStartTokenRef.current !== startToken) {
        stopMediaStream(stream)
        return
      }

      const cameraTrack = stream.getVideoTracks()[0]

      if (supportsCameraTorch(cameraTrack)) {
        scannerTorchTrackRef.current = cameraTrack
        setScannerTorchSupported(true)
      }

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
        stopScanner()
        showUserMessage(t.cameraError + err.message, 'error')
      }
    }
  }

  async function unregisterCurrentNotificationSubscription(
    accessToken,
    userId,
  ) {
    const pendingRegistrations = [
      nativePushRegistrationRef.current,
      webPushRegistrationRef.current,
    ]
      .filter((record) => record?.promise && (!userId || record.userId === userId))
      .map((record) => record.promise)

    if (pendingRegistrations.length > 0) {
      const registrationResults = await Promise.allSettled(
        pendingRegistrations,
      )

      registrationResults.forEach((result) => {
        if (result.status === 'rejected') {
          console.log('Bildirim kayıt işlemi tamamlanamadı:', result.reason)
        }
      })
    }

    if (isNativeMobileApp()) {
      let remoteUnregisterError = null
      let localUnregisterError = null
      let nativeToken = nativePushTokenRef.current || ''
      const nativePushPlatform = getNativePushPlatform()

      const unregisterRemoteToken = async (token = '') => {
        const response = await fetchWithTimeout(
          `${API_BASE_URL}/api/push-registration`,
          {
            method: 'POST',
            headers: makeAuthorizedHeaders(accessToken, {
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({
              action: 'unregister',
              platform: nativePushPlatform,
              token: token || undefined,
            }),
          },
          NOTIFICATION_OPERATION_TIMEOUT_MS,
        )
        const result = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(
            result.error || 'Bildirim kaydı kapatılamadı.',
          )
        }

        if (!Number.isInteger(result.deleted) || result.deleted < 0) {
          throw new Error('Bildirim sunucusu geçersiz yanıt verdi.')
        }

        return result
      }

      if (accessToken && userId) {
        try {
          let result = await unregisterRemoteToken(nativeToken)

          if (result.legacyTokenRequired === true && !nativeToken) {
            const permission = await PushNotifications.checkPermissions()

            if (permission.receive === 'granted') {
              nativeToken = await waitForNativePushToken()
              nativePushTokenRef.current = nativeToken
              result = await unregisterRemoteToken(nativeToken)
            }
          }

          if (result.legacyTokenRequired === true) {
            throw new Error(
              'Eski bildirim kaydı cihaz anahtarı olmadan kapatılamadı.',
            )
          }
        } catch (err) {
          remoteUnregisterError = err
        }
      }

      try {
        await PushNotifications.unregister()
      } catch (err) {
        localUnregisterError = err
      } finally {
        nativePushTokenRef.current = ''
      }

      if (remoteUnregisterError || localUnregisterError) {
        const messages = [remoteUnregisterError, localUnregisterError]
          .filter(Boolean)
          .map((error) => error.message || String(error))

        throw new Error(messages.join(' | '))
      }

      return
    }

    if (!canUseNotifications()) {
      return
    }

    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()

    if (!subscription) {
      return
    }

    let databaseError = null
    let unsubscribeError = null

    try {
      if (userId) {
        const { error } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', subscription.endpoint)

        if (error) {
          databaseError = error
        }
      }
    } finally {
      try {
        await subscription.unsubscribe()
      } catch (error) {
        unsubscribeError = error
      }
    }

    if (databaseError || unsubscribeError) {
      const messages = [databaseError, unsubscribeError]
        .filter(Boolean)
        .map((error) => error.message || String(error))

      throw new Error(messages.join(' | '))
    }
  }

  async function cleanupAndSignOutCurrentUser({
    expectedUserId,
    accessToken = '',
    message = '',
    messageKind = 'error',
    writeLogoutLog = false,
  }) {
    if (logoutInProgressRef.current) {
      return false
    }

    const { data: initialSessionData } = await supabase.auth.getSession()
    const initialSession = initialSessionData?.session

    if (!isAuthSessionUser(initialSession, expectedUserId)) {
      return false
    }

    logoutInProgressRef.current = true
    setLogoutInProgress(true)
    setLogoutConfirmationOpen(false)
    stopScanner()
    invalidateNotificationSession(expectedUserId)

    let notificationCleanupFailed = false

    try {
      const preparationTasks = [
        unregisterCurrentNotificationSubscription(
          accessToken || initialSession.access_token || '',
          expectedUserId,
        ),
      ]

      if (writeLogoutLog) {
        preparationTasks.push(
          (async () => {
            const { error } = await supabase.from('login_logs').insert({
              user_id: expectedUserId,
              event_type: 'logout',
              device_name: getDeviceName(),
              app_version: APP_LOG_VERSION,
            })

            if (error) {
              throw new Error(error.message)
            }
          })(),
        )
      }

      const preparationResults = await Promise.allSettled(preparationTasks)

      preparationResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.log('Çıkış hazırlığı tamamlanamadı:', result.reason)

          if (index === 0) {
            notificationCleanupFailed = true
          }
        }
      })

      const { data: latestSessionData } = await supabase.auth.getSession()

      if (!isAuthSessionUser(latestSessionData?.session, expectedUserId)) {
        return false
      }

      try {
        const { error } = await supabase.auth.signOut()

        if (error) {
          throw new Error(error.message)
        }
      } catch (signOutError) {
        console.log('Sunucu oturumu kapatılamadı:', signOutError)
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
      }

      resetUserState()

      if (message) {
        showUserMessage(
          notificationCleanupFailed && messageKind === 'success'
            ? t.logoutNotificationCleanupWarning
            : message,
          notificationCleanupFailed && messageKind === 'success'
            ? 'warning'
            : messageKind,
        )
      }

      return {
        notificationCleanupFailed,
        signedOut: true,
      }
    } finally {
      logoutInProgressRef.current = false
      setLogoutInProgress(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()

    if (logoutInProgressRef.current) {
      return
    }

    clearUserMessage()
    setLoading(true)

    try {
      const cleanUsername = username.trim().toLowerCase()

      if (!cleanUsername || !password) {
        showUserMessage(t.usernamePasswordRequired, 'warning')
        setLoading(false)
        return
      }

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

      const { data: profileData, error: profileError } =
        await fetchProfileById(userId)

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

      const notificationSession = beginNotificationSession(userId)
      setUserProfile(profileData)
      setDisplayName(makeDisplayName(profileData, cleanUsername))
      setBarcodeHistory(loadBarcodeHistory())
      clearUserMessage()

      const notificationPermission = await requestNotificationPermissionOnce()

      if (
        notificationPermission === 'granted' &&
        isSessionLifecycleCurrent(
          notificationSessionRef.current,
          notificationSession,
        )
      ) {
        await registerPushSubscription(userId, {
          forceRenew: true,
          showMessage: false,
          notificationSession,
        })
      }
    } catch (err) {
      showUserMessage(t.unexpectedError + err.message, 'error')
    }

    setLoading(false)
  }

  const performLogout = async () => {
    if (logoutInProgressRef.current) {
      return
    }

    setLogoutConfirmationOpen(false)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData?.session?.user?.id || userProfile?.id
      const accessToken = sessionData?.session?.access_token || ''

      if (!userId) {
        invalidateNotificationSession()
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        resetUserState()
        showUserMessage(t.logoutSuccess, 'success')
        return
      }

      const logoutResult = await cleanupAndSignOutCurrentUser({
        expectedUserId: userId,
        accessToken,
        message: t.logoutSuccess,
        messageKind: 'success',
        writeLogoutLog: true,
      })

      if (!logoutResult) {
        const { data: latestSessionData } = await supabase.auth.getSession()

        if (!latestSessionData?.session) {
          invalidateNotificationSession(userId)
          await unregisterCurrentNotificationSubscription('', userId).catch(
            (error) => {
              console.log('Yerel bildirim kaydı kapatılamadı:', error)
            },
          )
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
          resetUserState()
          showUserMessage(t.logoutSuccess, 'success')
          return
        }

        resetUserState()
        showUserMessage(t.sessionMissing, 'warning')
      }
    } catch (err) {
      console.log('Çıkış hazırlığı hatası:', err)
      logoutInProgressRef.current = false
      setLogoutInProgress(false)
    }
  }

  const handleLogout = () => {
    if (!logoutInProgressRef.current) {
      setLogoutConfirmationOpen(true)
    }
  }

  const renderGlobalDialogs = () => (
    <>
      {appUpdateCheckPending ? (
        <AppUpdateCheckGate texts={t} />
      ) : (
        renderAppUpdateNotice()
      )}
      <ConfirmationDialog
        open={logoutConfirmationOpen}
        title={t.logoutTitle}
        message={t.logoutConfirm}
        cancelLabel={t.cancel}
        confirmLabel={t.logout}
        disabled={logoutInProgress}
        onCancel={closeLogoutConfirmation}
        onConfirm={performLogout}
      />
    </>
  )

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

    if (isNativeAndroidApp()) {
      blurAndroidImeTarget(document.activeElement)
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

  const handleReportClick = (report) => {
    if (!report.requiresDateRange) {
      openReport(report)
      return
    }

    clearUserMessage()
    setDateRangeReportCode((currentCode) =>
      currentCode === report.code ? '' : report.code
    )
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
            <label className="desktopPermissionCheck">
              <input
                type="checkbox"
                checked={
                  user.role === 'admin' ||
                  user.can_view_yarn_stock_report === true
                }
                disabled={user.role === 'admin'}
                onChange={(e) =>
                  updateAdminUser(user.id, {
                    can_view_yarn_stock_report: e.target.checked,
                  })
                }
              />
              İplik Stok Raporu
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
  const showNativeNotificationRecovery =
    isNativeAndroidApp() &&
    shouldShowNativeNotificationRecovery({
      permission: nativeNotificationPermission,
      alreadyAsked:
        localStorage.getItem(NATIVE_NOTIFICATION_PERMISSION_ASKED_KEY) ===
        'true',
    })

  if (startupSplashVisible) {
    return <StartupSplash onComplete={hideStartupSplash} />
  }

  if (appUpdateCheckPending) {
    return <AppUpdateCheckGate texts={t} />
  }

  if (appUpdateNotice.visible && appUpdateNotice.mandatory) {
    return renderAppUpdateNotice()
  }

  if (pdfViewerData) {
    return (
      <>
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
        {renderGlobalDialogs()}
      </>
    )
  }

  if (restoringSession) {
    return (
      <div className="page" dir={isArabic ? 'rtl' : 'ltr'}>
        {renderGlobalDialogs()}
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
        {renderGlobalDialogs()}
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
          {renderGlobalDialogs()}
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
        {renderGlobalDialogs()}
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

                    <label className="adminPermissionToggle">
                      <input
                        type="checkbox"
                        checked={
                          newAdminUser.role === 'admin' ||
                          newAdminUser.can_view_yarn_stock_report
                        }
                        disabled={creatingAdminUser || newAdminUser.role === 'admin'}
                        onChange={(e) =>
                          setNewAdminUser((current) => ({
                            ...current,
                            can_view_yarn_stock_report: e.target.checked,
                          }))
                        }
                      />
                      <span>İplik Stok Raporu</span>
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
                  maxLength={120}
                  placeholder="Elvan Barkod Rapor"
                  disabled={adminNotificationSending}
                />

                <label htmlFor="desktopNotificationBody">Bildirim Mesajı</label>
                <textarea
                  id="desktopNotificationBody"
                  className="adminTextarea"
                  value={adminNotificationBody}
                  onChange={(e) => setAdminNotificationBody(e.target.value)}
                  maxLength={800}
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
              maxLength={120}
              placeholder="Elvan Barkod Rapor"
              disabled={adminNotificationSending}
            />

            <label htmlFor="adminNotificationBody">Bildirim Mesajı</label>
            <textarea
              id="adminNotificationBody"
              className="adminTextarea"
              value={adminNotificationBody}
              onChange={(e) => setAdminNotificationBody(e.target.value)}
              maxLength={800}
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

                <label className="adminPermissionToggle">
                  <input
                    type="checkbox"
                    checked={
                      newAdminUser.role === 'admin' ||
                      newAdminUser.can_view_yarn_stock_report
                    }
                    disabled={creatingAdminUser || newAdminUser.role === 'admin'}
                    onChange={(e) =>
                      setNewAdminUser((current) => ({
                        ...current,
                        can_view_yarn_stock_report: e.target.checked,
                      }))
                    }
                  />
                  <span>İplik Stok Raporu</span>
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
                          <label className="adminPermissionToggle">
                            <input
                              type="checkbox"
                              checked={
                                user.role === 'admin' ||
                                user.can_view_yarn_stock_report === true
                              }
                              disabled={user.role === 'admin'}
                              onChange={(e) =>
                                updateAdminUser(user.id, {
                                  can_view_yarn_stock_report: e.target.checked,
                                })
                              }
                            />
                            <span>İplik Stok Raporu</span>
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
      <div className="page mainPage" dir={isArabic ? 'rtl' : 'ltr'}>
        {renderGlobalDialogs()}
        <div className="card mainCard">
          <div className="topBar">
            <img src="/elvan-logo.png" alt="Elvan Dyeing" className="appLogo" />

            <SelectionDialog
              className="languageSelect"
              aria-label={t.languageSelection}
              title={t.languageSelection}
              closeLabel={t.close}
              placeholder={t.languageSelection}
              value={language}
              onChange={changeLanguage}
              options={LANGUAGE_OPTIONS}
            />
          </div>

          <div className="welcomeBox">
            <span className="eyebrow">{t.appSubtitle}</span>
            <h1>{displayName ? `${t.welcome}, ${displayName}` : t.welcome}</h1>
          </div>

          {showNativeNotificationRecovery && (
            <aside className="notificationPermissionNotice" role="status">
              <div>
                <strong>{t.notificationSettingsTitle}</strong>
                <p>{t.notificationSettingsBody}</p>
              </div>
              <button
                type="button"
                className="scanButton"
                onClick={openNativeNotificationSettings}
              >
                {t.notificationSettingsButton}
              </button>
            </aside>
          )}

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
            ref={scannerTriggerRef}
            aria-haspopup="dialog"
            aria-expanded={scannerOpen}
            aria-controls={scannerOpen ? 'barcodeScannerDialog' : undefined}
          >
            {scannerOpen ? t.cameraOpen : t.scanBarcode}
          </button>

          {scannerOpen && (
            <div className="scannerOverlay">
              <div
                id="barcodeScannerDialog"
                className="scannerPanel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="barcodeScannerTitle"
                ref={scannerPanelRef}
              >
                <div className="scannerTop">
                  <div>
                    <strong id="barcodeScannerTitle">{t.cameraOpen}</strong>
                    <span>{t.alignBarcode}</span>
                  </div>

                  <button
                    type="button"
                    className="scannerCloseSmall"
                    onClick={stopScanner}
                    ref={scannerCloseButtonRef}
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

                  <div ref={scanFrameRef} className="scanFrame">
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
                    <p
                      className="scannerMessage"
                      role="status"
                      aria-live="polite"
                    >
                      {scannerMessage}
                    </p>
                  )}

                  <p className="scannerHint">{t.cameraHint}</p>

                  {scannerTorchSupported && (
                    <button
                      type="button"
                      className={`scannerTorchButton${scannerTorchOn ? ' is-active' : ''}`}
                      onClick={toggleScannerTorch}
                      aria-pressed={scannerTorchOn}
                      aria-label={
                        scannerTorchOn
                          ? t.turnFlashlightOff
                          : t.turnFlashlightOn
                      }
                      title={
                        scannerTorchOn
                          ? t.turnFlashlightOff
                          : t.turnFlashlightOn
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M9 2h6l1 6H8l1-6Z" />
                        <path d="M9 8h6l-1.5 4.5V21h-3v-8.5L9 8Z" />
                      </svg>
                      <span>{t.flashlight}</span>
                    </button>
                  )}

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

          <ReportList
            reports={visibleReports}
            loading={loading}
            selectedReportCode={selectedReportCode}
            dateRangeReportCode={dateRangeReportCode}
            getReportName={getReportName}
            getReportMeta={getReportMeta}
            onReportClick={handleReportClick}
            onOpenReport={openReport}
            shipment={{
              customers: SHIPMENT_CUSTOMERS,
              customerCode: shipmentCustomerCode,
              dateBoxRef: shipmentDateBoxRef,
              customerSelectRef: shipmentCustomerSelectRef,
              startInputRef: shipmentStartInputRef,
              startDate,
              endDate,
              dayCount: dateRangeDayCount,
              formatDate: formatDisplayDate,
              language,
              texts: t,
              onCustomerChange: setShipmentCustomerCode,
              onStartDateChange: setStartDate,
              onEndDateChange: setEndDate,
            }}
          />

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
      {renderGlobalDialogs()}
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

          <SelectionDialog
            className="languageSelect"
            aria-label={t.languageSelection}
            title={t.languageSelection}
            closeLabel={t.close}
            placeholder={t.languageSelection}
            value={language}
            onChange={changeLanguage}
            options={LANGUAGE_OPTIONS}
          />
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
