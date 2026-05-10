import PageHeader from '../../components/PageHeader';
import { useDashboard } from '../../contexts/DashboardContext';

export default function RequestManagerPage() {
  const {
    managerRequestReason,
    setManagerRequestReason,
    submitManagerRequest,
    submittingManagerRequest,
    error,
    setError,
  } = useDashboard();

  return (
    <>
      <PageHeader
        title="Request a manager"
        subtitle="Submit a short reason. An administrator will assign your manager when they approve."
      />
      <div className="card max-w-2xl">
        <div className="card-body">
          <form className="form-grid" onSubmit={submitManagerRequest}>
            {error ? (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="field">
              <label className="field-label" htmlFor="mgr-reason">
                Reason
              </label>
              <textarea
                id="mgr-reason"
                value={managerRequestReason}
                onChange={(e) => {
                  setError('');
                  setManagerRequestReason(e.target.value);
                }}
                rows={5}
                required
                placeholder="Briefly explain why you need a manager assigned"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submittingManagerRequest}>
              {submittingManagerRequest ? (
                <>
                  <span className="spinner" aria-hidden /> Submitting…
                </>
              ) : (
                'Submit request'
              )}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
