import { useDashboard } from '../../contexts/DashboardContext';

export default function CreateRequestPanel() {
  const {
    user,
    title,
    setTitle,
    description,
    setDescription,
    category,
    setCategory,
    amount,
    setAmount,
    file,
    setFile,
    canCreate,
    onCreate,
    creatingRequest,
    refresh,
    loadingRequests,
  } = useDashboard();

  if (!user?.managerId) {
    return (
      <div className="card">
        <div className="card-body">
          <p className="text-[var(--text-2)] text-sm">
            You need an assigned manager before you can create workflow requests. Use <strong>Request manager</strong>{' '}
            or ask an admin to assign one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Create request</h2>
      </div>
      <div className="card-body">
        <form className="form-grid" onSubmit={onCreate}>
          <div className="field">
            <label className="field-label" htmlFor="wf-title">
              Title
            </label>
            <input
              id="wf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Purchase new laptop"
              required
              minLength={3}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="wf-desc">
              Description (optional)
            </label>
            <textarea
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="form-grid cols-2">
            <div className="field">
              <label className="field-label" htmlFor="wf-cat">
                Category
              </label>
              <select id="wf-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="GENERAL">General</option>
                <option value="HARDWARE">Hardware</option>
                <option value="SOFTWARE">Software</option>
                <option value="FINANCE">Finance</option>
                <option value="HR">HR</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label" htmlFor="wf-amt">
                Amount
              </label>
              <input
                id="wf-amt"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor="wf-file">
              Attachment
            </label>
            <input
              id="wf-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="actions-row pt-2">
            <button type="submit" className="btn btn-primary" disabled={!canCreate || creatingRequest}>
              {creatingRequest ? (
                <>
                  <span className="spinner" aria-hidden /> Creating…
                </>
              ) : (
                'Create'
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => refresh()}
              disabled={loadingRequests}
            >
              Refresh list
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
