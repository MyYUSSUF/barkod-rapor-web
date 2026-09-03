import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './NotificationCenter.css'

const CAIRO_TIMEZONE = 'Africa/Cairo'
const MAX_TITLE_LENGTH = 120
const MAX_BODY_LENGTH = 800

const WEEKDAYS = [
  { value: 1, short: 'Pzt', long: 'Pazartesi' },
  { value: 2, short: 'Sal', long: 'Salı' },
  { value: 3, short: 'Çar', long: 'Çarşamba' },
  { value: 4, short: 'Per', long: 'Perşembe' },
  { value: 5, short: 'Cum', long: 'Cuma' },
  { value: 6, short: 'Cmt', long: 'Cumartesi' },
  { value: 0, short: 'Paz', long: 'Pazar' },
]

const DEFAULT_SEND_FORM = {
  audienceType: 'all',
  targetUserId: '',
  deliveryScope: 'all_devices',
  titleTr: 'Elvan Rapor',
  bodyTr: '',
  titleEn: 'Elvan Report',
  bodyEn: '',
}

const DEFAULT_AUTOMATION_FORM = {
  name: 'Günlük Motivasyon',
  contentType: 'daily_motivation',
  audienceType: 'all',
  targetUserId: '',
  deliveryScope: 'all_devices',
  sendTime: '07:30',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  titleTr: '',
  bodyTr: '',
  titleEn: '',
  bodyEn: '',
  isActive: true,
}

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

function userLabel(user) {
  return user?.full_name || user?.username || user?.email || 'İsimsiz kullanıcı'
}

function apiUrl(baseUrl, path) {
  return `${String(baseUrl || '').replace(/\/$/, '')}${path}`
}

function parseResponseMessage(result, fallback) {
  return result?.error || result?.message || fallback
}

function normalizeList(value) {
  return Array.isArray(value) ? value : []
}

function getAutomationId(automation) {
  return automation?.id || automation?.automation_id || ''
}

function isAutomationActive(automation) {
  return automation?.is_active ?? automation?.isActive ?? false
}

function automationToDraft(automation) {
  return {
    name: automation?.name || '',
    contentType:
      automation?.content_type || automation?.contentType || 'daily_motivation',
    audienceType:
      automation?.audience_type || automation?.audienceType || 'all',
    targetUserId:
      automation?.target_user_id || automation?.targetUserId || '',
    deliveryScope:
      automation?.delivery_scope || automation?.deliveryScope || 'all_devices',
    sendTime: String(
      automation?.send_time || automation?.sendTime || '07:30',
    ).slice(0, 5),
    daysOfWeek: normalizeList(
      automation?.days_of_week || automation?.daysOfWeek,
    ).map(Number),
    titleTr: automation?.title_tr || automation?.titleTr || '',
    bodyTr: automation?.body_tr || automation?.bodyTr || '',
    titleEn: automation?.title_en || automation?.titleEn || '',
    bodyEn: automation?.body_en || automation?.bodyEn || '',
    isActive: isAutomationActive(automation),
  }
}

