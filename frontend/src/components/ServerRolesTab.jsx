import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import api from '../services/api'
import { resolveDisplayRole, sortServerRoleNames } from '../lib/serverRoles'

/**
 * @typedef {{ id: number, name: string, slug: string, is_system?: boolean, permissions?: string[] }} ServerRoleDef
 */

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
  /** @type {[ServerRoleDef[], React.Dispatch<React.SetStateAction<ServerRoleDef[]>>]} */
  const [roleDefinitions, setRoleDefinitions] = useState([])
  const [catalogKeys, setCatalogKeys] = useState([])
  const [roleNameBusyId, setRoleNameBusyId] = useState(null)
  const [roleNameNotice, setRoleNameNotice] = useState(null)
  const [roleNotice, setRoleNotice] = useState(null)
  const [roleBusyId, setRoleBusyId] = useState(null)
  const [permBusyId, setPermBusyId] = useState(null)
  const [deleteBusyId, setDeleteBusyId] = useState(null)
  const [createBusy, setCreateBusy] = useState(false)
  const [createNotice, setCreateNotice] = useState(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleSlug, setNewRoleSlug] = useState('')
  const [query, setQuery] = useState('')

  const loadCatalog = useCallback(async () => {
    if (!serverId) return
    try {
      const { data } = await api.get(`/servers/${serverId}/server-permission-catalog`)
      const keys = Array.isArray(data?.keys) ? data.keys : []
      setCatalogKeys(keys.map(String))
    } catch {
      setCatalogKeys([])
    }
  }, [serverId])

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
          is_system: Boolean(r.is_system),
          permissions: Array.isArray(r.permissions) ? r.permissions.map(String) : [],
        }))
      )
    } catch {
      setRoleDefinitions([])
    }
  }, [serverId])

  useEffect(() => {
    loadCatalog()
    loadRoles()
  }, [loadCatalog, loadRoles])

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

  async function saveRolePermissions(roleId, nextKeys) {
    if (!serverId || !canManageMemberRoles) return
    setPermBusyId(roleId)
    try {
      await api.put(`/servers/${serverId}/roles/${roleId}/permissions`, { permissions: nextKeys })
      await loadRoles()
      setRoleNameNotice({ type: 'ok', text: t('serverModal.rolesPermissionsSaved') })
    } catch {
      await loadRoles()
      setRoleNameNotice({ type: 'err', text: t('serverModal.rolesPermissionsErr') })
    } finally {
      setPermBusyId(null)
    }
  }

  async function togglePermission(def, key, checked) {
    const set = new Set(def.permissions || [])
    if (checked) set.add(key)
    else set.delete(key)
    const next = [...set].sort()
    await saveRolePermissions(def.id, next)
  }

  async function handleCreateRole(e) {
    e.preventDefault()
    if (!serverId || !canManageMemberRoles) return
    const name = newRoleName.trim()
    if (name.length < 2) {
      setCreateNotice({ type: 'err', text: t('serverModal.rolesCreateNameShort') })
      return
    }
    setCreateNotice(null)
    setCreateBusy(true)
    try {
      const body = { name }
      const slug = newRoleSlug.trim()
      if (slug) body.slug = slug.toLowerCase()
      await api.post(`/servers/${serverId}/roles`, body)
      setNewRoleName('')
      setNewRoleSlug('')
      await loadRoles()
      setCreateNotice({ type: 'ok', text: t('serverModal.rolesCreateOk') })
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'reserved_slug') setCreateNotice({ type: 'err', text: t('serverModal.rolesErrReservedSlug') })
      else if (code === 'role_slug_taken') setCreateNotice({ type: 'err', text: t('serverModal.rolesErrSlugTaken') })
      else if (code === 'role_name_taken') setCreateNotice({ type: 'err', text: t('serverModal.rolesErrNameTaken') })
      else setCreateNotice({ type: 'err', text: t('serverModal.rolesCreateErr') })
    } finally {
      setCreateBusy(false)
    }
  }

  async function handleDeleteRole(def) {
    if (!serverId || !canManageMemberRoles || def.is_system) return
    if (!window.confirm(t('serverModal.rolesDeleteConfirm', { name: def.name }))) return
    setDeleteBusyId(def.id)
    setCreateNotice(null)
    try {
      await api.delete(`/servers/${serverId}/roles/${def.id}`)
      await loadRoles()
      await onMembersRefresh?.()
      setRoleNameNotice({ type: 'ok', text: t('serverModal.rolesDeleted') })
    } catch (err) {
      const code = err.response?.data?.error
      if (code === 'role_in_use') {
        setRoleNameNotice({ type: 'err', text: t('serverModal.rolesErrInUse') })
      } else {
        setRoleNameNotice({ type: 'err', text: t('serverModal.rolesDeleteErr') })
      }
    } finally {
      setDeleteBusyId(null)
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

      {canManageMemberRoles ? (
        <form className="server-roles-create-form" onSubmit={handleCreateRole}>
          <h3 className="server-roles-subheading">{t('serverModal.rolesNewRoleHeading')}</h3>
          <p className="muted small">{t('serverModal.rolesNewRoleHint')}</p>
          {createNotice ? (
            <p
              className={`server-roles-inline-notice ${
                createNotice.type === 'err' ? 'server-roles-inline-notice--err' : ''
              }`}
              role="status"
            >
              {createNotice.text}
            </p>
          ) : null}
          <div className="server-roles-create-row">
            <label className="server-roles-create-field">
              <span className="sr-only">{t('serverModal.rolesNewName')}</span>
              <input
                type="text"
                name="new_role_name"
                placeholder={t('serverModal.rolesNewNamePh')}
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                disabled={createBusy}
              />
            </label>
            <label className="server-roles-create-field">
              <span className="sr-only">{t('serverModal.rolesNewSlug')}</span>
              <input
                type="text"
                name="new_role_slug"
                placeholder={t('serverModal.rolesNewSlugPh')}
                value={newRoleSlug}
                onChange={(e) => setNewRoleSlug(e.target.value)}
                disabled={createBusy}
              />
            </label>
            <button type="submit" className="btn secondary" disabled={createBusy}>
              {createBusy ? t('serverModal.rolesCreating') : t('serverModal.rolesCreateCta')}
            </button>
          </div>
        </form>
      ) : null}

      {canManageMemberRoles && roleDefinitions.length > 0 ? (
        <div className="server-roles-names-block">
          <h3 className="server-roles-subheading">{t('serverModal.rolesRolesAndPermsHeading')}</h3>
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
          <ul className="server-roles-role-cards">
            {roleDefinitions.map((def) => (
              <li key={def.id} className="server-roles-role-card">
                <div className="server-roles-role-card-head">
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
                  {!def.is_system ? (
                    <button
                      type="button"
                      className="btn ghost small server-roles-delete-btn"
                      disabled={deleteBusyId === def.id}
                      onClick={() => handleDeleteRole(def)}
                    >
                      {deleteBusyId === def.id ? t('serverModal.rolesDeleting') : t('serverModal.rolesDelete')}
                    </button>
                  ) : null}
                </div>
                {catalogKeys.length > 0 ? (
                  <fieldset className="server-roles-perm-fieldset" disabled={permBusyId === def.id}>
                    <legend className="server-roles-perm-legend">{t('serverModal.rolesPermissionsLegend')}</legend>
                    <div className="server-roles-perm-grid">
                      {catalogKeys.map((key) => (
                        <label key={key} className="server-roles-perm-item">
                          <input
                            type="checkbox"
                            name={`perm_${def.id}_${key}`}
                            checked={(def.permissions || []).includes(key)}
                            onChange={(e) => {
                              void togglePermission(def, key, e.target.checked)
                            }}
                          />
                          <span>{t(`serverModal.perm.${key}`, { defaultValue: key })}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
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
