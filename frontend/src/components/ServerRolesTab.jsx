import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { resolveDisplayRole, sortServerRoleNames } from '../lib/serverRoles'

/**
 * @param {{
 *   serverId: number | string | null
 *   members?: Array<Record<string, unknown>>
 *   canManageMemberRoles?: boolean
 *   serverOwnerId?: number | null
 *   onMembersRefresh?: (() => void | Promise<void>) | null
 * }} props
 */
export default function ServerRolesTab({
  serverId,
  members = [],
  canManageMemberRoles = false,
  serverOwnerId = null,
  onMembersRefresh = null,
}) {
  const { t } = useTranslation()
  const [roleDefinitions, setRoleDefinitions] = useState([])
  const [roleNameBusyId, setRoleNameBusyId] = useState(null)
  const [roleNameNotice, setRoleNameNotice] = useState(null)
  const [roleNotice, setRoleNotice] = useState(null)
  const [roleBusyId, setRoleBusyId] = useState(null)
  const [query, setQuery] = useState('')

  const loadRoles = useCallback(async () => {
    if (!serverId) return
    try {
      const { data } = await api.get(`/servers/${serverId}/roles`)
      setRoleDefinitions(
        (Array.isArray(data) ? data : []).map((r) => ({
          id: r.id,
          name: r.name,
          slug: String(r.slug || r.name || '')
            .trim()
            .toLowerCase(),
        }))
      )
    } catch {
      setRoleDefinitions([])
    }
  }, [serverId])

  useEffect(() => {
    loadRoles()
  }, [loadRoles])

  const roleLabels = useMemo(() => {
    const m = {}
    for (const r of roleDefinitions) {
      if (r.slug) m[r.slug] = r.name
    }
    return m
  }, [roleDefinitions])

  const serverRoleNames = useMemo(
    () => sortServerRoleNames(roleDefinitions.map((r) => r.slug).filter(Boolean)),
    [roleDefinitions]
  )

  async function saveRoleDisplayName(def, rawName) {
    if (!serverId || !canManageMemberRoles) return
    const name = String(rawName || '').trim()
    if (!name || name === def.name) return
    setRoleNameNotice(null)
    setRoleNameBusyId(def.id)
    try {
      await api.patch(`/servers/${serverId}/roles/${def.id}`, { name })
      await loadRoles()
      await onMembersRefresh?.()
      setRoleNameNotice({ type: 'ok', text: t('members.roleNameSaved') })
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'role_name_taken') {
        setRoleNameNotice({ type: 'err', text: t('members.roleNameTaken') })
      } else {
        setRoleNameNotice({ type: 'err', text: t('members.roleNameErr') })
      }
    } finally {
      setRoleNameBusyId(null)
    }
  }

  async function handleMemberRoleChange(member, nextRole) {
    if (!serverId || !canManageMemberRoles) return
    const current = resolveDisplayRole(member)
    if (String(nextRole).toLowerCase() === current) return
    setRoleNotice(null)
    setRoleBusyId(Number(member.id))
    try {
      await api.patch(`/servers/${serverId}/members/${member.id}/roles`, {
        role: String(nextRole).toLowerCase(),
      })
      await onMembersRefresh?.()
      setRoleNotice({ type: 'ok', text: t('members.roleUpdated') })
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'last_admin') {
        setRoleNotice({ type: 'err', text: t('members.roleErrLastAdmin') })
      } else if (code === 'cannot_change_owner_role') {
        setRoleNotice({ type: 'err', text: t('members.roleErrOwner') })
      } else {
        setRoleNotice({ type: 'err', text: t('members.roleErrGeneric') })
      }
    } finally {
      setRoleBusyId(null)
    }
  }

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (members || []).filter((m) => {
      if (!q) return true
      return String(m?.username || '').toLowerCase().includes(q)
    })
  }, [members, query])

  const sortedMembers = useMemo(
    () =>
      [...filteredMembers].sort((a, b) =>
        String(a?.username || '').localeCompare(String(b?.username || ''), undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      ),
    [filteredMembers]
  )

  function labelForSlug(slug) {
    const s = String(slug || '').toLowerCase()
    return (
      roleLabels[s] ||
      t(`members.roles.${s}`, { defaultValue: s ? s.charAt(0).toUpperCase() + s.slice(1) : '' })
    )
  }

  return (
    <div className="server-settings-tab-pane server-roles-tab">
      <h2 className="server-settings-panel-title">{t('serverModal.rolesTitle')}</h2>
      <p className="muted small server-roles-tab-lead">{t('serverModal.rolesLead')}</p>

      {!canManageMemberRoles ? (
        <p className="muted small server-roles-view-only">{t('serverModal.rolesViewOnly')}</p>
      ) : null}

      {canManageMemberRoles && roleDefinitions.length > 0 ? (
        <div className="server-roles-names-block">
          <h3 className="server-roles-subheading">{t('members.roleNamesEdit')}</h3>
          <p className="muted small">{t('members.roleNamesHint')}</p>
          {roleNameNotice ? (
            <p
              className={`server-roles-inline-notice ${
                roleNameNotice.type === 'err' ? 'server-roles-inline-notice--err' : ''
              }`}
              role="status"
            >
              {roleNameNotice.text}
            </p>
          ) : null}
          <ul className="server-roles-name-edit-list">
            {roleDefinitions.map((def) => (
              <li key={def.id}>
                <label className="server-roles-name-edit-row">
                  <span className="server-roles-slug">{def.slug}</span>
                  <input
                    type="text"
                    name={`role_display_${def.id}`}
                    defaultValue={def.name}
                    key={`${def.id}-${def.name}`}
                    disabled={roleNameBusyId === def.id}
                    onBlur={(e) => saveRoleDisplayName(def, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {roleNotice ? (
        <p
          className={`server-roles-inline-notice ${roleNotice.type === 'err' ? 'server-roles-inline-notice--err' : ''}`}
          role="status"
        >
          {roleNotice.text}
        </p>
      ) : null}

      <div className="server-roles-members-block">
        <h3 className="server-roles-subheading">{t('serverModal.rolesMembersHeading')}</h3>
        <input
          id="server-roles-member-filter"
          name="server_roles_member_filter"
          className="server-roles-member-search"
          type="search"
          placeholder={t('members.searchPh')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
        />
        {sortedMembers.length === 0 ? (
          <p className="muted small server-roles-empty">
            {(members || []).length === 0 ? t('serverModal.rolesEmpty') : t('serverModal.rolesFilterEmpty')}
          </p>
        ) : (
          <div className="server-roles-table-wrap">
            <table className="server-roles-table">
              <thead>
                <tr>
                  <th scope="col">{t('serverModal.rolesColMember')}</th>
                  <th scope="col">{t('serverModal.rolesColRole')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((member) => {
                  const isOwner = serverOwnerId != null && Number(member.id) === Number(serverOwnerId)
                  const dr = resolveDisplayRole(member)
                  const optionNames = sortServerRoleNames([...new Set([...serverRoleNames, dr])].filter(Boolean))
                  return (
                    <tr key={member.id}>
                      <td>
                        <span className="server-roles-username">{String(member.username || '')}</span>
                        {isOwner ? (
                          <span className="muted small server-roles-owner-badge"> · {t('serverModal.rolesOwner')}</span>
                        ) : null}
                      </td>
                      <td>
                        {canManageMemberRoles && !isOwner ? (
                          <select
                            className="select-inline server-roles-role-select"
                            aria-label={t('members.roleLabel')}
                            value={dr}
                            disabled={roleBusyId === Number(member.id) || optionNames.length === 0}
                            onChange={(e) => handleMemberRoleChange(member, e.target.value)}
                          >
                            {optionNames.map((rn) => (
                              <option key={rn} value={rn}>
                                {labelForSlug(rn)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="server-roles-role-readonly">{labelForSlug(dr)}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
