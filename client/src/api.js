async function httpJson(path, options) {
  const res = await fetch(path, {
    credentials: 'include',
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

export async function getSession() {
  const data = await httpJson('/api/session')
  return data.user
}

export async function register(payload) {
  const data = await httpJson('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.user
}

export async function login(payload) {
  const data = await httpJson('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.user
}

export async function logout() {
  await httpJson('/api/auth/logout', {
    method: 'POST',
  })
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

export async function delegateRequest(id, payload) {
  const data = await httpJson(`/api/requests/${id}/delegate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.item
}

export async function uploadAttachment(requestId, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/requests/${requestId}/attachments`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  const data = await res.json()
  if (!res.ok) {
    const err = new Error(data?.error ?? `HTTP_${res.status}`)
    err.status = res.status
    throw err
  }
  return data.attachment
}

export async function listUsers() { 
  const data = await httpJson('/api/admin/users'); 
  return data.users; 
}

export async function updateUserRole(userId, role) {
  const data = await httpJson(`/api/admin/users/${userId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role })
  });
  return data.user;
}

export async function updateUserManager(userId, managerId) {
  const data = await httpJson(`/api/admin/users/${userId}/manager`, {
    method: 'PUT',
    body: JSON.stringify({ managerId })
  });
  return data.user;
}

export async function updateUserDepartmentHead(userId, isDepartmentHead, department) {
  const data = await httpJson(`/api/admin/users/${userId}/department-head`, {
    method: 'PUT',
    body: JSON.stringify({ isDepartmentHead, department })
  });
  return data.user;
}

export async function createManagerRequest(requestedManagerId, reason) {
  const data = await httpJson('/api/manager-requests', {
    method: 'POST',
    body: JSON.stringify({ requestedManagerId, reason })
  });
  return data.request;
}

export async function getManagerRequests() {
  const data = await httpJson('/api/admin/manager-requests');
  return data.requests;
}

export async function approveManagerRequest(requestId, managerId) {
  const data = await httpJson(`/api/admin/manager-requests/${requestId}/approve`, {
    method: 'PUT',
    body: JSON.stringify({ managerId })
  });
  return data.request;
}

export async function rejectManagerRequest(requestId, reason) {
  const data = await httpJson(`/api/admin/manager-requests/${requestId}/reject`, {
    method: 'PUT',
    body: JSON.stringify({ reason })
  });
  return data.request;
}

