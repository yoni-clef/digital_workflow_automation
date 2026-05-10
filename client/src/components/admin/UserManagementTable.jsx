import { useEffect, useMemo } from 'react';
import { useDashboard } from '../../contexts/DashboardContext';
import { useAuth } from '../../AuthContext';

export default function UserManagementTable() {
  const { user, refreshSession } = useAuth();
  const {
    users,
    loadingUsers,
    error,
    setError,
    refreshUsers,
    updateUserRole,
    updateUserManager,
    updateUserDepartmentHead,
    showToast,
  } = useDashboard();

  const adminCount = useMemo(() => users.filter((u) => u.role === 'ADMIN').length, [users]);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">User management</h2>
          <p className="page-sub mt-1">Roles, reporting manager, and department head</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => refreshUsers()}
          disabled={loadingUsers}
        >
          {loadingUsers ? (
            <>
              <span className="spinner" aria-hidden /> Refreshing…
            </>
          ) : (
            'Refresh'
          )}
        </button>
      </div>
      {error ? (
        <div className="card-body">
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        </div>
      ) : null}
      {loadingUsers && users.length === 0 ? (
        <div className="card-body text-center text-[var(--text-3)] py-12">
          <span className="spinner mr-2" aria-hidden /> Loading users…
        </div>
      ) : users.length === 0 ? (
        <div className="empty-state">
          <h3>No users</h3>
          <p>No accounts found.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Manager</th>
                <th>Dept head</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((userItem) => (
                <tr key={userItem.id}>
                  <td className="td-title">{userItem.displayName}</td>
                  <td>{userItem.email}</td>
                  <td>
                    <span
                      className={
                        userItem.role === 'ADMIN'
                          ? 'badge badge-role-ADMIN'
                          : 'badge badge-role-USER'
                      }
                    >
                      {userItem.role}
                    </span>
                  </td>
                  <td>{userItem.department || '—'}</td>
                  <td>{userItem.manager?.displayName || '—'}</td>
                  <td className="text-center">
                    {userItem.isDepartmentHead ? (
                      <span className="badge badge-APPROVE">Dept head</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="actions-row">
                      <select
                        className="text-xs max-w-[100px]"
                        value={userItem.role}
                        aria-label={`Role for ${userItem.displayName}`}
                        onChange={async (e) => {
                          const nextRole = e.target.value;
                          if (
                            userItem.id === user?.id &&
                            userItem.role === 'ADMIN' &&
                            nextRole === 'USER'
                          ) {
                            const ok = window.confirm(
                              'You will lose admin access for this account. Admin pages will stop working until another admin restores your role. Continue?'
                            );
                            if (!ok) {
                              await refreshUsers();
                              return;
                            }
                          }
                          try {
                            await updateUserRole(userItem.id, nextRole);
                            await refreshUsers();
                            if (userItem.id === user?.id) await refreshSession();
                            showToast('Role updated.');
                          } catch (err) {
                            setError(err?.message || 'Failed to update role');
                            await refreshUsers();
                          }
                        }}
                      >
                        <option
                          value="USER"
                          disabled={userItem.role === 'ADMIN' && adminCount <= 1}
                        >
                          USER
                        </option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                      <select
                        className="text-xs max-w-[140px]"
                        value={userItem.managerId || ''}
                        aria-label={`Manager for ${userItem.displayName}`}
                        onChange={async (e) => {
                          try {
                            await updateUserManager(userItem.id, e.target.value || null);
                            await refreshUsers();
                            if (userItem.id === user?.id) await refreshSession();
                            showToast('Manager updated.');
                          } catch (err) {
                            setError(err?.message || 'Failed to update manager');
                          }
                        }}
                      >
                        <option value="">No manager</option>
                        {users
                          .filter((u) => u.id !== userItem.id)
                          .map((mgr) => (
                            <option key={mgr.id} value={mgr.id}>
                              {mgr.displayName}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          try {
                            await updateUserDepartmentHead(
                              userItem.id,
                              !userItem.isDepartmentHead,
                              userItem.department
                            );
                            await refreshUsers();
                            if (userItem.id === user?.id) await refreshSession();
                            showToast('Department head updated.');
                          } catch (err) {
                            setError(err?.message || 'Failed to update department head');
                          }
                        }}
                      >
                        {userItem.isDepartmentHead ? 'Remove DH' : 'Make DH'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
