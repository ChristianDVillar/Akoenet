import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../services/api'

function fromDatetimeLocalValue(s) {
  if (!s || !String(s).trim()) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function ServerCustomContentSettings({ serverId, canManage, tab }) {
  const { t } = useTranslation()
  const [commands, setCommands] = useState([])
  const [events, setEvents] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [textChannels, setTextChannels] = useState([])
  const [cmdName, setCmdName] = useState('')
  const [cmdResponse, setCmdResponse] = useState('')
  const [evTitle, setEvTitle] = useState('')
  const [evDesc, setEvDesc] = useState('')
  const [evStart, setEvStart] = useState('')
  const [evEnd, setEvEnd] = useState('')
  const [annTitle, setAnnTitle] = useState('')
  const [annBody, setAnnBody] = useState('')
  const [publishChannelId, setPublishChannelId] = useState('')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const loadAll = useCallback(async () => {
    if (!serverId) return
    setLocalError('')
    try {
      const [c, e, a, ch] = await Promise.all([
        api.get(`/servers/${serverId}/custom-commands`),
        api.get(`/servers/${serverId}/events`),
        api.get(`/servers/${serverId}/announcements`),
        api.get(`/channels/server/${serverId}`),
      ])
      setCommands(c.data || [])
      setEvents(e.data || [])
      setAnnouncements(a.data || [])
      setTextChannels((ch.data || []).filter((x) => x.type === 'text'))
    } catch {
      setLocalError(t('serverAutomations.errLoad'))
    }
  }, [serverId, t])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  async function addCommand(e) {
    e.preventDefault()
    if (!canManage) return
    const name = String(cmdName || '')
      .trim()
      .replace(/^!/, '')
      .toLowerCase()
    if (!name || !cmdResponse.trim()) return
    setBusy(true)
    setLocalError('')
    try {
      await api.post(`/servers/${serverId}/custom-commands`, {
        command_name: name,
        response: cmdResponse.trim(),
      })
      setCmdName('')
      setCmdResponse('')
      await loadAll()
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'reserved_command_name') setLocalError(t('serverAutomations.errReservedName'))
      else if (code === 'command_name_taken') setLocalError(t('serverAutomations.errNameTaken'))
      else if (code === 'blocked_content') setLocalError(t('serverAutomations.errBlocked'))
      else setLocalError(t('serverAutomations.errSaveCommand'))
    } finally {
      setBusy(false)
    }
  }

  async function removeCommand(id) {
    if (!canManage || !id) return
    setBusy(true)
    setLocalError('')
    try {
      await api.delete(`/servers/${serverId}/custom-commands/${id}`)
      await loadAll()
    } catch {
      setLocalError(t('serverAutomations.errDeleteCommand'))
    } finally {
      setBusy(false)
    }
  }

  async function addEvent(e) {
    e.preventDefault()
    if (!canManage) return
    const starts = fromDatetimeLocalValue(evStart)
    if (!starts) {
      setLocalError(t('serverAutomations.errEventStart'))
      return
    }
    let ends = fromDatetimeLocalValue(evEnd)
    if (evEnd.trim() && !ends) {
      setLocalError(t('serverAutomations.errEndInvalid'))
      return
    }
    if (ends && new Date(ends) < new Date(starts)) {
      setLocalError(t('serverAutomations.errEndBeforeStart'))
      return
    }
    setBusy(true)
    setLocalError('')
    try {
      await api.post(`/servers/${serverId}/events`, {
        title: evTitle.trim(),
        description: evDesc.trim() || null,
        starts_at: starts,
        ends_at: ends || null,
      })
      setEvTitle('')
      setEvDesc('')
      setEvStart('')
      setEvEnd('')
      await loadAll()
    } catch (err) {
      if (err.response?.data?.error === 'blocked_content') setLocalError(t('serverAutomations.errBlocked'))
      else setLocalError(t('serverAutomations.errSaveEvent'))
    } finally {
      setBusy(false)
    }
  }

  async function removeEvent(id) {
    if (!canManage || !id) return
    setBusy(true)
    setLocalError('')
    try {
      await api.delete(`/servers/${serverId}/events/${id}`)
      await loadAll()
    } catch {
      setLocalError(t('serverAutomations.errDeleteEvent'))
    } finally {
      setBusy(false)
    }
  }

  async function addAnnouncement(e) {
    e.preventDefault()
    if (!canManage) return
    if (!annTitle.trim() || !annBody.trim()) return
    setBusy(true)
    setLocalError('')
    try {
      await api.post(`/servers/${serverId}/announcements`, {
        title: annTitle.trim(),
        body: annBody.trim(),
      })
      setAnnTitle('')
      setAnnBody('')
      await loadAll()
    } catch (err) {
      if (err.response?.data?.error === 'blocked_content') setLocalError(t('serverAutomations.errBlocked'))
      else setLocalError(t('serverAutomations.errSaveAnnouncement'))
    } finally {
      setBusy(false)
    }
  }

  async function removeAnnouncement(id) {
    if (!canManage || !id) return
    setBusy(true)
    setLocalError('')
    try {
      await api.delete(`/servers/${serverId}/announcements/${id}`)
      await loadAll()
    } catch {
      setLocalError(t('serverAutomations.errDeleteAnnouncement'))
    } finally {
      setBusy(false)
    }
  }

  async function publishAnnouncement(announcementId) {
    if (!canManage || !announcementId) return
    const cid = parseInt(publishChannelId, 10)
    if (Number.isNaN(cid) || cid <= 0) {
      setLocalError(t('serverAutomations.errChooseChannel'))
      return
    }
    setBusy(true)
    setLocalError('')
    try {
      await api.post(`/servers/${serverId}/announcements/${announcementId}/publish`, {
        channel_id: cid,
      })
      await loadAll()
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'send_forbidden') setLocalError(t('serverAutomations.errSendForbidden'))
      else setLocalError(t('serverAutomations.errPublish'))
    } finally {
      setBusy(false)
    }
  }

  const sid = String(serverId)
  const sectionClass = 'server-custom-section'

  return (
    <div className="server-custom-content server-custom-content--tab">
      {localError ? <div className="error-banner inline">{localError}</div> : null}

      {tab === 'commands' ? (
      <section
        className={sectionClass}
        aria-labelledby={`srv-settings-cmd-${sid}`}
      >
        <h2 id={`srv-settings-cmd-${sid}`} className="server-settings-panel-title">
          {t('serverAutomations.commandsTitle')}
        </h2>
        <p className="muted small">{t('serverAutomations.commandsLead')}</p>
        {commands.length === 0 ? (
          <p className="muted small">{t('serverAutomations.noCommandsYet')}</p>
        ) : (
          <ul className="server-custom-list">
            {commands.map((c) => (
              <li key={c.id}>
                <code className="inline-code">!{c.command_name}</code>
                {canManage ? (
                  <button
                    type="button"
                    className="btn small ghost"
                    disabled={busy}
                    onClick={() => removeCommand(c.id)}
                  >
                    {t('serverAutomations.remove')}
                  </button>
                ) : null}
                <pre className="server-custom-preview">{c.response}</pre>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form className="form-stack server-custom-form" onSubmit={addCommand}>
            <label htmlFor={`srv-cmd-name-${serverId}`}>{t('serverAutomations.newCommandLabel')}</label>
            <input
              id={`srv-cmd-name-${serverId}`}
              name="command_name"
              value={cmdName}
              onChange={(e) => setCmdName(e.target.value)}
              placeholder={t('serverAutomations.cmdNamePh')}
              autoComplete="off"
            />
            <label htmlFor={`srv-cmd-resp-${serverId}`}>{t('serverAutomations.replyTextLabel')}</label>
            <textarea
              id={`srv-cmd-resp-${serverId}`}
              name="command_response"
              value={cmdResponse}
              onChange={(e) => setCmdResponse(e.target.value)}
              rows={4}
              placeholder={t('serverAutomations.replyTextPh')}
            />
            <button type="submit" className="btn primary small" disabled={busy}>
              {t('serverAutomations.addCommand')}
            </button>
          </form>
        ) : (
          <p className="muted small">{t('serverAutomations.commandsReadOnly')}</p>
        )}
      </section>
      ) : null}

      {tab === 'events' ? (
      <section
        className={sectionClass}
        aria-labelledby={`srv-settings-events-${sid}`}
      >
        <h2 id={`srv-settings-events-${sid}`} className="server-settings-panel-title">
          {t('serverAutomations.eventsTitle')}
        </h2>
        <p className="muted small">{t('serverAutomations.eventsLead')}</p>
        {events.length === 0 ? (
          <p className="muted small">{t('serverAutomations.noEvents')}</p>
        ) : (
          <ul className="server-custom-list">
            {events.map((ev) => (
              <li key={ev.id}>
                <strong>{ev.title}</strong>
                <span className="muted small server-custom-event-time">
                  {new Date(ev.starts_at).toLocaleString()}
                  {ev.ends_at ? ` — ${new Date(ev.ends_at).toLocaleString()}` : ''}
                </span>
                {canManage ? (
                  <button
                    type="button"
                    className="btn small ghost"
                    disabled={busy}
                    onClick={() => removeEvent(ev.id)}
                  >
                    {t('serverAutomations.remove')}
                  </button>
                ) : null}
                {ev.description ? <pre className="server-custom-preview">{ev.description}</pre> : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form className="form-stack server-custom-form" onSubmit={addEvent}>
            <label htmlFor={`srv-ev-title-${serverId}`}>{t('serverAutomations.titleLabel')}</label>
            <input
              id={`srv-ev-title-${serverId}`}
              name="event_title"
              value={evTitle}
              onChange={(e) => setEvTitle(e.target.value)}
            />
            <label htmlFor={`srv-ev-desc-${serverId}`}>{t('serverAutomations.descOptional')}</label>
            <textarea
              id={`srv-ev-desc-${serverId}`}
              name="event_description"
              value={evDesc}
              onChange={(e) => setEvDesc(e.target.value)}
              rows={3}
            />
            <label htmlFor={`srv-ev-start-${serverId}`}>{t('serverAutomations.startsLabel')}</label>
            <input
              id={`srv-ev-start-${serverId}`}
              name="event_starts"
              type="datetime-local"
              value={evStart}
              onChange={(e) => setEvStart(e.target.value)}
            />
            <label htmlFor={`srv-ev-end-${serverId}`}>{t('serverAutomations.endsOptional')}</label>
            <input
              id={`srv-ev-end-${serverId}`}
              name="event_ends"
              type="datetime-local"
              value={evEnd}
              onChange={(e) => setEvEnd(e.target.value)}
            />
            <button type="submit" className="btn primary small" disabled={busy}>
              {t('serverAutomations.addEvent')}
            </button>
          </form>
        ) : (
          <p className="muted small">{t('serverAutomations.eventsReadOnly')}</p>
        )}
      </section>
      ) : null}

      {tab === 'announcements' ? (
      <section
        className={sectionClass}
        aria-labelledby={`srv-settings-ann-${sid}`}
      >
        <h2 id={`srv-settings-ann-${sid}`} className="server-settings-panel-title">
          {t('serverAutomations.announcementsTitle')}
        </h2>
        <p className="muted small">{t('serverAutomations.announcementsLead')}</p>
        {announcements.length === 0 ? (
          <p className="muted small">{t('serverAutomations.noAnnouncements')}</p>
        ) : (
          <ul className="server-custom-list">
            {announcements.map((an) => (
              <li key={an.id}>
                <strong>{an.title}</strong>
                {canManage ? (
                  <>
                    <button
                      type="button"
                      className="btn small ghost"
                      disabled={busy}
                      onClick={() => removeAnnouncement(an.id)}
                    >
                      {t('serverAutomations.delete')}
                    </button>
                    <div className="server-custom-publish-row">
                      <select
                        aria-label={t('serverAutomations.channelForAnnouncement')}
                        value={publishChannelId}
                        onChange={(e) => setPublishChannelId(e.target.value)}
                        className="select-inline"
                      >
                        <option value="">{t('serverAutomations.channelPlaceholder')}</option>
                        {textChannels.map((ch) => (
                          <option key={ch.id} value={String(ch.id)}>
                            #{ch.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn small secondary"
                        disabled={busy}
                        onClick={() => publishAnnouncement(an.id)}
                      >
                        {t('serverAutomations.publish')}
                      </button>
                    </div>
                  </>
                ) : null}
                <pre className="server-custom-preview">{an.body}</pre>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form className="form-stack server-custom-form" onSubmit={addAnnouncement}>
            <label htmlFor={`srv-ann-title-${serverId}`}>{t('serverAutomations.titleLabel')}</label>
            <input
              id={`srv-ann-title-${serverId}`}
              name="announcement_title"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
            />
            <label htmlFor={`srv-ann-body-${serverId}`}>{t('serverAutomations.bodyLabel')}</label>
            <textarea
              id={`srv-ann-body-${serverId}`}
              name="announcement_body"
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              rows={4}
            />
            <button type="submit" className="btn primary small" disabled={busy}>
              {t('serverAutomations.saveAnnouncement')}
            </button>
          </form>
        ) : (
          <p className="muted small">{t('serverAutomations.announcementsReadOnly')}</p>
        )}
      </section>
      ) : null}
    </div>
  )
}
