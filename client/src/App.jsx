import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { createRequest, delegateRequest, devLogin, getSession, listRequests, logout, transitionRequest } from './api'

const nextActionByStatus = {
  REQUEST: { action: 'REVIEW', label: 'Send to Review', roles: ['REVIEWER', 'ADMIN'] },
  REVIEW: { action: 'APPROVE', label: 'Approve', roles: ['APPROVER', 'ADMIN'] },
  NEEDS_INFO: { action: 'RESUBMIT', label: 'Resubmit', roles: ['USER', 'ADMIN'] },
  APPROVE: { action: 'ARCHIVE', label: 'Archive', roles: ['APPROVER', 'ADMIN'] },
  ARCHIVE: null,
  REJECTED: null,
}

const rejectRoles = ['REVIEWER', 'APPROVER', 'ADMIN']
const infoRoles = ['REVIEWER', 'APPROVER', 'ADMIN']
const delegateRoles = ['REVIEWER', 'APPROVER', 'ADMIN']

function canUseRole(user, roles) {
  return user && roles.includes(user.role)
}

function App() {
  const [user, setUser] = useState(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [loginName, setLoginName] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginRole, setLoginRole] = useState('USER')
  const [loginDepartment, setLoginDepartment] = useState('')

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('GENERAL')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [delegateName, setDelegateName] = useState('')
  const [delegateEmail, setDelegateEmail] = useState('')
  const [delegateRole, setDelegateRole] = useState('REVIEWER')

  const canCreate = useMemo(() => {
    return Boolean(user) && title.trim().length >= 3 && (amount.trim() === '' || Number.isFinite(Number(amount)))
  }, [user, title, amount])

  const refresh = useCallback(async () => {
    if (!user) return
    setError('')
    setLoading(true)
    try {
      const list = await listRequests()
      setItems(list)
    } catch (e) {
      setError(e?.message ?? 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    async function loadSession() {
      try {
        const activeUser = await getSession()
        setUser(activeUser)
      } catch {
        setUser(null)
      } finally {
        setSessionLoading(false)
      }
    }

    loadSession()
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function onLogin(e) {
    e.preventDefault()
    setError('')
    try {
      const activeUser = await devLogin({
        displayName: loginName.trim(),
        email: loginEmail.trim(),
        role: loginRole,
        department: loginDepartment.trim(),
      })
      setUser(activeUser)
    } catch (e2) {
      setError(e2?.message ?? 'Failed to sign in')
    }
  }

  async function onLogout() {
    await logout()
    setUser(null)
    setItems([])
  }

  async function onCreate(e) {
    e.preventDefault()
    if (!canCreate) return

    setError('')
    try {
      await createRequest({
        title: title.trim(),
        description: description.trim(),
        category,
        amountCents: amount.trim() ? Math.round(Number(amount) * 100) : undefined,
      })
      setTitle('')
      setDescription('')
      setAmount('')
      await refresh()
    } catch (e2) {
      setError(e2?.message ?? 'Failed to create')
    }
  }

  async function onDelegate(item) {
    if (delegateName.trim().length < 2) {
      setError('Enter a delegate name.')
      return
    }

    setError('')
    try {
      await delegateRequest(item.id, {
        displayName: delegateName.trim(),
        email: delegateEmail.trim(),
        role: delegateRole,
        department: user.department ?? '',
        note: note.trim() ? note.trim() : undefined,
      })
      await refresh()
    } catch (e2) {
      setError(e2?.message ?? 'Failed to delegate')
    }
  }

  async function onTransition(item, step) {
    if (!step) return

    setError('')
    try {
      await transitionRequest(item.id, {
        action: step.action,
        note: note.trim() ? note.trim() : undefined,
      })
      await refresh()
    } catch (e2) {
      setError(e2?.message ?? 'Failed to transition')
    }
  }

  if (sessionLoading) {
    return (
      <div className="container">
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container">
        <header className="header">
          <h1>Digital Approval Workflow</h1>
          <p className="subtitle">Sign in to continue</p>
        </header>

        <section className="panel">
          <h2>Development sign in</h2>
          {error ? <div className="error">{error}</div> : null}
          <form className="form" onSubmit={onLogin}>
            <label>
              Name
              <input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="Your name" />
            </label>
            <label>
              Email
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="name@company.com" />
            </label>
            <label>
              Role
              <select value={loginRole} onChange={(e) => setLoginRole(e.target.value)}>
                <option value="USER">Employee</option>
                <option value="REVIEWER">Reviewer / Manager</option>
                <option value="APPROVER">Approver</option>
                <option value="ADMIN">Admin</option>
              </select>
            </label>
            <label>
              Department
              <input value={loginDepartment} onChange={(e) => setLoginDepartment(e.target.value)} placeholder="e.g. Finance" />
            </label>
            <button type="submit" disabled={loginName.trim().length < 2}>Sign in</button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>Digital Approval Workflow</h1>
          <p className="subtitle">Request - Review - Approve - Archive</p>
        </div>
        <div className="session">
          <span>{user.displayName} / {user.role}</span>
          <button type="button" className="secondary" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <section className="panel">
        <h2>Create request</h2>
        <form className="form" onSubmit={onCreate}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Purchase new laptop" />
          </label>
          <label>
            Description (optional)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>
          <div className="form two">
            <label>
              Category
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="GENERAL">General</option>
                <option value="HARDWARE">Hardware</option>
                <option value="SOFTWARE">Software</option>
                <option value="FINANCE">Finance</option>
                <option value="HR">HR</option>
              </select>
            </label>
            <label>
              Amount
              <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" />
            </label>
          </div>

          <div className="row">
            <button type="submit" disabled={!canCreate}>Create</button>
            <button type="button" onClick={refresh} disabled={loading}>Refresh</button>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Actions</h2>
        <div className="form two">
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note" />
          </label>
          <label>
            Delegate role
            <select value={delegateRole} onChange={(e) => setDelegateRole(e.target.value)}>
              <option value="REVIEWER">Reviewer</option>
              <option value="APPROVER">Approver</option>
            </select>
          </label>
          <label>
            Delegate name
            <input value={delegateName} onChange={(e) => setDelegateName(e.target.value)} placeholder="Backup approver" />
          </label>
          <label>
            Delegate email
            <input value={delegateEmail} onChange={(e) => setDelegateEmail(e.target.value)} placeholder="backup@company.com" />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Requests</h2>

        {error ? <div className="error">{error}</div> : null}

        {loading ? (
          <p>Loading...</p>
        ) : items.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Created by</th>
                <th>Assigned</th>
                <th>SLA</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const step = nextActionByStatus[item.status]
                const canAdvance = step && canUseRole(user, step.roles)
                const canReject = step && canUseRole(user, rejectRoles)
                const canRequestInfo = ['REVIEW', 'APPROVE'].includes(item.status) && canUseRole(user, infoRoles)
                const canDelegate = step && canUseRole(user, delegateRoles)
                const amountText = Number.isInteger(item.amountCents) ? (item.amountCents / 100).toFixed(2) : '-'
                return (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td className="title">{item.title}</td>
                    <td><span className={`badge s-${item.status}`}>{item.status}</span></td>
                    <td>{item.category}</td>
                    <td>{amountText}</td>
                    <td>{item.createdBy}</td>
                    <td>{item.assignedTo ?? '-'}</td>
                    <td className={item.isOverdue ? 'danger' : ''}>{item.dueAt ? new Date(item.dueAt).toLocaleDateString() : '-'}</td>
                    <td>{new Date(item.updatedAt).toLocaleString()}</td>
                    <td className="actions">
                      {step ? (
                        <>
                          <button type="button" onClick={() => onTransition(item, step)} disabled={!canAdvance}>
                            {step.label}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => onTransition(item, { action: 'REQUEST_INFO' })}
                            disabled={!canRequestInfo}
                          >
                            Needs Info
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => onTransition(item, { action: 'REJECT' })}
                            disabled={!canReject}
                          >
                            Reject
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            onClick={() => onDelegate(item)}
                            disabled={!canDelegate}
                          >
                            Delegate
                          </button>
                        </>
                      ) : (
                        <span className="muted">Done</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default App
