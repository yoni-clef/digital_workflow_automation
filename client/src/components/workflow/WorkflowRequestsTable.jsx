import { Paperclip, Filter, ArrowDownWideNarrow } from 'lucide-react';
import { useDashboard } from '../../contexts/DashboardContext';
import { requestStatusBadgeClass } from '../../utils/statusBadges';

/**
 * @param {{ viewMode: 'my' | 'inbox' | 'admin' }} props
 */
export default function WorkflowRequestsTable({ viewMode }) {
  const {
    user,
    getFilteredItems,
    loadingRequests,
    error,
    filterStatus,
    setFilterStatus,
    filterCategory,
    setFilterCategory,
    sortBy,
    setSortBy,
    nextActionByStatus,
    canActOnRequest,
    onTransition,
    onDelegate,
  } = useDashboard();

  const filteredItems = getFilteredItems(viewMode);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">Requests</h2>
          {error ? (
            <div className="alert alert-error mt-2 text-sm" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div className="filter-row flex-wrap">
          <div className="search-bar flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded px-3 py-1.5">
            <Filter className="w-4 h-4 text-[var(--text-3)] shrink-0" aria-hidden />
            <select
              className="bg-transparent text-sm outline-none border-0 min-w-[120px]"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="ALL">All status</option>
              <option value="PENDING_MANAGER">Pending manager</option>
              <option value="PENDING_DEPARTMENT">Pending department</option>
              <option value="APPROVED">Approved</option>
              <option value="NEEDS_INFO">Needs info</option>
              <option value="REJECTED">Rejected</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded px-3 py-1.5">
            <Filter className="w-4 h-4 text-[var(--text-3)] shrink-0" aria-hidden />
            <select
              className="bg-transparent text-sm outline-none border-0 min-w-[120px]"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="ALL">All categories</option>
              <option value="GENERAL">General</option>
              <option value="HARDWARE">Hardware</option>
              <option value="SOFTWARE">Software</option>
              <option value="FINANCE">Finance</option>
              <option value="HR">HR</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded px-3 py-1.5">
            <ArrowDownWideNarrow className="w-4 h-4 text-[var(--text-3)] shrink-0" aria-hidden />
            <select
              className="bg-transparent text-sm outline-none border-0"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort by"
            >
              <option value="updatedAt">Latest updates</option>
              <option value="amountCents">Highest amount</option>
            </select>
          </div>
        </div>
      </div>

      {loadingRequests ? (
        <div className="card-body text-center text-[var(--text-3)] py-12">
          <span className="spinner mr-2 align-middle" aria-hidden />
          Loading requests…
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon" aria-hidden>
            📋
          </div>
          <h3>No requests</h3>
          <p>Nothing matches your filters, or the list is empty.</p>
        </div>
      ) : (
        <div className="table-wrapper card-body pt-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Created by</th>
                <th>Assigned</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const step = nextActionByStatus[item.status];
                const canAdvance = canActOnRequest(user, item, step);
                const canReject = ['PENDING_MANAGER', 'PENDING_DEPARTMENT'].includes(item.status) && canAdvance;
                const canRequestInfo = ['PENDING_MANAGER', 'PENDING_DEPARTMENT'].includes(item.status) && canAdvance;
                const canDeleg = ['PENDING_MANAGER', 'PENDING_DEPARTMENT'].includes(item.status) && canAdvance;
                const amountText = Number.isInteger(item.amountCents)
                  ? (item.amountCents / 100).toFixed(2)
                  : '-';
                return (
                  <tr key={item.id}>
                    <td className="text-[var(--text-3)]">#{item.id}</td>
                    <td className="td-title">
                      {item.title}
                      {item.attachments && item.attachments.length > 0 && (
                        <a
                          href={item.attachments[0].url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 ml-2 text-xs text-[var(--primary)] hover:underline"
                        >
                          <Paperclip className="w-3 h-3" aria-hidden /> File
                        </a>
                      )}
                    </td>
                    <td>
                      <span className={requestStatusBadgeClass(item.status)}>{item.status}</span>
                    </td>
                    <td>{item.category}</td>
                    <td>${amountText}</td>
                    <td>{item.submitter?.displayName ?? 'Unknown'}</td>
                    <td>{item.assignedTo?.displayName ?? '—'}</td>
                    <td className="text-xs text-[var(--text-3)]">
                      {new Date(item.updatedAt).toLocaleString()}
                    </td>
                    <td>
                      <div className="actions-row">
                        {step ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => onTransition(item, step)}
                              disabled={!canAdvance}
                            >
                              {step.label}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => onTransition(item, { action: 'REQUEST_INFO' })}
                              disabled={!canRequestInfo}
                            >
                              Info
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => onTransition(item, { action: 'REJECT' })}
                              disabled={!canReject}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => onDelegate(item)}
                              disabled={!canDeleg}
                            >
                              Delegate
                            </button>
                          </>
                        ) : (
                          <span className="text-[var(--text-3)] italic text-xs">Done</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
