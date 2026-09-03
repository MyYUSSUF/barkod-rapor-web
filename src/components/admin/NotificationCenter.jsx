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
  targetUserIds: [],
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
  targetUserIds: [],
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

function normalizeUserIds(value, legacyValue = '') {
  const values = normalizeList(value)
  const source = values.length > 0 ? values : legacyValue ? [legacyValue] : []
  return [...new Set(source.map((item) => String(item || '').trim()).filter(Boolean))]
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
    targetUserIds: normalizeUserIds(
      automation?.target_user_ids || automation?.targetUserIds,
      automation?.target_user_id || automation?.targetUserId,
    ),
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

function UserMultiSelect({
  idPrefix,
  users,
  selectedIds,
  onChange,
}) {
  const [query, setQuery] = useState('')
  const validUserIdSet = new Set(users.map((user) => String(user.id)))
  const normalizedSelectedIds = normalizeUserIds(selectedIds).filter((id) =>
    validUserIdSet.has(id),
  )
  const selectedIdSet = new Set(normalizedSelectedIds)
  const normalizedQuery = query.trim().toLocaleLowerCase('tr-TR')
  const visibleUsers = useMemo(
    () => users.filter((user) => {
      if (!normalizedQuery) return true
      return [user?.full_name, user?.username, user?.email]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase('tr-TR').includes(normalizedQuery),
        )
    }),
    [normalizedQuery, users],
  )
  const selectedUsers = users.filter((user) => selectedIdSet.has(String(user.id)))
  const visibleIds = visibleUsers.map((user) => String(user.id))

  const toggleUser = (userId) => {
    const normalizedId = String(userId)
    onChange(
      selectedIdSet.has(normalizedId)
        ? normalizedSelectedIds.filter((id) => id !== normalizedId)
        : [...normalizedSelectedIds, normalizedId],
    )
  }

  const selectVisible = () => {
    onChange([...new Set([...normalizedSelectedIds, ...visibleIds])])
  }

  return (
    <section className="ncUserPicker" aria-labelledby={`${idPrefix}-title`}>
      <div className="ncUserPickerHeader">
        <div>
          <strong id={`${idPrefix}-title`}>Kullanıcı seçimi</strong>
          <span aria-live="polite">{normalizedSelectedIds.length} kişi seçili</span>
        </div>
        <div className="ncPickerActions">
          <button
            type="button"
            className="ncTextButton"
            onClick={selectVisible}
            disabled={visibleIds.length === 0}
          >
            Görünenleri seç
          </button>
          <button
            type="button"
            className="ncTextButton"
            onClick={() => onChange([])}
            disabled={normalizedSelectedIds.length === 0}
          >
            Seçimi temizle
          </button>
        </div>
      </div>

      <label className="ncUserSearch" htmlFor={`${idPrefix}-search`}>
        <span className="ncSrOnly">Kullanıcı ara</span>
        <input
          id={`${idPrefix}-search`}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ad, kullanıcı adı veya e-posta ara"
          autoComplete="off"
        />
        <small>{visibleUsers.length} kullanıcı gösteriliyor</small>
      </label>

      {selectedUsers.length > 0 && (
        <div className="ncSelectedUsers" aria-label="Seçili kullanıcılar">
          {selectedUsers.slice(0, 8).map((user) => (
            <span className="ncUserChip" key={user.id}>
              {userLabel(user)}
              <button
                type="button"
                onClick={() => toggleUser(user.id)}
                aria-label={`${userLabel(user)} seçimini kaldır`}
              >
                ×
              </button>
            </span>
          ))}
          {selectedUsers.length > 8 && (
            <span className="ncMoreUsers">+{selectedUsers.length - 8} kişi daha</span>
          )}
        </div>
      )}

      <div className="ncUserList" role="group" aria-label="Aktif kullanıcılar">
        {visibleUsers.map((user) => {
          const userId = String(user.id)
          const checked = selectedIdSet.has(userId)
          return (
            <label key={userId} className={checked ? 'isSelected' : ''}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleUser(userId)}
              />
              <span className="ncUserCheck" aria-hidden="true">✓</span>
              <span className="ncUserIdentity">
                <strong>{userLabel(user)}</strong>
                <small>{user.email || user.username || 'E-posta bilgisi yok'}</small>
              </span>
              <span className="ncUserDeviceCount">
                {Number(user.approved_device_count || 0)} cihaz
              </span>
            </label>
          )
        })}
        {visibleUsers.length === 0 && (
          <div className="ncPickerEmpty">Aramanızla eşleşen kullanıcı yok.</div>
        )}
      </div>
    </section>
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

  const selectedSendUsers = normalizeUserIds(sendForm.targetUserIds)
    .map((id) => usersById.get(id))
    .filter(Boolean)
  const selectedAutomationUsers = normalizeUserIds(automationDraft.targetUserIds)
    .map((id) => usersById.get(id))
    .filter(Boolean)

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

    if (sendForm.audienceType === 'user' && selectedSendUsers.length === 0) {
      setFeedback({ type: 'danger', message: 'En az bir kullanıcı seçmelisiniz.' })
      return
    }

    const recipientText =
      sendForm.audienceType === 'all'
        ? `Tüm aktif kullanıcılar · ${subscriptionCount} kayıtlı bildirim cihazı`
        : `${selectedSendUsers.length} kullanıcı · ${
            sendForm.deliveryScope === 'latest_device'
              ? 'her kişinin son bildirim cihazı'
              : 'seçilen kişilerin tüm bildirim cihazları'
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
      audienceType: sendForm.audienceType,
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
      targetUserIds:
        sendForm.audienceType === 'user'
          ? selectedSendUsers.map((user) => String(user.id))
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
    targetUserIds:
      draft.audienceType === 'user'
        ? normalizeUserIds(draft.targetUserIds)
        : undefined,
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
    if (
      automationDraft.audienceType === 'user' &&
      selectedAutomationUsers.length === 0
    ) {
      setFeedback({ type: 'danger', message: 'En az bir kullanıcı seçmelisiniz.' })
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
        <div className="ncHeaderIntro">
          <h2 id="notificationCenterTitle" className="ncSrOnly">Bildirim Yönetimi</h2>
          <strong>Mesajlar ve zamanlamalar</strong>
          <p>
            Anlık gönderim, otomasyon ve sonuçlar tek yerde.
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
          className="ncPanel ncSendPanel"
        >
          <form className="ncComposer" onSubmit={prepareSend}>
            <section className="ncCard ncStepCard" aria-labelledby="ncRecipientsTitle">
              <div className="ncCardHeading">
                <div>
                  <span className="ncStep">1</span>
                  <div>
                    <h3 id="ncRecipientsTitle">Kimlere gönderilecek?</h3>
                    <p>Herkese gönderin veya birden fazla kullanıcı seçin.</p>
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
                          deliveryScope: 'all_devices',
                        })
                      }
                    />
                    <span>
                      <strong>Tüm aktif kullanıcılar</strong>
                      <small>{activeUsers.length} kullanıcı · {subscriptionCount} cihaz</small>
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
                      <strong>Belirli kullanıcılar</strong>
                      <small>Bir veya birden fazla kişi seçin</small>
                    </span>
                  </label>
                </div>
              </fieldset>

              {sendForm.audienceType === 'user' && (
                <>
                  <UserMultiSelect
                    idPrefix="send-users"
                    users={activeUsers}
                    selectedIds={sendForm.targetUserIds}
                    onChange={(targetUserIds) => updateSendForm({ targetUserIds })}
                  />

                  <fieldset className="ncFieldset ncDeliveryFieldset">
                    <legend>Cihaz kapsamı</legend>
                    <div className="ncSegmentedControl isCompact">
                      <label>
                        <input
                          type="radio"
                          name="sendDeliveryScope"
                          checked={sendForm.deliveryScope === 'latest_device'}
                          onChange={() => updateSendForm({ deliveryScope: 'latest_device' })}
                        />
                        <span>
                          <strong>Her kişinin son cihazı</strong>
                          <small>Tekrarlanan bildirimi azaltır</small>
                        </span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="sendDeliveryScope"
                          checked={sendForm.deliveryScope === 'all_devices'}
                          onChange={() => updateSendForm({ deliveryScope: 'all_devices' })}
                        />
                        <span>
                          <strong>Tüm kayıtlı cihazları</strong>
                          <small>Seçilen kişilerin her cihazı</small>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                </>
              )}
            </section>

            <section className="ncCard ncStepCard" aria-labelledby="ncMessageTitle">
              <div className="ncCardHeading">
                <div>
                  <span className="ncStep">2</span>
                  <div>
                    <h3 id="ncMessageTitle">Mesajı hazırlayın</h3>
                    <p>Her cihaz, uygulamada seçili olan dile uygun mesajı alır.</p>
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
                      onChange={(event) => updateSendForm({ titleTr: event.target.value })}
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
                      onChange={(event) => updateSendForm({ bodyTr: event.target.value })}
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
                      onChange={(event) => updateSendForm({ titleEn: event.target.value })}
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
                      onChange={(event) => updateSendForm({ bodyEn: event.target.value })}
                      placeholder="Write the English notification"
                      required
                    />
                    <CharacterCount value={sendForm.bodyEn} max={MAX_BODY_LENGTH} />
                  </label>
                </fieldset>
              </div>
            </section>

            <section className="ncCard ncStepCard ncReviewStep" aria-labelledby="ncReviewTitle">
              <div className="ncCardHeading">
                <div>
                  <span className="ncStep">3</span>
                  <div>
                    <h3 id="ncReviewTitle">Kontrol edin ve gönderin</h3>
                    <p>Göndermeden önce alıcıları ve iki dildeki mesajı doğrulayın.</p>
                  </div>
                </div>
              </div>

              <div className="ncReviewGrid">
                <div className="ncRecipientSummary" aria-live="polite">
                  <span>ALICILAR</span>
                  <strong>
                    {sendForm.audienceType === 'all'
                      ? 'Tüm aktif kullanıcılar'
                      : selectedSendUsers.length > 0
                        ? `${selectedSendUsers.length} kullanıcı seçildi`
                        : 'Henüz kullanıcı seçilmedi'}
                  </strong>
                  <small>
                    {sendForm.audienceType === 'all'
                      ? `${subscriptionCount} kayıtlı bildirim cihazı`
                      : sendForm.deliveryScope === 'latest_device'
                        ? 'Her kullanıcının son cihazı'
                        : 'Seçilen kullanıcıların tüm cihazları'}
                  </small>
                  {sendForm.audienceType === 'user' && selectedSendUsers.length > 0 && (
                    <p>
                      {selectedSendUsers.slice(0, 4).map(userLabel).join(', ')}
                      {selectedSendUsers.length > 4
                        ? ` ve ${selectedSendUsers.length - 4} kişi daha`
                        : ''}
                    </p>
                  )}
                </div>

                <div className="ncReviewPreviews" aria-label="Bildirim önizlemeleri">
                  <NotificationPreview language="TR" title={sendForm.titleTr} body={sendForm.bodyTr} />
                  <NotificationPreview language="EN" title={sendForm.titleEn} body={sendForm.bodyEn} />
                </div>
              </div>

              <div className="ncFormFooter">
                <div className="ncInfoNote">
                  <strong>Dil otomatik seçilir</strong>
                  <p>Cihazın uygulama dili Türkçe ise TR, diğer durumda EN mesaj gönderilir.</p>
                </div>
                <button type="submit" className="ncPrimaryButton ncSendButton" disabled={sendBusy}>
                  {sendBusy ? 'Hazırlanıyor…' : 'Gönderimi Gözden Geçir'}
                </button>
              </div>
            </section>
          </form>
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
                      <span><strong>Belirli kullanıcılar</strong></span>
                    </label>
                  </div>
                </fieldset>
              </div>

              {automationDraft.audienceType === 'user' && (
                <div className="ncAutomationAudiencePicker">
                  <UserMultiSelect
                    idPrefix="automation-users"
                    users={activeUsers}
                    selectedIds={automationDraft.targetUserIds}
                    onChange={(targetUserIds) =>
                      updateAutomationDraft({ targetUserIds })
                    }
                  />
                  <label className="ncField ncAutomationDeviceScope">
                    <span>Cihaz kapsamı</span>
                    <select
                      value={automationDraft.deliveryScope}
                      onChange={(event) =>
                        updateAutomationDraft({ deliveryScope: event.target.value })
                      }
                    >
                      <option value="latest_device">Her kullanıcının son cihazı</option>
                      <option value="all_devices">Seçilen kullanıcıların tüm cihazları</option>
                    </select>
                  </label>
                </div>
              )}

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
                const targetUserIds = normalizeUserIds(
                  automation.target_user_ids || automation.targetUserIds,
                  automation.target_user_id || automation.targetUserId,
                )
                const targetUsers = targetUserIds
                  .map((userId) => usersById.get(userId))
                  .filter(Boolean)
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
                              ? targetUsers.length > 0
                                ? `${targetUsers.length} kullanıcı · ${targetUsers
                                    .slice(0, 2)
                                    .map(userLabel)
                                    .join(', ')}${targetUsers.length > 2 ? '…' : ''}`
                                : 'Kullanıcı seçilmedi'
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
                        <span>
                          {log.target_user_name ||
                            (normalizeUserIds(
                              log.target_user_ids || log.targetUserIds,
                              log.target_user_id || log.targetUserId,
                            ).length > 0
                              ? `${normalizeUserIds(
                                  log.target_user_ids || log.targetUserIds,
                                  log.target_user_id || log.targetUserId,
                                ).length} kullanıcı`
                              : 'Toplu')}
                        </span>
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
