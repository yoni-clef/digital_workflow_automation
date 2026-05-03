import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const allowedTransitions = {
  REQUEST: { REVIEW: 'REVIEW', REJECT: 'REJECTED' },
  REVIEW: { APPROVE: 'APPROVE', REJECT: 'REJECTED' },
  APPROVE: { ARCHIVE: 'ARCHIVE', REJECT: 'REJECTED' },
  ARCHIVE: {},
  REJECTED: {}
};

function toApiRequest(request) {
  return {
    id: request.id,
    title: request.title,
    description: request.description,
    createdBy: request.submitter.displayName,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
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
    }))
  };
}

async function findOrCreateActor(displayName) {
  const normalizedName = displayName.trim();
  const existing = await prisma.user.findFirst({
    where: { displayName: normalizedName }
  });

  if (existing) return existing;

  return prisma.user.create({
    data: { displayName: normalizedName }
  });
}

const requestInclude = {
  submitter: true,
  history: {
    orderBy: { createdAt: 'asc' },
    include: { actor: true }
  }
};

export async function listRequests() {
  const requests = await prisma.workflowRequest.findMany({
    where: { isDeleted: false },
    orderBy: { updatedAt: 'desc' },
    include: requestInclude
  });

  return requests.map(toApiRequest);
}

export async function getRequestById(id) {
  const request = await prisma.workflowRequest.findFirst({
    where: { id, isDeleted: false },
    include: requestInclude
  });

  return request ? toApiRequest(request) : null;
}

export async function createRequest({ title, description, createdBy, context = {} }) {
  const actor = await findOrCreateActor(createdBy);

  const request = await prisma.workflowRequest.create({
    data: {
      title,
      description,
      submitterId: actor.id,
      history: {
        create: {
          actorId: actor.id,
          action: 'CREATE',
          fromStatus: null,
          toStatus: 'REQUEST',
          note: 'Created',
          ipAddress: context.ipAddress,
          userAgent: context.userAgent
        }
      }
    },
    include: requestInclude
  });

  return toApiRequest(request);
}

export async function transitionRequest({ id, action, by, note, context = {} }) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.workflowRequest.findFirst({
      where: { id, isDeleted: false }
    });

    if (!request) return { error: 'NOT_FOUND' };

    const from = request.status;
    const to = allowedTransitions[from]?.[action] ?? null;

    if (!to) {
      return {
        error: 'INVALID_TRANSITION',
        details: { from, action }
      };
    }

    let actor = await tx.user.findFirst({
      where: { displayName: by.trim() }
    });

    if (!actor) {
      actor = await tx.user.create({
        data: { displayName: by.trim() }
      });
    }

    await tx.workflowRequest.update({
      where: { id },
      data: {
        status: to,
        history: {
          create: {
            actorId: actor.id,
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
