export default function MembersPanel({ members }) {
  return (
    <aside className="members-column">
      <header className="members-header">Members</header>
      <ul className="members-list">
        {members.map((member) => (
          <li key={member.id} className="member-item">
            <div className="member-avatar">
              {member.username?.slice(0, 1).toUpperCase()}
            </div>
            <div className="member-meta">
              <strong>{member.username}</strong>
              <span>{member.roles?.join(', ') || 'member'}</span>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  )
}
