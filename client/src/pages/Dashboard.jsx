import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRequest, delegateRequest, listRequests, transitionRequest, uploadAttachment } from '../api';
import { useAuth } from '../AuthContext';
import { Paperclip, Filter, ArrowDownWideNarrow } from 'lucide-react';

const nextActionByStatus = {
  REQUEST: { action: 'REVIEW', label: 'Send to Review', roles: ['REVIEWER', 'ADMIN'] },
  REVIEW: { action: 'APPROVE', label: 'Approve', roles: ['APPROVER', 'ADMIN'] },
  NEEDS_INFO: { action: 'RESUBMIT', label: 'Resubmit', roles: ['USER', 'ADMIN'] },
  APPROVE: { action: 'ARCHIVE', label: 'Archive', roles: ['APPROVER', 'ADMIN'] },
  ARCHIVE: null,
  REJECTED: null,
};

const rejectRoles = ['REVIEWER', 'APPROVER', 'ADMIN'];
const infoRoles = ['REVIEWER', 'APPROVER', 'ADMIN'];
const delegateRoles = ['REVIEWER', 'APPROVER', 'ADMIN'];

function canUseRole(user, roles) {
  return user && roles.includes(user.role);
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState(
    user?.role === 'ADMIN' ? 'ADMIN' : (['REVIEWER', 'APPROVER'].includes(user?.role) ? 'INBOX' : 'MY_REQUESTS')
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [delegateName, setDelegateName] = useState('');
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegateRole, setDelegateRole] = useState('REVIEWER');
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
        if (step && canUseRole(user, step.roles)) return true;
        if (i.assignedTo && i.assignedTo.email === user?.email) return true;
        return false;
      });
    }

    return list
      .filter(i => filterStatus === 'ALL' || i.status === filterStatus)
      .filter(i => filterCategory === 'ALL' || i.category === filterCategory)
      .sort((a, b) => {
        if (sortBy === 'amountCents') {
          return (b.amountCents || 0) - (a.amountCents || 0);
        }
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
  }, [items, filterStatus, filterCategory, sortBy, activeTab, user]);

  const canCreate = useMemo(() => {
    return Boolean(user) && title.trim().length >= 3 && (amount.trim() === '' || Number.isFinite(Number(amount)));
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

  useEffect(() => {
    refresh();
  }, [refresh]);

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
        
        {['REVIEWER', 'APPROVER', 'ADMIN'].includes(user?.role) && (
          <button 
            onClick={() => setActiveTab('INBOX')} 
            className={`pb-3 font-medium transition-colors ${activeTab === 'INBOX' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Inbox (Action Required)
          </button>
        )}

        {user?.role === 'ADMIN' && (
          <button 
            onClick={() => setActiveTab('ADMIN')} 
            className={`pb-3 font-medium transition-colors ${activeTab === 'ADMIN' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Admin View
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
                <option value="REVIEWER">Reviewer</option>
                <option value="APPROVER">Approver</option>
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
                <option value="REQUEST">Requested</option>
                <option value="REVIEW">In Review</option>
                <option value="APPROVE">Approved</option>
                <option value="NEEDS_INFO">Needs Info</option>
                <option value="REJECTED">Rejected</option>
                <option value="ARCHIVE">Archived</option>
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
                  const canAdvance = step && canUseRole(user, step.roles)
                  const canReject = step && canUseRole(user, rejectRoles)
                  const canRequestInfo = ['REVIEW', 'APPROVE'].includes(item.status) && canUseRole(user, infoRoles)
                  const canDelegate = step && canUseRole(user, delegateRoles)
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
                          ${item.status === 'REQUEST' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : ''}
                          ${item.status === 'REVIEW' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : ''}
                          ${item.status === 'APPROVE' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : ''}
                          ${item.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : ''}
                          ${item.status === 'NEEDS_INFO' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : ''}
                          ${item.status === 'ARCHIVE' ? 'bg-gray-500/10 text-gray-400 border border-gray-500/20' : ''}
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
    </div>
  );
}
