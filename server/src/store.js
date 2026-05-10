import { PrismaClient } from '@prisma/client';
import { sendNotification } from './notification.js';

const prisma = new PrismaClient();

export const allowedTransitions = {
  PENDING_MANAGER: { REVIEW: 'PENDING_DEPARTMENT', REJECT: 'REJECTED', REQUEST_INFO: 'NEEDS_INFO' },
  PENDING_DEPARTMENT: { APPROVE: 'APPROVED', REQUEST_INFO: 'NEEDS_INFO', REJECT: 'REJECTED' },
  NEEDS_INFO: { RESUBMIT: 'PENDING_MANAGER', REJECT: 'REJECTED' },
  APPROVED: { ARCHIVE: 'ARCHIVED', REQUEST_INFO: 'NEEDS_INFO', REJECT: 'REJECTED' },
  ARCHIVED: {},
  REJECTED: {}
};

const REVIEW_SLA_DAYS = 7;

// Pure RBAC function — exported so it can be unit/property tested independently.
// Implements the authorization matrix from the design document.
// request must have: { submitterId, assignedToId, status, submitter: { managerId, department } }
export function canActOnRequest(user, request, action) {
  if (user.role === 'ADMIN') return true;

  // Delegated user can perform any action on the request they are assigned to
  if (request.assignedToId === user.id) return true;

  // Only the original submitter may RESUBMIT
  if (action === 'RESUBMIT') {
    return request.submitterId === user.id;
  }

  // Manager of the submitter may act on PENDING_MANAGER requests
  // and may also REQUEST_INFO, REJECT, or DELEGATE on any status where they are the actor
  if (request.status === 'PENDING_MANAGER' && request.submitter.managerId === user.id) {
    return true;
  }

  // Department head (same department as submitter) may act on PENDING_DEPARTMENT and APPROVED requests
  // and may also REQUEST_INFO, REJECT, or DELEGATE on those statuses
  const isDeptHeadForSubmitter =
    user.isDepartmentHead &&
    user.department &&
    request.submitter.department === user.department;

  if (
    (request.status === 'PENDING_DEPARTMENT' || request.status === 'APPROVED') &&
    isDeptHeadForSubmitter
  ) {
    return true;
  }

  // REQUEST_INFO, REJECT, DELEGATE: manager can act on PENDING_MANAGER;
  // dept head can act on PENDING_DEPARTMENT and APPROVED (already covered above).
  // NEEDS_INFO: manager of submitter may REJECT
  if (request.status === 'NEEDS_INFO' && request.submitter.managerId === user.id) {
    if (action === 'REJECT') return true;
  }

  return false;
}

function toApiRequest(request) {
  const dueAt = request.dueAt?.toISOString?.() ?? request.dueAt ?? null;

  return {
    id: request.id,
    title: request.title,
    description: request.description,
    category: request.category,
    amountCents: request.amountCents,
    createdBy: request.submitter.displayName,
    submitter: {
      id: request.submitter.id,
      displayName: request.submitter.displayName,
      email: request.submitter.email,
      department: request.submitter.department,
      managerId: request.submitter.managerId
    },
    assignedTo: request.assignedTo ? {
      id: request.assignedTo.id,
      displayName: request.assignedTo.displayName,
      email: request.assignedTo.email
    } : null,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    dueAt,
    isOverdue: Boolean(dueAt && new Date(dueAt).getTime() < Date.now() && ['PENDING_MANAGER', 'PENDING_DEPARTMENT'].includes(request.status)),
    history: request.history.map((entry) => ({
      id: entry.id,
      at: entry.createdAt,
      from: entry.fromStatus,
      to: entry.toStatus,
      by: entry.actor.displayName,
      note: entry.note,
      action: entry.action,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent
    })),
    attachments: request.attachments?.map((att) => ({
      id: att.id,
      filename: att.filename,
      url: `/api/uploads/${att.filename}`,
      mimetype: att.mimetype,
      sizeBytes: att.sizeBytes,
      createdAt: att.createdAt
    })) || []
  };
}

export async function listUsers() { return prisma.user.findMany({ select: { id: true, displayName: true, email: true, department: true, role: true, isDepartmentHead: true } }); }
export async function getUserById(id) {
  return prisma.user.findUnique({
    where: { id }
  });
}

