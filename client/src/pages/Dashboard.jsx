import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRequest, delegateRequest, listRequests, transitionRequest, uploadAttachment, listUsers, updateUserRole, updateUserManager, updateUserDepartmentHead, createManagerRequest, getManagerRequests, approveManagerRequest, rejectManagerRequest } from '../api';
import { useAuth } from '../AuthContext';
import { filterRequests, sortRequests } from '../utils';
import { Paperclip, Filter, ArrowDownWideNarrow } from 'lucide-react';

const nextActionByStatus = {
  PENDING_MANAGER: { action: 'REVIEW', label: 'Manager Approve', required: 'MANAGER' },
  PENDING_DEPARTMENT: { action: 'APPROVE', label: 'Dept Approve', required: 'DEPT_HEAD' },
  NEEDS_INFO: { action: 'RESUBMIT', label: 'Resubmit', required: 'SUBMITTER' },
  APPROVED: { action: 'ARCHIVE', label: 'Archive', required: 'DEPT_HEAD' },
  ARCHIVED: null,
  REJECTED: null,
};

function canActOnRequest(user, item, step) {
  if (!user || user.role === 'ADMIN') return true;
  if (!step) return false;

  if (step.required === 'SUBMITTER') {
    return item.submitter?.id === user.id;
  }
  if (step.required === 'MANAGER') {
    return item.submitter?.managerId === user.id || item.assignedTo?.id === user.id;
  }
  if (step.required === 'DEPT_HEAD') {
    return (user.isDepartmentHead && item.submitter?.department === user.department) || item.assignedTo?.id === user.id;
  }
  return false;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [managerRequests, setManagerRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState(
    user?.role === 'ADMIN' ? 'ADMIN' : 'MY_REQUESTS'
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [delegateRole, setDelegateRole] = useState('');
  const [delegateName, setDelegateName] = useState('');
  const [delegateEmail, setDelegateEmail] = useState('');

  // Manager request form state
  const [managerRequestReason, setManagerRequestReason] = useState('');
  const [requestedManagerId, setRequestedManagerId] = useState('');
  const [file, setFile] = useState(null);

  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [sortBy, setSortBy] = useState('updatedAt');

  const filteredItems = useMemo(() => {
    let list = items;
    if (activeTab === 'MY_REQUESTS') {
      list = list.filter(i => i.submitter?.id === user?.id || i.submitter?.email === user?.email);
    } else if (activeTab === 'INBOX') {
      list = list.filter(i => {
        const step = nextActionByStatus[i.status];
        if (canActOnRequest(user, i, step)) return true;
        if (i.assignedTo && i.assignedTo.email === user?.email) return true;
        // if user is manager or dept head of this, let them see it in inbox if pending
        if (i.status === 'PENDING_MANAGER' && i.submitter?.managerId === user?.id) return true;
        if (i.status === 'PENDING_DEPARTMENT' && user?.isDepartmentHead && i.submitter?.department === user?.department) return true;
        return false;
      });
    }

    return sortRequests(filterRequests(list, { status: filterStatus, category: filterCategory }), sortBy);
  }, [items, filterStatus, filterCategory, sortBy, activeTab, user]);

  const canCreate = useMemo(() => {
    return Boolean(user) && title.trim().length >= 3 && (amount.trim() === '' || Number.isFinite(Number(amount))) && user?.managerId;
  }, [user, title, amount]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setError('');
    setLoading(true);
    try {
      const list = await listRequests();
      setItems(list);
    } catch (e) {
      setError(e?.message ?? 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const refreshUsers = useCallback(async () => {
    if (!user) return;
    setError('');
    setLoading(true);
    try {
      const userList = await listUsers();
      setUsers(userList);
    } catch (e) {
      setError(e?.message ?? 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const loadManagerRequests = useCallback(async () => {
    if (!user || user.role !== 'ADMIN') return;
    setError('');
    setLoading(true);
    try {
      const requests = await getManagerRequests();
      setManagerRequests(requests);
    } catch (e) {
      setError(e?.message ?? 'Failed to load manager requests');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (activeTab === 'USER_MANAGEMENT') {
      refreshUsers();
    } else if (activeTab === 'MANAGER_REQUESTS') {
      loadManagerRequests();
    }
  }, [activeTab, refreshUsers, loadManagerRequests]);

  async function onCreate(e) {
    e.preventDefault();
    if (!canCreate) return;

    setError('');
    setLoading(true);
    try {
      const createdItem = await createRequest({
        title: title.trim(),
        description: description.trim(),
        category,
        amountCents: amount.trim() ? Math.round(Number(amount) * 100) : undefined,
      });

      if (file) {
        await uploadAttachment(createdItem.id, file);
      }

      setTitle('');
      setDescription('');
      setAmount('');
      setFile(null);
      await refresh();
    } catch (e2) {
      setError(e2?.message ?? 'Failed to create');
    } finally {
      setLoading(false);
    }
  }

  async function onDelegate(item) {
    if (delegateName.trim().length < 2) {
      setError('Enter a delegate name.');
      return;
    }

    setError('');
    try {
      await delegateRequest(item.id, {
        displayName: delegateName.trim(),
        email: delegateEmail.trim(),
        role: delegateRole,
        department: user.department ?? '',
        note: note.trim() ? note.trim() : undefined,
      });
      await refresh();
    } catch (e2) {
      setError(e2?.message ?? 'Failed to delegate');
    }
  }

  async function onTransition(item, step) {
    if (!step) return;

    setError('');
    try {
      await transitionRequest(item.id, {
        action: step.action,
        note: note.trim() ? note.trim() : undefined,
      });
      await refresh();
    } catch (e2) {
      setError(e2?.message ?? 'Failed to transition');
    }
  }

  return (
    <div className="container py-8 px-4 max-w-6xl mx-auto">
      <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-3xl font-bold">Digital Approval Workflow</h1>
          <p className="text-gray-400 mt-1">Request - Review - Approve - Archive</p>
        </div>
        <div className="flex items-center gap-4 bg-gray-900 border border-gray-800 px-4 py-2 rounded-lg">
          <span className="font-medium text-sm text-indigo-400">{user.displayName} / {user.role}</span>
          <button type="button" className="text-sm bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded transition" onClick={logout}>Sign out</button>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="flex gap-6 border-b border-gray-800 mb-8">
        <button
          onClick={() => setActiveTab('MY_REQUESTS')}
          className={`pb-3 font-medium transition-colors ${activeTab === 'MY_REQUESTS' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          My Requests
        </button>

        <button
          onClick={() => setActiveTab('INBOX')}
          className={`pb-3 font-medium transition-colors ${activeTab === 'INBOX' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
        >
          Inbox (Team / Action Required)
        </button>

        {user?.role === 'ADMIN' && (
          <>
            <button
              onClick={() => setActiveTab('ADMIN')}
              className={`pb-3 font-medium transition-colors ${activeTab === 'ADMIN' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Admin View
            </button>
            <button
              onClick={() => setActiveTab('USER_MANAGEMENT')}
              className={`pb-3 font-medium transition-colors ${activeTab === 'USER_MANAGEMENT' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              User Management
            </button>
            <button
              onClick={() => setActiveTab('MANAGER_REQUESTS')}
              className={`pb-3 font-medium transition-colors ${activeTab === 'MANAGER_REQUESTS' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Manager Requests
            </button>
          </>
        )}

        {!user?.managerId && (
          <button
            onClick={() => setActiveTab('REQUEST_MANAGER')}
            className={`pb-3 font-medium transition-colors ${activeTab === 'REQUEST_MANAGER' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Request Manager
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {(activeTab === 'MY_REQUESTS' || activeTab === 'ADMIN') && (
          <section className="panel bg-gray-900 border border-gray-800 p-6 rounded-xl col-span-2">
            <h2 className="text-xl font-bold mb-4">Create request</h2>
            <form className="space-y-4" onSubmit={onCreate}>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Title</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Purchase new laptop" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Description (optional)</label>
                <textarea className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Category</label>
                  <select className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="GENERAL">General</option>
                    <option value="HARDWARE">Hardware</option>
                    <option value="SOFTWARE">Software</option>
                    <option value="FINANCE">Finance</option>
                    <option value="HR">HR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Amount</label>
                  <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2" value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Attachment</label>
                <div className="relative">
                  <input type="file" onChange={(e) => setFile(e.target.files[0])} className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 text-sm text-gray-400 file:mr-4 file:py-1.5 file:px-4 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-600/10 file:text-indigo-400 hover:file:bg-indigo-600/20 cursor-pointer" />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded font-medium disabled:opacity-50" type="submit" disabled={!canCreate || loading}>{loading ? 'Creating...' : 'Create'}</button>
                <button className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded font-medium" type="button" onClick={refresh} disabled={loading}>Refresh</button>
              </div>
            </form>
          </section>
        )}

        {(activeTab === 'INBOX' || activeTab === 'ADMIN') && (
          <section className={`panel bg-gray-900 border border-gray-800 p-6 rounded-xl ${activeTab === 'INBOX' ? 'col-span-3' : ''}`}>
            <h2 className="text-xl font-bold mb-4">Actions Setup</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Note (optional)</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Delegate role</label>
                <select className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2" value={delegateRole} onChange={(e) => setDelegateRole(e.target.value)}>
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Delegate name</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2" value={delegateName} onChange={(e) => setDelegateName(e.target.value)} placeholder="Backup approver" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Delegate email</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2" value={delegateEmail} onChange={(e) => setDelegateEmail(e.target.value)} placeholder="backup@company.com" />
              </div>
            </div>
          </section>
        )}
      </div>

      <section className="panel bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-gray-800 flex flex-col md:flex-row gap-4 justify-between md:items-center bg-gray-900/50">
          <div>
            <h2 className="text-xl font-bold">Requests</h2>
            {error && <div className="text-red-400 mt-2 text-sm">{error}</div>}
          </div>

          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded px-3 py-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="bg-transparent text-sm text-gray-300 outline-none" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="ALL">All Status</option>
                <option value="PENDING_MANAGER">Pending Manager</option>
                <option value="PENDING_DEPARTMENT">Pending Department</option>
                <option value="APPROVED">Approved</option>
                <option value="NEEDS_INFO">Needs Info</option>
                <option value="REJECTED">Rejected</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded px-3 py-1.5">
              <Filter className="w-4 h-4 text-gray-400" />
              <select className="bg-transparent text-sm text-gray-300 outline-none" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
                <option value="ALL">All Categories</option>
                <option value="GENERAL">General</option>
                <option value="HARDWARE">Hardware</option>
                <option value="SOFTWARE">Software</option>
                <option value="FINANCE">Finance</option>
                <option value="HR">HR</option>
              </select>
            </div>
            <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded px-3 py-1.5">
              <ArrowDownWideNarrow className="w-4 h-4 text-gray-400" />
              <select className="bg-transparent text-sm text-gray-300 outline-none" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="updatedAt">Latest Updates</option>
                <option value="amountCents">Highest Amount</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No requests match the criteria.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="p-4 font-medium border-b border-gray-800">ID</th>
                  <th className="p-4 font-medium border-b border-gray-800">Title</th>
                  <th className="p-4 font-medium border-b border-gray-800">Status</th>
                  <th className="p-4 font-medium border-b border-gray-800">Category</th>
                  <th className="p-4 font-medium border-b border-gray-800">Amount</th>
                  <th className="p-4 font-medium border-b border-gray-800">Created by</th>
                  <th className="p-4 font-medium border-b border-gray-800">Assigned</th>
                  <th className="p-4 font-medium border-b border-gray-800">Updated</th>
                  <th className="p-4 font-medium border-b border-gray-800">Actions</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-gray-800">
                {filteredItems.map((item) => {
                  const step = nextActionByStatus[item.status]
                  const canAdvance = canActOnRequest(user, item, step)
                  const canReject = ['PENDING_MANAGER', 'PENDING_DEPARTMENT'].includes(item.status) && canAdvance
                  const canRequestInfo = ['PENDING_MANAGER', 'PENDING_DEPARTMENT'].includes(item.status) && canAdvance
                  const canDelegate = ['PENDING_MANAGER', 'PENDING_DEPARTMENT'].includes(item.status) && canAdvance
                  const amountText = Number.isInteger(item.amountCents) ? (item.amountCents / 100).toFixed(2) : '-'
                  return (
                    <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="p-4 font-medium text-gray-400">#{item.id}</td>
                      <td className="p-4 font-medium">
                        {item.title}
                        {item.attachments && item.attachments.length > 0 && (
                          <a href={item.attachments[0].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 ml-2 text-xs text-indigo-400 hover:text-indigo-300">
                            <Paperclip className="w-3 h-3" /> File
                          </a>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold
                          ${item.status === 'PENDING_MANAGER' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : ''}
                          ${item.status === 'PENDING_DEPARTMENT' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : ''}
                          ${item.status === 'APPROVED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : ''}
                          ${item.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : ''}
                          ${item.status === 'NEEDS_INFO' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : ''}
                          ${item.status === 'ARCHIVED' ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20' : ''}
                        `}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-4 text-gray-300">{item.category}</td>
                      <td className="p-4 font-medium">${amountText}</td>
                      <td className="p-4 text-gray-300">{item.submitter?.displayName ?? 'Unknown'}</td>
                      <td className="p-4 text-gray-300">{item.assignedTo?.displayName ?? '-'}</td>
                      <td className="p-4 text-gray-400 text-xs">{new Date(item.updatedAt).toLocaleString()}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          {step ? (
                            <>
                              <button type="button" className="px-3 py-1 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded border border-indigo-500/30 transition disabled:opacity-30" onClick={() => onTransition(item, step)} disabled={!canAdvance}>
                                {step.label}
                              </button>
                              <button type="button" className="px-3 py-1 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded transition disabled:opacity-30" onClick={() => onTransition(item, { action: 'REQUEST_INFO' })} disabled={!canRequestInfo}>
                                Info
                              </button>
                              <button type="button" className="px-3 py-1 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded border border-red-500/30 transition disabled:opacity-30" onClick={() => onTransition(item, { action: 'REJECT' })} disabled={!canReject}>
                                Reject
                              </button>
                              <button type="button" className="px-3 py-1 bg-gray-800 text-gray-300 hover:bg-gray-700 rounded transition disabled:opacity-30" onClick={() => onDelegate(item)} disabled={!canDelegate}>
                                Delegate
                              </button>
                            </>
                          ) : (
                            <span className="text-gray-500 italic text-sm">Done</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

          {/* User Management Section */}
          {activeTab === 'USER_MANAGEMENT' && user?.role === 'ADMIN' && (
            <section className="panel bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
                <div>
                  <h2 className="text-xl font-bold">User Management</h2>
                  <p className="text-gray-400 mt-1 text-sm">Manage user roles, managers, and department assignments</p>
                </div>
                <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-medium transition" onClick={refreshUsers} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-medium border-b border-gray-800">User</th>
                    <th className="p-4 font-medium border-b border-gray-800">Email</th>
                    <th className="p-4 font-medium border-b border-gray-800">Role</th>
                    <th className="p-4 font-medium border-b border-gray-800">Department</th>
                    <th className="p-4 font-medium border-b border-gray-800">Manager</th>
                    <th className="p-4 font-medium border-b border-gray-800">Dept Head</th>
                    <th className="p-4 font-medium border-b border-gray-800">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-800">
                  {users.map((userItem) => (
                    <tr key={userItem.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="p-4 font-medium">{userItem.displayName}</td>
                      <td className="p-4 text-gray-300">{userItem.email}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold
                          ${userItem.role === 'ADMIN' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : ''}
                          ${userItem.role === 'USER' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : ''}
                        `}>
                          {userItem.role}
                        </span>
                      </td>
                      <td className="p-4 text-gray-300">{userItem.department || '-'}</td>
                      <td className="p-4 text-gray-300">{userItem.manager?.displayName || '-'}</td>
                      <td className="p-4 text-center">
                        {userItem.isDepartmentHead && (
                          <span className="px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded text-xs font-semibold">
                            Dept Head
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <select 
                            className="text-xs bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300"
                            value={userItem.role}
                            onChange={async (e) => {
                              try {
                                await updateUserRole(userItem.id, e.target.value);
                                await refreshUsers();
                              } catch (err) {
                                setError(err?.message || 'Failed to update role');
                              }
                            }}
                          >
                            <option value="USER">USER</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                          
                          <select 
                            className="text-xs bg-gray-950 border border-gray-800 rounded px-2 py-1 text-gray-300"
                            value={userItem.managerId || ''}
                            onChange={async (e) => {
                              try {
                                await updateUserManager(userItem.id, e.target.value || null);
                                await refreshUsers();
                              } catch (err) {
                                setError(err?.message || 'Failed to update manager');
                              }
                            }}
                          >
                            <option value="">No Manager</option>
                            {users.filter(u => u.id !== userItem.id).map(manager => (
                              <option key={manager.id} value={manager.id}>
                                {manager.displayName}
                              </option>
                            ))}
                          </select>
                          
                          <button
                            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2 py-1 rounded transition"
                            onClick={async () => {
                              try {
                                await updateUserDepartmentHead(userItem.id, !userItem.isDepartmentHead, userItem.department);
                                await refreshUsers();
                              } catch (err) {
                                setError(err?.message || 'Failed to update department head status');
                              }
                            }}
                          >
                            {userItem.isDepartmentHead ? 'Remove Dept Head' : 'Make Dept Head'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Request Manager Section */}
      {activeTab === 'REQUEST_MANAGER' && !user?.managerId && (
        <section className="panel bg-gray-900 border border-gray-800 p-6 rounded-xl mb-8 max-w-2xl mx-auto">
          <h2 className="text-xl font-bold mb-4">Request a Manager Assignment</h2>
          <p className="text-gray-400 mb-6 text-sm">
            Submit a request to be assigned a manager. An admin will review and approve your request.
          </p>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!requestedManagerId) {
                setError('Please select a manager.');
                return;
              }
              setError('');
              setLoading(true);
              try {
                await createManagerRequest(user.id, requestedManagerId, managerRequestReason);
                setManagerRequestReason('');
                setRequestedManagerId('');
                alert('Manager request submitted successfully!');
              } catch (err) {
                setError(err?.message || 'Failed to submit request');
              } finally {
                setLoading(false);
              }
            }}
          >
            {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Select Manager</label>
              <select 
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2"
                value={requestedManagerId}
                onChange={(e) => setRequestedManagerId(e.target.value)}
                onClick={() => {
                  if (users.length === 0) refreshUsers();
                }}
              >
                <option value="">-- Choose a manager --</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.displayName} ({u.email})</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Reason (Optional)</label>
              <textarea 
                className="w-full bg-gray-950 border border-gray-800 rounded px-3 py-2 h-20"
                value={managerRequestReason}
                onChange={(e) => setManagerRequestReason(e.target.value)}
                placeholder="Why are you requesting this manager?"
              />
            </div>
            
            <div className="pt-2">
              <button 
                type="submit" 
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded font-medium transition disabled:opacity-50"
                disabled={loading || !requestedManagerId}
              >
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Manager Requests Section */}
      {activeTab === 'MANAGER_REQUESTS' && user?.role === 'ADMIN' && (
        <section className="panel bg-gray-900 border border-gray-800 p-6 rounded-xl">
          <div className="p-6 border-b border-gray-800 flex justify-between items-center bg-gray-900/50">
            <div>
              <h2 className="text-xl font-bold">Manager Requests</h2>
              <p className="text-gray-400 mt-1 text-sm">Review and approve pending manager assignment requests</p>
            </div>
            <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded font-medium transition" onClick={loadManagerRequests}>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading manager requests...</div>
          ) : managerRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No pending manager requests.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-950/50 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="p-4 font-medium border-b border-gray-800">User</th>
                    <th className="p-4 font-medium border-b border-gray-800">Email</th>
                    <th className="p-4 font-medium border-b border-gray-800">Department</th>
                    <th className="p-4 font-medium border-b border-gray-800">Requested Manager</th>
                    <th className="p-4 font-medium border-b border-gray-800">Reason</th>
                    <th className="p-4 font-medium border-b border-gray-800">Status</th>
                    <th className="p-4 font-medium border-b border-gray-800">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-800">
                  {managerRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="p-4 font-medium">{request.user.displayName}</td>
                      <td className="p-4 text-gray-300">{request.user.email}</td>
                      <td className="p-4 text-gray-300">{request.user.department || '-'}</td>
                      <td className="p-4 text-gray-300">{request.requestedManager?.displayName || '-'}</td>
                      <td className="p-4 text-gray-300">{request.reason}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold
                          ${request.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : ''}
                        `}>
                          {request.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button 
                            className="px-3 py-1 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white rounded border border-green-500/30 transition disabled:opacity-30"
                            onClick={async () => {
                              try {
                                await approveManagerRequest(request.id, user.id, request.requestedManagerId);
                                await loadManagerRequests();
                                alert('Manager request approved successfully!');
                              } catch (err) {
                                setError(err?.message || 'Failed to approve request');
                              }
                            }}
                          >
                            Approve
                          </button>
                          <button 
                            className="px-3 py-1 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded border border-red-500/30 transition disabled:opacity-30"
                            onClick={async () => {
                              try {
                                await rejectManagerRequest(request.id, user.id, 'Rejected by admin');
                                await loadManagerRequests();
                                alert('Manager request rejected successfully!');
                              } catch (err) {
                                setError(err?.message || 'Failed to reject request');
                              }
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
