import { useEffect, useState } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';

export default function ManagerRequestsTable() {
  const {
    users,
    managerRequests,
    loadingManagerRequests,
    managerPickByRequestId,
    setManagerPickByRequestId,
    loadManagerRequests,
    refreshUsers,
    approveManagerRequest,
    rejectManagerRequest,
    error,
    setError,
    showToast,
  } = useDashboard();

  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectModalError, setRejectModalError] = useState('');

  useEffect(() => {
    loadManagerRequests();
    refreshUsers();
  }, [loadManagerRequests, refreshUsers]);

  useEffect(() => {
    if (!rejectModal) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setRejectModal(null);
        setRejectReason('');
        setRejectModalError('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rejectModal]);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Manager requests</h2>
          <p className="page-sub mt-1">Assign a manager, then approve or reject.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => loadManagerRequests()}>
          Refresh
        </button>
      </div>
      {error ? (
        <div className="card-body pb-0">
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        </div>
      ) : null}
      {loadingManagerRequests && managerRequests.length === 0 ? (
        <div className="card-body text-center py-12">
          <span className="spinner mr-2" aria-hidden /> Loading…
        </div>
      ) : managerRequests.length === 0 ? (
        <div className="empty-state">
          <h3>No pending requests</h3>
          <p>Users who need a manager assignment will appear here.</p>
        </div>
      ) : (
        <div className="table-wrapper card-body pt-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Department</th>
                <th>Assign manager</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {managerRequests.map((request) => {
                const candidates = users.filter((u) => u.id !== request.user.id);
                return (
                  <tr key={request.id}>
                    <td className="td-title">{request.user.displayName}</td>
                    <td>{request.user.email}</td>
                    <td>{request.user.department || '—'}</td>
                    <td>
                      <select
                        className="text-sm max-w-xs"
                        value={managerPickByRequestId[request.id] || ''}
                        aria-label={`Manager for ${request.user.displayName}`}
                        onChange={(e) =>
                          setManagerPickByRequestId((prev) => ({
                            ...prev,
                            [request.id]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select manager…</option>
                        {candidates.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.displayName} {u.email ? `(${u.email})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{request.reason}</td>
                    <td>
                      <span className="badge badge-REVIEW">{request.status}</span>
                    </td>
                    <td>
                      <div className="actions-row">
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          disabled={!managerPickByRequestId[request.id]}
                          onClick={async () => {
                            const managerId = managerPickByRequestId[request.id];
                            if (!managerId) {
                              setError('Select a manager before approving.');
                              return;
                            }
                            setError('');
                            try {
                              await approveManagerRequest(request.id, managerId);
                              setManagerPickByRequestId((prev) => {
                                const next = { ...prev };
                                delete next[request.id];
                                return next;
                              });
                              await loadManagerRequests();
                              showToast('Manager assignment approved.');
                            } catch (err) {
                              setError(err?.message || 'Failed to approve');
                            }
                          }}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => {
                            setRejectModal({ id: request.id, userLabel: request.user.displayName });
                            setRejectReason('');
                            setRejectModalError('');
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rejectModal ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setRejectModal(null);
              setRejectReason('');
              setRejectModalError('');
            }
          }}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-mgr-modal-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="reject-mgr-modal-title" className="modal-title">
                Reject manager request
              </h3>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                aria-label="Close dialog"
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                  setRejectModalError('');
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-[var(--text-2)]">
                {rejectModal.userLabel} will stay without an approved manager assignment until they submit again.
              </p>
              {rejectModalError ? (
                <div className="alert alert-error text-sm" role="alert">
                  {rejectModalError}
                </div>
              ) : null}
              <div className="field">
                <label className="field-label" htmlFor="reject-mgr-reason">
                  Reason <span className="text-[var(--text-3)]">(required)</span>
                </label>
                <textarea
                  id="reject-mgr-reason"
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectModalError('');
                    setRejectReason(e.target.value);
                  }}
                  placeholder="Explain why this request is rejected"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                  setRejectModalError('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  const reason = rejectReason.trim();
                  if (!reason) {
                    setRejectModalError('Please enter a reason.');
                    return;
                  }
                  setError('');
                  try {
                    await rejectManagerRequest(rejectModal.id, reason);
                    setManagerPickByRequestId((prev) => {
                      const next = { ...prev };
                      delete next[rejectModal.id];
                      return next;
                    });
                    setRejectModal(null);
                    setRejectReason('');
                    await loadManagerRequests();
                    showToast('Request rejected.');
                  } catch (err) {
                    setError(err?.message || 'Failed to reject');
                  }
                }}
              >
                Reject request
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