export async function getUserByEmail(email) {
  return prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() }
  });
}

export async function createUser({ displayName, email, passwordHash, role = 'USER', department = null, managerId = null, isDepartmentHead = false }) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = displayName.trim();

  return prisma.user.create({
    data: {
      displayName: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role,
      department,
      managerId,
      isDepartmentHead
    }
  });
}

export async function updateUser(userId, { managerId, department, isDepartmentHead, role }) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(managerId !== undefined && { managerId }),
      ...(department !== undefined && { department }),
      ...(isDepartmentHead !== undefined && { isDepartmentHead }),
      ...(role !== undefined && { role })
    }
  });
}

// Manager Request functions
export async function createManagerRequest({ userId, requestedManagerId, reason }) {
  // Check if user already has a pending request
  const existingRequest = await prisma.managerRequest.findFirst({
    where: {
      userId,
      status: 'PENDING'
    }
  });

  if (existingRequest) {
    throw new Error('PENDING_MANAGER_REQUEST_EXISTS');
  }

  // Update user to indicate they have requested a manager
  await prisma.user.update({
    where: { id: userId },
    data: {
      hasRequestedManager: true,
      managerRequestCreatedAt: new Date()
    }
  });

  return prisma.managerRequest.create({
    data: {
      userId,
      requestedManagerId,
      reason,
      status: 'PENDING'
    },
    include: {
      user: true,
      requestedManager: true
    }
  });
}

export async function listManagerRequests() {
  return prisma.managerRequest.findMany({
    where: {
      status: 'PENDING'
    },
    include: {
      user: {
        select: { id: true, displayName: true, email: true, department: true }
      },
      requestedManager: {
        select: { id: true, displayName: true, email: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
}

export async function approveManagerRequest(requestId, adminId, managerId) {
  const request = await prisma.managerRequest.findUnique({
    where: { id: requestId },
    include: { user: true }
  });

  if (!request) {
    throw new Error('MANAGER_REQUEST_NOT_FOUND');
  }

  if (request.status !== 'PENDING') {
    throw new Error('MANAGER_REQUEST_ALREADY_PROCESSED');
  }

  // Update the request
  const updatedRequest = await prisma.managerRequest.update({
    where: { id: requestId },
    data: {
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedByAdminId: adminId
    }
  });

  // Update user with assigned manager
  await prisma.user.update({
    where: { id: request.userId },
    data: {
      managerId,
      hasRequestedManager: false,
      managerRequestCreatedAt: null
    }
  });

  return updatedRequest;
}

export async function rejectManagerRequest(requestId, adminId, reason) {
  const request = await prisma.managerRequest.findUnique({
    where: { id: requestId },
    include: { user: true }
  });

  if (!request) {
    throw new Error('MANAGER_REQUEST_NOT_FOUND');
  }

  if (request.status !== 'PENDING') {
    throw new Error('MANAGER_REQUEST_ALREADY_PROCESSED');
  }

  // Update the request
  const updatedRequest = await prisma.managerRequest.update({
    where: { id: requestId },
    data: {
      status: 'REJECTED',
      reviewedAt: new Date(),
      reviewedByAdminId: adminId,
      reason
    }
  });

  // Update user to remove manager request flag
  await prisma.user.update({
    where: { id: request.userId },
    data: {
      hasRequestedManager: false,
      managerRequestCreatedAt: null
    }
  });

  return updatedRequest;
}

export async function ensureUserByIdentity({ displayName, email, role = 'USER', department = null }) {
  const normalizedEmail = email?.trim().toLowerCase() || null;
  const normalizedName = displayName.trim();

  if (normalizedEmail) {
    return prisma.user.upsert({
      where: { email: normalizedEmail },
      update: {
        displayName: normalizedName,
        role,
        department
      },
      create: {
        displayName: normalizedName,
        email: normalizedEmail,
        role,
        department
      }
    });
  }

  const existing = await prisma.user.findFirst({
    where: { displayName: normalizedName }
  });

  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { role, department }
    });
  }

  return prisma.user.create({
    data: {
      displayName: normalizedName,
      role,
      department
    }
  });
}

const requestInclude = {
  submitter: true,
  assignedTo: true,
  history: {
    orderBy: { createdAt: 'asc' },
    include: { actor: true }
  },
  attachments: true
};

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function getConditionalInitialStatus({ category, amountCents, submitter }) {
  // Auto-approve low-value hardware requests (Requirement 4.1)
  if (category === 'HARDWARE' && typeof amountCents === 'number' && amountCents < 50000) {
    return 'APPROVED';
  }
  // If the user has no manager, directly to PENDING_DEPARTMENT
  if (!submitter.managerId) {
    return 'PENDING_DEPARTMENT';
  }
  return 'PENDING_MANAGER';
}

function getDueAtForStatus(status) {
  return ['PENDING_MANAGER', 'PENDING_DEPARTMENT'].includes(status) ? addDays(new Date(), REVIEW_SLA_DAYS) : null;
}

// Pure visibility predicate — exported for testing.
// Returns true if the given non-ADMIN user should be able to see the request.
export function isVisibleToUser(user, request) {
  if (user.role === 'ADMIN') return true;
  if (request.submitterId === user.id) return true;
  if (request.assignedToId === user.id) return true;
  if (request.submitter.managerId === user.id) return true;
  if (user.isDepartmentHead && user.department && request.submitter.department === user.department) return true;
  return false;
}

export async function listRequests({ user }) {
  let where = {};

  if (user.role === 'ADMIN') {
    where = { isDeleted: false };
  } else {
    // A regular user can see:
    // 1. Their own requests
    // 2. Requests assigned directly to them
    // 3. Requests from folks they manage
    // 4. Requests in their department if they are a department head

    where = {
      isDeleted: false,
      OR: [
        { submitterId: user.id },
        { assignedToId: user.id },
        { submitter: { managerId: user.id } },
        ...(user.isDepartmentHead ? [{ submitter: { department: user.department } }] : [])
      ]
    };
  }

  const requests = await prisma.workflowRequest.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: requestInclude
  });

  return requests.map(toApiRequest);
}