function formatCairoDate(value) {
  if (!value) return '—'

  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: CAIRO_TIMEZONE,
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

function formatDays(days) {
  const values = normalizeList(days).map(Number)

  if (values.length === 7) return 'Her gün'
  if (
    values.length === 5 &&
    [1, 2, 3, 4, 5].every((day) => values.includes(day))
  ) {
    return 'Hafta içi'
  }

  return WEEKDAYS.filter((day) => values.includes(day.value))
    .map((day) => day.short)
    .join(', ')
}

function getRunStatus(run) {
  const status = String(run?.status || '').toLowerCase()
  if (['completed', 'success', 'sent'].includes(status)) {
    return { label: 'Tamamlandı', tone: 'success' }
  }
  if (['started', 'running', 'processing', 'claimed'].includes(status)) {
    return { label: 'İşleniyor', tone: 'info' }
  }
  if (status === 'partial') return { label: 'Kısmi', tone: 'warning' }
  if (['failed', 'error'].includes(status)) {
    return { label: 'Başarısız', tone: 'danger' }
  }
  return { label: status || 'Bilinmiyor', tone: 'neutral' }
}

function NotificationPreview({ language, title, body }) {
  return (
    <article className="ncPreviewCard">
      <span className="ncLanguageTag">{language}</span>
      <div>
        <strong>{title || 'Başlık girilmedi'}</strong>
        <p>{body || 'Mesaj girilmedi'}</p>
      </div>
    </article>
  )
}

function CharacterCount({ value, max }) {
  const length = Array.from(value || '').length
  return (
    <span className={classNames('ncCharacterCount', length > max && 'isOver')}>
      {length}/{max}
    </span>
  )
}

function Feedback({ feedback, onDismiss }) {
  if (!feedback?.message) return null

  return (
    <div
      className={classNames('ncFeedback', `is-${feedback.type || 'info'}`)}
      role={feedback.type === 'danger' ? 'alert' : 'status'}
    >
      <span>{feedback.message}</span>
      <button type="button" onClick={onDismiss} aria-label="Mesajı kapat">
        ×
      </button>
    </div>
  )
}

export function NotificationCenter({
  users = [],
  subscriptionCount = 0,
  apiBaseUrl = '',
  getAccessToken,
  makeAuthorizedHeaders,
  sessionMissingMessage = 'Oturum bulunamadı. Lütfen yeniden giriş yapın.',
}) {
  const [activeTab, setActiveTab] = useState('send')
  const [sendForm, setSendForm] = useState(DEFAULT_SEND_FORM)
  const [sendBusy, setSendBusy] = useState(false)
  const [automations, setAutomations] = useState([])
  const [runs, setRuns] = useState([])
  const [deliveryLogs, setDeliveryLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [automationEditorOpen, setAutomationEditorOpen] = useState(false)
  const [automationDraft, setAutomationDraft] = useState(DEFAULT_AUTOMATION_FORM)
  const [editingAutomationId, setEditingAutomationId] = useState('')
  const [automationBusy, setAutomationBusy] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const confirmButtonRef = useRef(null)

  const activeUsers = useMemo(
    () => users.filter((user) => user?.is_active !== false),
    [users],
  )

  const usersById = useMemo(
    () => new Map(users.map((user) => [String(user.id), user])),
    [users],
  )

  const selectedSendUser = usersById.get(sendForm.targetUserId)
  const selectedAutomationUser = usersById.get(automationDraft.targetUserId)

  const authorizedRequest = useCallback(
    async (path, options = {}) => {
      if (typeof getAccessToken !== 'function') {
        throw new Error(sessionMissingMessage)
      }

      const accessToken = await getAccessToken()
      if (!accessToken) throw new Error(sessionMissingMessage)

      const additionalHeaders = {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      }
      const headers =
        typeof makeAuthorizedHeaders === 'function'
          ? makeAuthorizedHeaders(accessToken, additionalHeaders)
          : { ...additionalHeaders, Authorization: `Bearer ${accessToken}` }
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 45_000)

      try {
        const response = await fetch(apiUrl(apiBaseUrl, path), {
          ...options,
          headers,
          signal: controller.signal,
        })
        const result = await response.json().catch(() => ({}))

        if (!response.ok) {
          throw new Error(parseResponseMessage(result, 'İşlem tamamlanamadı.'))
        }

        return result
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('İstek zaman aşımına uğradı. Lütfen tekrar deneyin.', {
            cause: error,
          })
        }
        throw error
      } finally {
        window.clearTimeout(timeoutId)
      }
    },
    [apiBaseUrl, getAccessToken, makeAuthorizedHeaders, sessionMissingMessage],
  )

  const loadNotificationData = useCallback(
    async ({ quiet = false } = {}) => {
      if (quiet) setRefreshing(true)
      else setLoading(true)

      try {
        const result = await authorizedRequest('/api/notification-automations')
        setAutomations(normalizeList(result.automations))
        setRuns(normalizeList(result.runs || result.recentRuns))
        setDeliveryLogs(
          normalizeList(
            result.deliveries || result.deliveryLogs || result.delivery_logs,
          ),
        )
        if (quiet) {
          setFeedback({ type: 'success', message: 'Bildirim verileri yenilendi.' })
        }
      } catch (error) {
        setFeedback({ type: 'danger', message: error.message })
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [authorizedRequest],
  )

  useEffect(() => {
    loadNotificationData()
  }, [loadNotificationData])

  useEffect(() => {
    if (!confirmation) return undefined

    confirmButtonRef.current?.focus()
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !sendBusy && !automationBusy) {
        setConfirmation(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [automationBusy, confirmation, sendBusy])

  const updateSendForm = (patch) => {
    setSendForm((current) => ({ ...current, ...patch }))
  }

  const updateAutomationDraft = (patch) => {
    setAutomationDraft((current) => ({ ...current, ...patch }))
  }

  const validateLocalizedContent = (form) => {
    const fields = [
      ['Türkçe başlık', form.titleTr, MAX_TITLE_LENGTH],
      ['Türkçe mesaj', form.bodyTr, MAX_BODY_LENGTH],
      ['İngilizce başlık', form.titleEn, MAX_TITLE_LENGTH],
      ['İngilizce mesaj', form.bodyEn, MAX_BODY_LENGTH],
    ]

    for (const [label, value, max] of fields) {
      const cleanValue = String(value || '').trim()
      if (!cleanValue) return `${label} boş olamaz.`
      if (Array.from(cleanValue).length > max) {
        return `${label} en fazla ${max} karakter olabilir.`
      }
    }

    return ''
  }

  const prepareSend = (event) => {
    event.preventDefault()
    setFeedback(null)

    const contentError = validateLocalizedContent(sendForm)
    if (contentError) {
      setFeedback({ type: 'danger', message: contentError })
      return
    }

    if (sendForm.audienceType === 'user' && !selectedSendUser) {
      setFeedback({ type: 'danger', message: 'Bir kullanıcı seçmelisiniz.' })
      return
    }

    const recipientText =
      sendForm.audienceType === 'all'
        ? `Tüm aktif kullanıcılar · ${subscriptionCount} kayıtlı bildirim cihazı`
        : `${userLabel(selectedSendUser)} · ${
            sendForm.deliveryScope === 'latest_device'
              ? 'yalnızca son bildirim cihazı'
              : 'tüm bildirim cihazları'
          }`

    setConfirmation({
      type: 'send',
      title: 'Bildirimi şimdi gönder?',
      description:
        'Mesaj, cihazda seçili uygulama diline göre Türkçe veya İngilizce iletilecek.',
      recipientText,
    })
  }

  const sendNotification = async () => {
    setSendBusy(true)

    const payload = {
      title: sendForm.titleEn.trim(),
      body: sendForm.bodyEn.trim(),
      url: '/',
      localizedMessages: {
        tr: {
          title: sendForm.titleTr.trim(),
          body: sendForm.bodyTr.trim(),
          url: '/',
        },
        en: {
          title: sendForm.titleEn.trim(),
          body: sendForm.bodyEn.trim(),
          url: '/',
        },
      },
      targetUserId:
        sendForm.audienceType === 'user'
          ? sendForm.targetUserId
          : undefined,
      singleDevice:
        sendForm.audienceType === 'user' &&
        sendForm.deliveryScope === 'latest_device',
    }

    try {
      const result = await authorizedRequest('/api/send-notification', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      const total = Number(result.total || 0)
      const sent = Number(result.sent || 0)
      const failed = Number(result.failed || 0)

      if (total === 0) {
        setFeedback({
          type: 'warning',
          message:
            result.message || 'Bildirimin gönderilebileceği uygun cihaz yok.',
        })
      } else {
        setFeedback({
          type: failed > 0 ? 'warning' : 'success',
          message: `Gönderim tamamlandı: ${sent} başarılı, ${failed} başarısız, ${total} hedef.`,
        })
        setSendForm((current) => ({
          ...current,
          bodyTr: '',
          bodyEn: '',
        }))
        await loadNotificationData()
      }
      setConfirmation(null)
    } catch (error) {
      setFeedback({ type: 'danger', message: error.message })
    } finally {
      setSendBusy(false)
    }
  }

  const openNewAutomation = () => {
    setEditingAutomationId('')
    setAutomationDraft({ ...DEFAULT_AUTOMATION_FORM })
    setAutomationEditorOpen(true)
    setFeedback(null)
  }

  const editAutomation = (automation) => {
    setEditingAutomationId(getAutomationId(automation))
    setAutomationDraft(automationToDraft(automation))
    setAutomationEditorOpen(true)
    setFeedback(null)
  }

  const closeAutomationEditor = () => {
    if (automationBusy) return
    setAutomationEditorOpen(false)
    setEditingAutomationId('')
    setAutomationDraft({ ...DEFAULT_AUTOMATION_FORM })
  }

  const automationPayload = (draft, isActive = draft.isActive) => ({
    name: draft.name.trim(),
    contentType: draft.contentType,
    audienceType: draft.audienceType,
    targetUserId:
      draft.audienceType === 'user' ? draft.targetUserId : undefined,
    deliveryScope:
      draft.audienceType === 'user' ? draft.deliveryScope : 'all_devices',
    sendTime: draft.sendTime,
    daysOfWeek: [...draft.daysOfWeek].sort((left, right) => left - right),
    titleTr: draft.contentType === 'custom' ? draft.titleTr.trim() : undefined,
    bodyTr: draft.contentType === 'custom' ? draft.bodyTr.trim() : undefined,
    titleEn: draft.contentType === 'custom' ? draft.titleEn.trim() : undefined,
    bodyEn: draft.contentType === 'custom' ? draft.bodyEn.trim() : undefined,
    url: '/',
    isActive,
  })

  const saveAutomation = async (event) => {
    event.preventDefault()
    setFeedback(null)

    if (!automationDraft.name.trim()) {
      setFeedback({ type: 'danger', message: 'Otomasyon adı boş olamaz.' })
      return
    }
    if (automationDraft.daysOfWeek.length === 0) {
      setFeedback({
        type: 'danger',
        message: 'En az bir gönderim günü seçmelisiniz.',
      })
      return
    }
    if (automationDraft.audienceType === 'user' && !selectedAutomationUser) {
      setFeedback({ type: 'danger', message: 'Bir kullanıcı seçmelisiniz.' })
      return
    }
    if (automationDraft.contentType === 'custom') {
      const contentError = validateLocalizedContent(automationDraft)
      if (contentError) {
        setFeedback({ type: 'danger', message: contentError })
        return
      }
    }

    const operationId = editingAutomationId || 'new'
    setAutomationBusy(operationId)

    try {
      await authorizedRequest('/api/notification-automations', {
        method: editingAutomationId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...(editingAutomationId ? { id: editingAutomationId } : {}),
          ...automationPayload(automationDraft),
        }),
      })
      setFeedback({
        type: 'success',
        message: editingAutomationId
          ? 'Otomasyon güncellendi.'
          : 'Otomasyon oluşturuldu.',
      })
      setAutomationEditorOpen(false)
      setEditingAutomationId('')
      setAutomationDraft({ ...DEFAULT_AUTOMATION_FORM })
      await loadNotificationData()
    } catch (error) {
      setFeedback({ type: 'danger', message: error.message })
    } finally {
      setAutomationBusy('')
    }
  }

  const toggleAutomation = async (automation) => {
    const id = getAutomationId(automation)
    const nextActive = !isAutomationActive(automation)
    setAutomationBusy(id)
    setFeedback(null)

    try {
      await authorizedRequest('/api/notification-automations', {
        method: 'PATCH',
        body: JSON.stringify({
          id,
          ...automationPayload(automationToDraft(automation), nextActive),
        }),
      })
      setFeedback({
        type: 'success',
        message: nextActive ? 'Otomasyon etkinleştirildi.' : 'Otomasyon duraklatıldı.',
      })
      await loadNotificationData()
    } catch (error) {
      setFeedback({ type: 'danger', message: error.message })
    } finally {
      setAutomationBusy('')
    }
  }

  const prepareDeleteAutomation = (automation) => {
    setConfirmation({
      type: 'delete',
      title: 'Otomasyon silinsin mi?',
      description: 'Bu işlem geri alınamaz.',
      automation,
    })
  }

  const deleteAutomation = async () => {
    const automation = confirmation?.automation
    const id = getAutomationId(automation)
    if (!id) return

    setAutomationBusy(id)

    try {
      await authorizedRequest('/api/notification-automations', {
        method: 'DELETE',
        body: JSON.stringify({ id }),
      })
      setConfirmation(null)
      setFeedback({ type: 'success', message: 'Otomasyon silindi.' })
      await loadNotificationData()
    } catch (error) {
      setFeedback({ type: 'danger', message: error.message })
    } finally {
      setAutomationBusy('')
    }
  }

  const toggleWeekday = (day) => {
    setAutomationDraft((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((value) => value !== day)
        : [...current.daysOfWeek, day],
    }))
  }

  const tabItems = [
    { id: 'send', label: 'Şimdi Gönder' },
    { id: 'automations', label: 'Otomasyonlar', count: automations.length },
    {
      id: 'history',
      label: 'Gönderim Geçmişi',
      count: runs.length + deliveryLogs.length,
    },
  ]

  return (
    <section className="notificationCenter" aria-labelledby="notificationCenterTitle">
      <header className="ncHeader">
        <div>
          <span className="ncEyebrow">İletişim merkezi</span>
          <h2 id="notificationCenterTitle">Bildirim Yönetimi</h2>
          <p>
            Anlık mesajları ve planlı bildirimleri tek ekrandan yönetin.
          </p>
        </div>
        <div className="ncHeaderStats" aria-label="Bildirim özeti">
          <div>
            <strong>{subscriptionCount}</strong>
            <span>Kayıtlı cihaz</span>
          </div>
          <div>
            <strong>{automations.filter(isAutomationActive).length}</strong>
            <span>Aktif otomasyon</span>
          </div>
          <button
            type="button"
            className="ncIconButton"
            onClick={() => loadNotificationData({ quiet: true })}
            disabled={refreshing || loading}
            aria-label="Bildirim verilerini yenile"
            title="Yenile"
          >
            <span aria-hidden="true" className={refreshing ? 'isSpinning' : ''}>
              ↻
            </span>
          </button>
        </div>
      </header>

      <Feedback feedback={feedback} onDismiss={() => setFeedback(null)} />

      <div className="ncTabs" role="tablist" aria-label="Bildirim yönetimi bölümleri">
        {tabItems.map((tab) => (
          <button
            key={tab.id}
            id={`nc-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`nc-panel-${tab.id}`}
            className={activeTab === tab.id ? 'isActive' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {Number.isFinite(tab.count) && <span>{tab.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'send' && (
        <div
          id="nc-panel-send"
          role="tabpanel"
          aria-labelledby="nc-tab-send"
          className="ncPanel ncSendLayout"
        >
          <form className="ncCard ncComposer" onSubmit={prepareSend}>
            <div className="ncCardHeading">
              <div>
                <span className="ncStep">1</span>
                <div>
                  <h3>Alıcıları belirleyin</h3>
                  <p>Toplu gönderin veya tek kullanıcı seçin.</p>
                </div>
              </div>
            </div>

            <fieldset className="ncFieldset">
              <legend className="ncSrOnly">Alıcı türü</legend>
              <div className="ncSegmentedControl">
                <label>
                  <input
                    type="radio"
                    name="sendAudience"
                    value="all"
                    checked={sendForm.audienceType === 'all'}
                    onChange={() =>
                      updateSendForm({
                        audienceType: 'all',
                        targetUserId: '',
                        deliveryScope: 'all_devices',
                      })
                    }
                  />
                  <span>
                    <strong>Toplu bildirim</strong>
                    <small>Tüm aktif kullanıcılar</small>
                  </span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="sendAudience"
                    value="user"
                    checked={sendForm.audienceType === 'user'}
                    onChange={() =>
                      updateSendForm({
                        audienceType: 'user',
                        deliveryScope: 'latest_device',
                      })
                    }
                  />
                  <span>
                    <strong>Kişiye özel</strong>
                    <small>Seçilen kullanıcı</small>
                  </span>
                </label>
              </div>
            </fieldset>

            {sendForm.audienceType === 'user' && (
              <div className="ncTwoColumnFields">
                <label className="ncField">
                  <span>Kullanıcı</span>
                  <select
                    value={sendForm.targetUserId}
                    onChange={(event) =>
                      updateSendForm({ targetUserId: event.target.value })
                    }
                    required
                  >
                    <option value="">Kullanıcı seçin</option>
                    {activeUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {userLabel(user)}
                        {user.email && user.email !== userLabel(user)
                          ? ` · ${user.email}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ncField">
                  <span>Cihaz kapsamı</span>
                  <select
                    value={sendForm.deliveryScope}
                    onChange={(event) =>
                      updateSendForm({ deliveryScope: event.target.value })
                    }
                  >
                    <option value="latest_device">Yalnızca son cihaz</option>
                    <option value="all_devices">Kullanıcının tüm cihazları</option>
                  </select>
                </label>
              </div>
            )}

            <div className="ncDivider" />

            <div className="ncCardHeading">
              <div>
                <span className="ncStep">2</span>
                <div>
                  <h3>Mesajı hazırlayın</h3>
                  <p>Uygulama dili Türkçe ise TR, İngilizce ise EN mesaj gider.</p>
                </div>
              </div>
              <span className="ncLocaleBadge">TR + EN</span>
            </div>

            <div className="ncLanguageGrid">
              <fieldset className="ncLanguageFieldset">
                <legend><span>TR</span> Türkçe</legend>
                <label className="ncField">
                  <span>Başlık</span>
                  <input
                    type="text"
                    value={sendForm.titleTr}
                    maxLength={MAX_TITLE_LENGTH}
                    onChange={(event) =>
                      updateSendForm({ titleTr: event.target.value })
                    }
                    required
                  />
                  <CharacterCount value={sendForm.titleTr} max={MAX_TITLE_LENGTH} />
                </label>
                <label className="ncField">
                  <span>Mesaj</span>
                  <textarea
                    value={sendForm.bodyTr}
                    maxLength={MAX_BODY_LENGTH}
                    rows={4}
                    onChange={(event) =>
                      updateSendForm({ bodyTr: event.target.value })
                    }
                    placeholder="Türkçe bildirimi yazın"
                    required
                  />
                  <CharacterCount value={sendForm.bodyTr} max={MAX_BODY_LENGTH} />
                </label>
              </fieldset>

              <fieldset className="ncLanguageFieldset">
                <legend><span>EN</span> English</legend>
                <label className="ncField">
                  <span>Title</span>
                  <input
                    type="text"
                    value={sendForm.titleEn}
                    maxLength={MAX_TITLE_LENGTH}
                    onChange={(event) =>
                      updateSendForm({ titleEn: event.target.value })
                    }
                    required
                  />
                  <CharacterCount value={sendForm.titleEn} max={MAX_TITLE_LENGTH} />
                </label>
                <label className="ncField">
                  <span>Message</span>
                  <textarea
                    value={sendForm.bodyEn}
                    maxLength={MAX_BODY_LENGTH}
                    rows={4}
                    onChange={(event) =>
                      updateSendForm({ bodyEn: event.target.value })
                    }
                    placeholder="Write the English notification"
                    required
                  />
                  <CharacterCount value={sendForm.bodyEn} max={MAX_BODY_LENGTH} />
                </label>
              </fieldset>
            </div>

            <div className="ncFormFooter">
              <div className="ncRecipientSummary" aria-live="polite">
                <strong>Alıcı özeti</strong>
                <span>
                  {sendForm.audienceType === 'all'
                    ? `${subscriptionCount} kayıtlı cihaz · tüm aktif kullanıcılar`
                    : selectedSendUser
                      ? `${userLabel(selectedSendUser)} · ${
                          sendForm.deliveryScope === 'latest_device'
                            ? 'son cihaz'
                            : 'tüm cihazlar'
                        }`
                      : 'Henüz kullanıcı seçilmedi'}
                </span>
              </div>
              <button type="submit" className="ncPrimaryButton" disabled={sendBusy}>
                Gönderimi Kontrol Et
              </button>
            </div>
          </form>

          <aside className="ncCard ncPreviewPanel" aria-label="Bildirim önizlemesi">
            <div className="ncCardHeading">
              <div>
                <div>
                  <h3>Önizleme</h3>
                  <p>Alıcının uygulama diline göre görünen mesaj.</p>
                </div>
              </div>
            </div>
            <NotificationPreview
              language="TR"
              title={sendForm.titleTr}
              body={sendForm.bodyTr}
            />
            <NotificationPreview
              language="EN"
              title={sendForm.titleEn}
              body={sendForm.bodyEn}
            />
            <div className="ncInfoNote">
              <strong>Dil seçimi otomatik</strong>
              <p>
                Bildirim iki dilde hazırlanır; sunucu her cihazın son kaydedilen dilini
                kullanır.
              </p>
            </div>
          </aside>
        </div>
      )}

      {activeTab === 'automations' && (
        <div
          id="nc-panel-automations"
          role="tabpanel"
          aria-labelledby="nc-tab-automations"
          className="ncPanel"
        >
          <div className="ncSectionToolbar">
            <div>
              <h3>Planlı bildirimler</h3>
              <p>Tüm saatler Kahire saatine göre çalışır.</p>
            </div>
            <button type="button" className="ncPrimaryButton" onClick={openNewAutomation}>
              Yeni Otomasyon
            </button>
          </div>

          {automationEditorOpen && (
            <form className="ncCard ncAutomationEditor" onSubmit={saveAutomation}>
              <div className="ncCardHeading">
                <div>
                  <span className="ncStep">{editingAutomationId ? 'D' : '+'}</span>
                  <div>
                    <h3>{editingAutomationId ? 'Otomasyonu düzenle' : 'Yeni otomasyon'}</h3>
                    <p>Kaydetmek bildirim göndermez; yalnızca planı oluşturur.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="ncTextButton"
                  onClick={closeAutomationEditor}
                  disabled={Boolean(automationBusy)}
                >
                  Kapat
                </button>
              </div>

              <div className="ncThreeColumnFields">
                <label className="ncField isWide">
                  <span>Otomasyon adı</span>
                  <input
                    type="text"
                    value={automationDraft.name}
                    maxLength={80}
                    onChange={(event) =>
                      updateAutomationDraft({ name: event.target.value })
                    }
                    required
                  />
                </label>
                <label className="ncField">
                  <span>İçerik</span>
                  <select
                    value={automationDraft.contentType}
                    onChange={(event) => {
                      const contentType = event.target.value
                      updateAutomationDraft({
                        contentType,
                        name:
                          contentType === 'daily_motivation' && !editingAutomationId
                            ? 'Günlük Motivasyon'
                            : automationDraft.name,
                      })
                    }}
                  >
                    <option value="daily_motivation">90 mesajdan günlük motivasyon</option>
                    <option value="custom">Özel iki dilli mesaj</option>
                  </select>
                </label>
                <label className="ncField">
                  <span>Saat</span>
                  <div className="ncTimeInput">
                    <input
                      type="time"
                      value={automationDraft.sendTime}
                      onChange={(event) =>
                        updateAutomationDraft({ sendTime: event.target.value })
                      }
                      required
                    />
                    <em>Kahire</em>
                  </div>
                </label>
              </div>

              <fieldset className="ncFieldset ncDaysFieldset">
                <legend>Gönderim günleri</legend>
                <div className="ncQuickDays">
                  <button
                    type="button"
                    onClick={() =>
                      updateAutomationDraft({ daysOfWeek: [0, 1, 2, 3, 4, 5, 6] })
                    }
                  >
                    Her gün
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateAutomationDraft({ daysOfWeek: [1, 2, 3, 4, 5] })
                    }
                  >
                    Hafta içi
                  </button>
                </div>
                <div className="ncWeekdayPicker">
                  {WEEKDAYS.map((day) => (
                    <label key={day.value} title={day.long}>
                      <input
                        type="checkbox"
                        checked={automationDraft.daysOfWeek.includes(day.value)}
                        onChange={() => toggleWeekday(day.value)}
                      />
                      <span>{day.short}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="ncTwoColumnFields ncAudienceFields">
                <fieldset className="ncFieldset">
                  <legend>Alıcı</legend>
                  <div className="ncSegmentedControl isCompact">
                    <label>
                      <input
                        type="radio"
                        name="automationAudience"
                        checked={automationDraft.audienceType === 'all'}
                        onChange={() =>
                          updateAutomationDraft({
                            audienceType: 'all',
                            targetUserId: '',
                            deliveryScope: 'all_devices',
                          })
                        }
                      />
                      <span><strong>Herkes</strong></span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="automationAudience"
                        checked={automationDraft.audienceType === 'user'}
                        onChange={() =>
                          updateAutomationDraft({
                            audienceType: 'user',
                            deliveryScope: 'latest_device',
                          })
                        }
                      />
                      <span><strong>Bir kullanıcı</strong></span>
                    </label>
                  </div>
                </fieldset>
                {automationDraft.audienceType === 'user' && (
                  <div className="ncTwoColumnFields isNested">
                    <label className="ncField">
                      <span>Kullanıcı</span>
                      <select
                        value={automationDraft.targetUserId}
                        onChange={(event) =>
                          updateAutomationDraft({ targetUserId: event.target.value })
                        }
                        required
                      >
                        <option value="">Kullanıcı seçin</option>
                        {activeUsers.map((user) => (
                          <option key={user.id} value={user.id}>{userLabel(user)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="ncField">
                      <span>Cihaz kapsamı</span>
                      <select
                        value={automationDraft.deliveryScope}
                        onChange={(event) =>
                          updateAutomationDraft({ deliveryScope: event.target.value })
                        }
                      >
                        <option value="latest_device">Son cihaz</option>
                        <option value="all_devices">Tüm cihazlar</option>
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {automationDraft.contentType === 'custom' && (
                <div className="ncLanguageGrid ncCustomMessageGrid">
                  <fieldset className="ncLanguageFieldset">
                    <legend><span>TR</span> Türkçe mesaj</legend>
                    <label className="ncField">
                      <span>Başlık</span>
                      <input
                        type="text"
                        maxLength={MAX_TITLE_LENGTH}
                        value={automationDraft.titleTr}
                        onChange={(event) =>
                          updateAutomationDraft({ titleTr: event.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="ncField">
                      <span>Mesaj</span>
                      <textarea
                        rows={3}
                        maxLength={MAX_BODY_LENGTH}
                        value={automationDraft.bodyTr}
                        onChange={(event) =>
                          updateAutomationDraft({ bodyTr: event.target.value })
                        }
                        required
                      />
                    </label>
                  </fieldset>
                  <fieldset className="ncLanguageFieldset">
                    <legend><span>EN</span> English message</legend>
                    <label className="ncField">
                      <span>Title</span>
                      <input
                        type="text"
                        maxLength={MAX_TITLE_LENGTH}
                        value={automationDraft.titleEn}
                        onChange={(event) =>
                          updateAutomationDraft({ titleEn: event.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="ncField">
                      <span>Message</span>
                      <textarea
                        rows={3}
                        maxLength={MAX_BODY_LENGTH}
                        value={automationDraft.bodyEn}
                        onChange={(event) =>
                          updateAutomationDraft({ bodyEn: event.target.value })
                        }
                        required
                      />
                    </label>
                  </fieldset>
                </div>
              )}

              <div className="ncFormFooter">
                <label className="ncSwitch">
                  <input
                    type="checkbox"
                    checked={automationDraft.isActive}
                    onChange={(event) =>
                      updateAutomationDraft({ isActive: event.target.checked })
                    }
                  />
                  <span aria-hidden="true" />
                  Kaydedildiğinde aktif olsun
                </label>
                <div className="ncButtonGroup">
                  <button type="button" className="ncSecondaryButton" onClick={closeAutomationEditor}>
                    Vazgeç
                  </button>
                  <button
                    type="submit"
                    className="ncPrimaryButton"
                    disabled={Boolean(automationBusy)}
                    aria-busy={Boolean(automationBusy)}
                  >
                    {automationBusy ? 'Kaydediliyor…' : 'Otomasyonu Kaydet'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {loading ? (
            <div className="ncLoadingState" role="status">
              <span className="ncLoader" aria-hidden="true" />
              Otomasyonlar yükleniyor…
            </div>
          ) : automations.length === 0 ? (
            <div className="ncEmptyState">
              <strong>Henüz otomasyon yok</strong>
              <p>İlk planlı bildiriminizi oluşturun.</p>
              <button type="button" className="ncSecondaryButton" onClick={openNewAutomation}>
                Otomasyon Oluştur
              </button>
            </div>
          ) : (
            <div className="ncAutomationList">
              {automations.map((automation) => {
                const id = getAutomationId(automation)
                const active = isAutomationActive(automation)
                const contentType = automation.content_type || automation.contentType
                const audienceType = automation.audience_type || automation.audienceType
                const targetUser = usersById.get(
                  automation.target_user_id || automation.targetUserId,
                )
                const sendTime = String(
                  automation.send_time || automation.sendTime || '',
                ).slice(0, 5)
                const days = automation.days_of_week || automation.daysOfWeek
                const lastRun = runs.find(
                  (run) => run.automation_id === id,
                )

                return (
                  <article key={id} className={classNames('ncAutomationCard', !active && 'isPaused')}>
                    <div className="ncAutomationStatusRail" aria-hidden="true" />
                    <div className="ncAutomationMain">
                      <div className="ncAutomationTitleRow">
                        <div>
                          <span className={classNames('ncStatusBadge', active ? 'isActive' : 'isPaused')}>
                            {active ? 'Aktif' : 'Duraklatıldı'}
                          </span>
                          <h4>{automation.name || 'İsimsiz otomasyon'}</h4>
                        </div>
                        <span className="ncContentBadge">
                          {contentType === 'daily_motivation'
                            ? 'Günlük motivasyon'
                            : 'Özel mesaj'}
                        </span>
                      </div>
                      <dl className="ncAutomationMeta">
                        <div>
                          <dt>Program</dt>
                          <dd>{formatDays(days)} · {sendTime} Kahire</dd>
                        </div>
                        <div>
                          <dt>Alıcı</dt>
                          <dd>
                            {audienceType === 'user'
                              ? userLabel(targetUser)
                              : `Tüm aktif kullanıcılar (${subscriptionCount} cihaz)`}
                          </dd>
                        </div>
                        <div>
                          <dt>Son çalışma</dt>
                          <dd>
                            {formatCairoDate(
                              automation.last_run_at ||
                                lastRun?.completed_at ||
                                lastRun?.started_at ||
                                lastRun?.scheduled_for,
                            )}
                          </dd>
                        </div>
                      </dl>
                      {contentType === 'custom' && (
                        <p className="ncAutomationMessage">
                          <span>TR</span> {automation.body_tr || '—'}
                          <span>EN</span> {automation.body_en || '—'}
                        </p>
                      )}
                    </div>
                    <div className="ncAutomationActions">
                      <button type="button" className="ncTextButton" onClick={() => editAutomation(automation)}>
                        Düzenle
                      </button>
                      <button
                        type="button"
                        className="ncSecondaryButton"
                        onClick={() => toggleAutomation(automation)}
                        disabled={automationBusy === id}
                      >
                        {active ? 'Duraklat' : 'Etkinleştir'}
                      </button>
                      <button
                        type="button"
                        className="ncDangerButton"
                        onClick={() => prepareDeleteAutomation(automation)}
                        disabled={automationBusy === id}
                      >
                        Sil
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div
          id="nc-panel-history"
          role="tabpanel"
          aria-labelledby="nc-tab-history"
          className="ncPanel"
        >
          <div className="ncSectionToolbar">
            <div>
              <h3>Son gönderimler</h3>
              <p>Tarih ve saatler Kahire saatine göre gösterilir.</p>
            </div>
          </div>

          {loading ? (
            <div className="ncLoadingState" role="status">
              <span className="ncLoader" aria-hidden="true" />
              Gönderim geçmişi yükleniyor…
            </div>
          ) : runs.length === 0 && deliveryLogs.length === 0 ? (
            <div className="ncEmptyState">
              <strong>Henüz gönderim kaydı yok</strong>
              <p>İlk bildirimden sonra sonuçlar burada görünecek.</p>
            </div>
          ) : (
            <div className="ncHistoryGrid">
              <section className="ncCard ncHistorySection" aria-labelledby="ncRunsTitle">
                <div className="ncHistoryHeading">
                  <h4 id="ncRunsTitle">Otomasyon çalışmaları</h4>
                  <span>{runs.length}</span>
                </div>
                <div className="ncHistoryList">
                  {runs.map((run, index) => {
                    const status = getRunStatus(run)
                    const automation = automations.find(
                      (item) => getAutomationId(item) === run.automation_id,
                    )
                    const summary = run.delivery_summary || run.summary || {}
                    return (
                      <article key={run.id || `${run.automation_id}-${index}`} className="ncHistoryItem">
                        <span className={classNames('ncRunDot', `is-${status.tone}`)} aria-hidden="true" />
                        <div>
                          <strong>{run.automation_name || automation?.name || 'Otomasyon'}</strong>
                          <span>{formatCairoDate(run.scheduled_for || run.started_at || run.created_at)}</span>
                        </div>
                        <div className="ncHistoryResult">
                          <span className={classNames('ncStatusBadge', `is-${status.tone}`)}>{status.label}</span>
                          {(
                            summary.sent !== undefined ||
                            run.sent !== undefined ||
                            run.sent_count !== undefined
                          ) && (
                            <small>
                              {Number(summary.sent ?? run.sent ?? run.sent_count ?? 0)} başarılı ·{' '}
                              {Number(summary.failed ?? run.failed ?? run.failed_count ?? 0)} başarısız
                            </small>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>

              <section className="ncCard ncHistorySection" aria-labelledby="ncDeliveriesTitle">
                <div className="ncHistoryHeading">
                  <h4 id="ncDeliveriesTitle">Teslim kayıtları</h4>
                  <span>{deliveryLogs.length}</span>
                </div>
                <div className="ncHistoryList">
                  {deliveryLogs.map((log, index) => (
                    <article key={log.id || `delivery-${index}`} className="ncHistoryItem">
                      <span
                        className={classNames(
                          'ncRunDot',
                          Number(log.failed_count ?? log.failed ?? 0) > 0
                            ? 'is-warning'
                            : 'is-success',
                        )}
                        aria-hidden="true"
                      />
                      <div>
                        <strong>{log.title_tr || log.title_en || log.title || 'Bildirim'}</strong>
                        <span>{formatCairoDate(log.created_at)}</span>
                      </div>
                      <div className="ncHistoryResult">
                        <span>{log.target_user_name || (log.target_user_id ? 'Kişiye özel' : 'Toplu')}</span>
                        <small>
                          {Number(log.sent_count ?? log.sent ?? 0)} başarılı ·{' '}
                          {Number(log.failed_count ?? log.failed ?? 0)} başarısız
                        </small>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      )}

      {confirmation && (
        <div className="ncModalBackdrop" role="presentation">
          <section
            className="ncConfirmDialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ncConfirmTitle"
            aria-describedby="ncConfirmDescription"
          >
            <div className="ncConfirmIcon" aria-hidden="true">!</div>
            <h3 id="ncConfirmTitle">{confirmation.title}</h3>
            <p id="ncConfirmDescription">{confirmation.description}</p>
            {confirmation.recipientText && (
              <div className="ncConfirmRecipient">
                <span>Alıcı</span>
                <strong>{confirmation.recipientText}</strong>
              </div>
            )}
            {confirmation.type === 'send' && (
              <div className="ncConfirmPreviews">
                <NotificationPreview language="TR" title={sendForm.titleTr} body={sendForm.bodyTr} />
                <NotificationPreview language="EN" title={sendForm.titleEn} body={sendForm.bodyEn} />
              </div>
            )}
            {confirmation.type === 'delete' && (
              <div className="ncConfirmRecipient">
                <span>Otomasyon</span>
                <strong>{confirmation.automation?.name || 'İsimsiz otomasyon'}</strong>
              </div>
            )}
            <div className="ncConfirmActions">
              <button
                type="button"
                className="ncSecondaryButton"
                onClick={() => setConfirmation(null)}
                disabled={sendBusy || Boolean(automationBusy)}
              >
                Vazgeç
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className={confirmation.type === 'delete' ? 'ncDangerButton isSolid' : 'ncPrimaryButton'}
                onClick={confirmation.type === 'send' ? sendNotification : deleteAutomation}
                disabled={sendBusy || Boolean(automationBusy)}
                aria-busy={sendBusy || Boolean(automationBusy)}
              >
                {sendBusy || automationBusy
                  ? 'İşleniyor…'
                  : confirmation.type === 'send'
                    ? 'Evet, Şimdi Gönder'
                    : 'Evet, Sil'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

export default NotificationCenter
