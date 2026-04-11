import { useCallback, useEffect, useState } from 'react'
import api from '../services/api'

function fromDatetimeLocalValue(s) {
  if (!s || !String(s).trim()) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function ServerCustomContentSettings({ serverId, canManage }) {
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
      setLocalError('Could not load server automations.')
    }
  }, [serverId])

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
      if (code === 'reserved_command_name') setLocalError('That name is reserved (!schedule / !next).')
      else if (code === 'command_name_taken') setLocalError('That command name already exists.')
      else if (code === 'blocked_content') setLocalError('Content blocked by filters.')
      else setLocalError('Could not save command.')
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
      setLocalError('Could not delete command.')
    } finally {
      setBusy(false)
    }
  }

  async function addEvent(e) {
    e.preventDefault()
    if (!canManage) return
    const starts = fromDatetimeLocalValue(evStart)
    if (!starts) {
      setLocalError('Choose a start date and time for the event.')
      return
    }
    let ends = fromDatetimeLocalValue(evEnd)
    if (evEnd.trim() && !ends) {
      setLocalError('End time is invalid.')
      return
    }
    if (ends && new Date(ends) < new Date(starts)) {
      setLocalError('End must be after start.')
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
      if (err.response?.data?.error === 'blocked_content') setLocalError('Content blocked by filters.')
      else setLocalError('Could not save event.')
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
      setLocalError('Could not delete event.')
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
      if (err.response?.data?.error === 'blocked_content') setLocalError('Content blocked by filters.')
      else setLocalError('Could not save announcement.')
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
      setLocalError('Could not delete announcement.')
    } finally {
      setBusy(false)
    }
  }

  async function publishAnnouncement(announcementId) {
    if (!canManage || !announcementId) return
    const cid = parseInt(publishChannelId, 10)
    if (Number.isNaN(cid) || cid <= 0) {
      setLocalError('Choose a text channel to publish.')
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
      if (code === 'send_forbidden') setLocalError('You cannot send messages in that channel.')
      else setLocalError('Could not publish announcement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="server-custom-content">
      {localError ? <div className="error-banner inline">{localError}</div> : null}

      <section className="server-custom-section">
        <h3>Custom commands</h3>
        <p className="muted small">
          Members type <code className="inline-code">!name</code> in text chat; the bot replies with your text.
          Names must be 2–32 characters (<code className="inline-code">a-z</code>, <code className="inline-code">0-9</code>,{' '}
          <code className="inline-code">_</code>). Built-in <code className="inline-code">!schedule</code> /{' '}
          <code className="inline-code">!next</code> stay reserved.
        </p>
        {commands.length === 0 ? (
          <p className="muted small">No custom commands yet.</p>
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
                    Remove
                  </button>
                ) : null}
                <pre className="server-custom-preview">{c.response}</pre>
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form className="form-stack server-custom-form" onSubmit={addCommand}>
            <label htmlFor={`srv-cmd-name-${serverId}`}>New command (without !)</label>
            <input
              id={`srv-cmd-name-${serverId}`}
              name="command_name"
              value={cmdName}
              onChange={(e) => setCmdName(e.target.value)}
              placeholder="rules"
              autoComplete="off"
            />
            <label htmlFor={`srv-cmd-resp-${serverId}`}>Reply text</label>
            <textarea
              id={`srv-cmd-resp-${serverId}`}
              name="command_response"
              value={cmdResponse}
              onChange={(e) => setCmdResponse(e.target.value)}
              rows={4}
              placeholder="Server rules: be respectful…"
            />
            <button type="submit" className="btn primary small" disabled={busy}>
              Add command
            </button>
          </form>
        ) : (
          <p className="muted small">Only moderators and admins can edit commands.</p>
        )}
      </section>

      <section className="server-custom-section">
        <h3>Server events</h3>
        <p className="muted small">Community events (tournaments, meetups, streams). Shown in order by start time.</p>
        {events.length === 0 ? (
          <p className="muted small">No events scheduled.</p>
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
                    Remove
                  </button>
                ) : null}
                {ev.description ? <pre className="server-custom-preview">{ev.description}</pre> : null}
              </li>
            ))}
          </ul>
        )}
        {canManage ? (
          <form className="form-stack server-custom-form" onSubmit={addEvent}>
            <label htmlFor={`srv-ev-title-${serverId}`}>Title</label>
            <input
              id={`srv-ev-title-${serverId}`}
              name="event_title"
              value={evTitle}
              onChange={(e) => setEvTitle(e.target.value)}
            />
            <label htmlFor={`srv-ev-desc-${serverId}`}>Description (optional)</label>
            <textarea
              id={`srv-ev-desc-${serverId}`}
              name="event_description"
              value={evDesc}
              onChange={(e) => setEvDesc(e.target.value)}
              rows={3}
            />
            <label htmlFor={`srv-ev-start-${serverId}`}>Starts</label>
            <input
              id={`srv-ev-start-${serverId}`}
              name="event_starts"
              type="datetime-local"
              value={evStart}
              onChange={(e) => setEvStart(e.target.value)}
            />
            <label htmlFor={`srv-ev-end-${serverId}`}>Ends (optional)</label>
            <input
              id={`srv-ev-end-${serverId}`}
              name="event_ends"
              type="datetime-local"
              value={evEnd}
              onChange={(e) => setEvEnd(e.target.value)}
            />
            <button type="submit" className="btn primary small" disabled={busy}>
              Add event
            </button>
          </form>
        ) : (
          <p className="muted small">Only moderators and admins can add events.</p>
        )}
      </section>

      <section className="server-custom-section">
        <h3>Announcements</h3>
        <p className="muted small">
          Save a message template, then publish it to a text channel as a normal message (from your account).
        </p>
        {announcements.length === 0 ? (
          <p className="muted small">No saved announcements.</p>
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
                      Delete
                    </button>
                    <div className="server-custom-publish-row">
                      <select
                        aria-label="Channel for announcement"
                        value={publishChannelId}
                        onChange={(e) => setPublishChannelId(e.target.value)}
                        className="select-inline"
                      >
                        <option value="">Channel…</option>
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
                        Publish
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
            <label htmlFor={`srv-ann-title-${serverId}`}>Title</label>
            <input
              id={`srv-ann-title-${serverId}`}
              name="announcement_title"
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
            />
            <label htmlFor={`srv-ann-body-${serverId}`}>Body</label>
            <textarea
              id={`srv-ann-body-${serverId}`}
              name="announcement_body"
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              rows={4}
            />
            <button type="submit" className="btn primary small" disabled={busy}>
              Save announcement
            </button>
          </form>
        ) : (
          <p className="muted small">Only moderators and admins can manage announcements.</p>
        )}
      </section>
    </div>
  )
}