export async function getRequestById(id, { user }) {
  const request = await prisma.workflowRequest.findFirst({
    where: { id, isDeleted: false },
    include: requestInclude
  });

  if (!request) return null;
  if (user.role === 'ADMIN') return toApiRequest(request);
  if (request.submitterId === user.id) return toApiRequest(request);
  if (request.assignedToId === user.id) return toApiRequest(request);
  if (request.submitter.managerId === user.id) return toApiRequest(request);
  if (user.isDepartmentHead && request.submitter.department === user.department) return toApiRequest(request);

  return null;
}

export async function createRequest({ title, description, category, amountCents, user, context = {} }) {
  // Check if user has an assigned manager or has requested one
  if (!user.managerId && !user.hasRequestedManager) {
    throw new Error('MANAGER_REQUIRED');
  }

  const normalizedCategory = category ?? 'GENERAL';
  const initialStatus = getConditionalInitialStatus({ category: normalizedCategory, amountCents, submitter: user });
  const dueAt = getDueAtForStatus(initialStatus);
  const isAutoApproved = initialStatus === 'APPROVED';

  const request = await prisma.workflowRequest.create({
    data: {
      title,
      description,
      category: normalizedCategory,
      amountCents,
      status: initialStatus,
      dueAt,
      submitterId: user.id,
      history: {
        create: [
          {
            actorId: user.id,
            action: 'CREATE',
            note: isAutoApproved ? 'Auto-approved: HARDWARE request under $500' : 'Created',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent,
            toStatus: initialStatus
          }
        ]
      }
    },
    include: requestInclude
  });

  return toApiRequest(request);
}

