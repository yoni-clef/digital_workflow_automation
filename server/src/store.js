import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const allowedTransitions = {
  REQUEST: { REVIEW: 'REVIEW', REJECT: 'REJECTED' },
  REVIEW: { APPROVE: 'APPROVE', REQUEST_INFO: 'NEEDS_INFO', REJECT: 'REJECTED' },
  NEEDS_INFO: { RESUBMIT: 'REVIEW', REJECT: 'REJECTED' },
  APPROVE: { ARCHIVE: 'ARCHIVE', REQUEST_INFO: 'NEEDS_INFO', REJECT: 'REJECTED' },
  ARCHIVE: {},
  REJECTED: {}
};

const transitionRoles = {
  REVIEW: ['REVIEWER', 'ADMIN'],
  RESUBMIT: ['USER', 'ADMIN'],
  APPROVE: ['APPROVER', 'ADMIN'],
  ARCHIVE: ['APPROVER', 'ADMIN'],
  REQUEST_INFO: ['REVIEWER', 'APPROVER', 'ADMIN'],
  REJECT: ['REVIEWER', 'APPROVER', 'ADMIN']
};

const REVIEW_SLA_DAYS = 7;

function canUseAction(user, action) {
  return transitionRoles[action]?.includes(user.role) ?? false;
}

function canActOnRequest(user, request) {
  if (user.role === 'ADMIN') return true;
  if (request.assignedToId === user.id) return true;
  if (user.department && request.submitter.department === user.department) return true;
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
    assignedTo: request.assignedTo?.displayName ?? null,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    dueAt,
    isOverdue: Boolean(dueAt && new Date(dueAt).getTime() < Date.now() && !['ARCHIVE', 'REJECTED'].includes(request.status)),
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

export async function createUser({ displayName, email, passwordHash, role = 'USER', department = null }) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = displayName.trim();

  return prisma.user.create({
    data: {
      displayName: normalizedName,
      email: normalizedEmail,
      passwordHash,
      role,
      department
    }
  });
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

function getConditionalInitialStatus({ category, amountCents }) {
  if (category === 'HARDWARE' && Number.isInteger(amountCents) && amountCents < 50000) {
    return 'APPROVE';
  }

  return 'REQUEST';
}

function getDueAtForStatus(status) {
  return status === 'REVIEW' ? addDays(new Date(), REVIEW_SLA_DAYS) : null;
}

export async function listRequests({ user }) {
  const reviewerVisibility = user.department
    ? {
        OR: [
          { assignedToId: user.id },
          { submitter: { department: user.department } }
        ]
      }
    : { assignedToId: user.id };

  const where = user.role === 'ADMIN'
    ? { isDeleted: false }
    : user.role === 'USER'
      ? { isDeleted: false, submitterId: user.id }
      : {
          isDeleted: false,
          ...reviewerVisibility
        };

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
  if (user.role === 'USER' && request.submitterId === user.id) return toApiRequest(request);
  if (user.role !== 'USER' && request.assignedToId === user.id) return toApiRequest(request);
  if (user.role !== 'USER' && user.department && request.submitter.department === user.department) {
    return toApiRequest(request);
  }

  return null;
}

export async function createRequest({ title, description, category, amountCents, user, context = {} }) {
  const normalizedCategory = category ?? 'GENERAL';
  const initialStatus = getConditionalInitialStatus({ category: normalizedCategory, amountCents });
  const dueAt = getDueAtForStatus(initialStatus);

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
            fromStatus: null,
            toStatus: 'REQUEST',
            note: 'Created',
            ipAddress: context.ipAddress,
            userAgent: context.userAgent
          },
          ...(initialStatus === 'APPROVE'
            ? [{
                actorId: user.id,
                action: 'TRANSITION',
                fromStatus: 'REQUEST',
                toStatus: 'APPROVE',
                note: 'Auto-approved by policy: hardware request under 500.00',
                ipAddress: context.ipAddress,
                userAgent: context.userAgent
              }]
            : [])
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
      include: { submitter: true }
    });

    if (!request) return { error: 'NOT_FOUND' };
    if (!canUseAction(user, action)) return { error: 'FORBIDDEN' };
    if (action === 'RESUBMIT' && request.submitterId !== user.id && user.role !== 'ADMIN') {
      return { error: 'FORBIDDEN' };
    }
    if (user.role !== 'USER' && !canActOnRequest(user, request)) {
      return { error: 'FORBIDDEN' };
    }

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
    if (!['REVIEWER', 'APPROVER', 'ADMIN'].includes(user.role)) return { error: 'FORBIDDEN' };
    if (!canActOnRequest(user, request)) {
      return { error: 'FORBIDDEN' };
    }
    if (['ARCHIVE', 'REJECTED'].includes(request.status)) {
      return { error: 'INVALID_TRANSITION', details: { from: request.status, action: 'DELEGATE' } };
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
