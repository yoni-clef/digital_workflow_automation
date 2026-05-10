import { useDashboard } from '../../contexts/DashboardContext';

export default function ActionsSetupPanel() {
  const {
    note,
    setNote,
    delegateRole,
    setDelegateRole,
    delegateName,
    setDelegateName,
    delegateEmail,
    setDelegateEmail,
  } = useDashboard();

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Actions setup</h2>
      </div>
      <div className="card-body">
        <div className="form-grid">
          <div className="field">
            <label className="field-label" htmlFor="act-note">
              Note (optional)
            </label>
            <input
              id="act-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Short note for transitions / delegation"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="act-role">
              Delegate role
            </label>
            <select id="act-role" value={delegateRole} onChange={(e) => setDelegateRole(e.target.value)}>
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="act-dname">
              Delegate name
            </label>
            <input
              id="act-dname"
              value={delegateName}
              onChange={(e) => setDelegateName(e.target.value)}
              placeholder="Backup approver"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="act-demail">
              Delegate email
            </label>
            <input
              id="act-demail"
              type="email"
              value={delegateEmail}
              onChange={(e) => setDelegateEmail(e.target.value)}
              placeholder="backup@company.com"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