export async function transitionRequest({ id, action, user, note, context = {} }) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.workflowRequest.findFirst({
      where: { id, isDeleted: false },
      include: {
        submitter: {
          include: { manager: true }
        }
      }
    });

    if (!request) return { error: 'NOT_FOUND' };
    if (!canActOnRequest(user, request, action)) return { error: 'FORBIDDEN' };

    const from = request.status;
    const to = allowedTransitions[from]?.[action] ?? null;

    if (!to) {
      return {
        error: 'INVALID_TRANSITION',
        details: { from, action }
      };
    }

    await tx.workflowRequest.update({
      where: { id },
      data: {
        status: to,
        dueAt: getDueAtForStatus(to),
        history: {
          create: {
            actorId: user.id,
            action: 'TRANSITION',
            fromStatus: from,
            toStatus: to,
            note: note ?? null,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent
          }
        }
      }
    });

    const updated = await tx.workflowRequest.findUnique({
      where: { id },
      include: requestInclude
    });

    // Send notifications after the DB write — failures must not abort the transition.
    // Requirements 12.1, 12.2, 12.3, 12.4
    try {
      if (to === 'PENDING_MANAGER') {
        // Notify the submitter's manager (Requirement 12.1)
        const manager = request.submitter.manager;
        if (manager?.email) {
          await sendNotification(
            manager.email,
            `Action required: "${request.title}" is pending your review`,
            `Hi ${manager.displayName},\n\nA request titled "${request.title}" has been submitted by ${request.submitter.displayName} and is awaiting your review.\n\nPlease log in to the workflow system to take action.`
          );
        }
      } else if (to === 'PENDING_DEPARTMENT') {
        // Notify the department head (Requirement 12.2)
        const deptHead = await tx.user.findFirst({
          where: {
            isDepartmentHead: true,
            department: request.submitter.department
          }
        });
        if (deptHead?.email) {
          await sendNotification(
            deptHead.email,
            `Action required: "${request.title}" is pending department approval`,
            `Hi ${deptHead.displayName},\n\nA request titled "${request.title}" from ${request.submitter.displayName} requires department approval.\n\nPlease log in to the workflow system to take action.`
          );
        }
      } else if (to === 'APPROVED' || to === 'REJECTED') {
        // Notify the submitter (Requirement 12.3)
        const submitter = request.submitter;
        if (submitter?.email) {
          const outcome = to === 'APPROVED' ? 'approved' : 'rejected';
          await sendNotification(
            submitter.email,
            `Your request "${request.title}" has been ${outcome}`,
            `Hi ${submitter.displayName},\n\nYour request titled "${request.title}" has been ${outcome}.\n\nPlease log in to the workflow system for more details.`
          );
        }
      }
    } catch (err) {
      // Requirement 12.4: email failure must not prevent the transition from completing
      // eslint-disable-next-line no-console
      console.error('Notification error (non-fatal):', err);
    }

    return { request: toApiRequest(updated) };
  });
}

export async function delegateRequest({ id, assignee, user, note, context = {} }) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.workflowRequest.findFirst({
      where: { id, isDeleted: false },
      include: { submitter: true }
    });

    if (!request) return { error: 'NOT_FOUND' };
    // Check terminal states before RBAC — Requirement 5.3 takes precedence
    if (['ARCHIVED', 'REJECTED'].includes(request.status)) {
      return { error: 'INVALID_TRANSITION', details: { from: request.status, action: 'DELEGATE' } };
    }
    if (!canActOnRequest(user, request)) {
      return { error: 'FORBIDDEN' };
    }

    const normalizedEmail = assignee.email?.trim().toLowerCase() || null;
    const normalizedName = assignee.displayName.trim();
    let target = normalizedEmail
      ? await tx.user.findUnique({ where: { email: normalizedEmail } })
      : await tx.user.findFirst({ where: { displayName: normalizedName } });

    if (target) {
      target = await tx.user.update({
        where: { id: target.id },
        data: {
          role: assignee.role,
          department: assignee.department || target.department || user.department || null
        }
      });
    } else {
      target = await tx.user.create({
        data: {
          displayName: normalizedName,
          email: normalizedEmail,
          role: assignee.role,
          department: assignee.department || user.department || null
        }
      });
    }

    await tx.workflowRequest.update({
      where: { id },
      data: {
        assignedToId: target.id,
        history: {
          create: {
            actorId: user.id,
            action: 'DELEGATE',
            fromStatus: request.status,
            toStatus: request.status,
            note: note || `Delegated to ${target.displayName}`,
            ipAddress: context.ipAddress,
            userAgent: context.userAgent
          }
        }
      }
    });

    const updated = await tx.workflowRequest.findUnique({
      where: { id },
      include: requestInclude
    });

    return { request: toApiRequest(updated) };
  });
}

export async function addAttachmentToRequest({ requestId, filename, path, mimetype, sizeBytes }) {
  const attachment = await prisma.attachment.create({
    data: {
      requestId,
      filename,
      path,
      mimetype,
      sizeBytes
    }
  });
  return attachment;
}
