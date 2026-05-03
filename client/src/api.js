async function httpJson(path, options) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  })

  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }

  if (!res.ok) {
    const err = new Error(data?.error ?? `HTTP_${res.status}`)
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}

export async function listRequests() {
  const data = await httpJson('/api/requests')
  return data.items
}

export async function createRequest(payload) {
  const data = await httpJson('/api/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.item
}

export async function transitionRequest(id, payload) {
  const data = await httpJson(`/api/requests/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.item
}
