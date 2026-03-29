import { useState } from 'react'
import { resolveImageUrl } from '../lib/resolveImageUrl'

export default function MembersPanel({ members }) {
  const [avatarFailed, setAvatarFailed] = useState(() => new Set())

  return (
    <aside className="members-column">
      <header className="members-header">Members</header>
      <ul className="members-list">
        {members.map((member) => {
          const showImg = member.avatar_url && !avatarFailed.has(member.id)
          return (
            <li key={member.id} className="member-item">
              <div className="member-avatar">
                {showImg ? (
                  <img
                    src={resolveImageUrl(member.avatar_url)}
                    alt=""
                    onError={() => {
                      setAvatarFailed((prev) => new Set(prev).add(member.id))
                    }}
                  />
                ) : (
                  member.username?.slice(0, 1).toUpperCase()
                )}
              </div>
              <div className="member-meta">
                <strong>{member.username}</strong>
                <span>{member.roles?.join(', ') || 'member'}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
