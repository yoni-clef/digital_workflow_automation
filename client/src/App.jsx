import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { createRequest, listRequests, transitionRequest } from './api'

const nextActionByStatus = {
  REQUEST: { action: 'REVIEW', label: 'Send to Review' },
  REVIEW: { action: 'APPROVE', label: 'Approve' },
  APPROVE: { action: 'ARCHIVE', label: 'Archive' },
  ARCHIVE: null,
}

function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [createdBy, setCreatedBy] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  const [actor, setActor] = useState('')
  const [note, setNote] = useState('')

  const canCreate = useMemo(() => {
    return createdBy.trim().length >= 2 && title.trim().length >= 3
  }, [createdBy, title])

  async function refresh() {
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
  }

  useEffect(() => {
    refresh()
  }, [])

  async function onCreate(e) {
    e.preventDefault()
    if (!canCreate) return

    setError('')
    try {
      await createRequest({
        title: title.trim(),
        description: description.trim(),
        createdBy: createdBy.trim(),
      })
      setTitle('')
      setDescription('')
      await refresh()
    } catch (e2) {
      setError(e2?.message ?? 'Failed to create')
    }
  }

  async function onAdvance(item) {
    const step = nextActionByStatus[item.status]
    if (!step) return
    if (actor.trim().length < 2) {
      setError('Enter your name in “Action by” to move items forward.')
      return
    }

    setError('')
    try {
      await transitionRequest(item.id, {
        action: step.action,
        by: actor.trim(),
        note: note.trim() ? note.trim() : undefined,
      })
      await refresh()
    } catch (e2) {
      setError(e2?.message ?? 'Failed to transition')
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1>Digital Approval Workflow</h1>
        <p className="subtitle">Request → Review → Approve → Archive</p>
      </header>

      <section className="panel">
        <h2>Create request</h2>
        <form className="form" onSubmit={onCreate}>
          <label>
            Created by
            <input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} placeholder="Your name" />
          </label>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Purchase new laptop" />
          </label>
          <label>
            Description (optional)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </label>

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
            Action by
            <input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Reviewer / approver name" />
          </label>
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Short note" />
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Requests</h2>

        {error ? <div className="error">{error}</div> : null}

        {loading ? (
          <p>Loading…</p>
        ) : items.length === 0 ? (
          <p>No requests yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Created by</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const step = nextActionByStatus[item.status]
                return (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td className="title">{item.title}</td>
                    <td><span className={`badge s-${item.status}`}>{item.status}</span></td>
                    <td>{item.createdBy}</td>
                    <td>{new Date(item.updatedAt).toLocaleString()}</td>
                    <td className="actions">
                      {step ? (
                        <button type="button" onClick={() => onAdvance(item)}>
                          {step.label}
                        </button>
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
