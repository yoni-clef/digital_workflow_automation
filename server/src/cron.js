import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendNotification } from './notification.js';

const prisma = new PrismaClient();

// Run every minute for testing purposes, normally would be daily '0 0 * * *'
export function initCronJobs() {
  cron.schedule('* * * * *', async () => {
    // eslint-disable-next-line no-console
    console.log('Running SLA check...');

    try {
      const overdueRequests = await prisma.workflowRequest.findMany({
        where: {
          dueAt: {
            lt: new Date()
          },
          status: { in: ['PENDING_MANAGER', 'PENDING_DEPARTMENT'] },
          isDeleted: false
        },
        include: {
          assignedTo: true,
          submitter: {
            include: { manager: true }
          }
        }
      });

      for (const req of overdueRequests) {
        try {
          // Notify assignedTo user if set and has email, otherwise notify submitter's manager
          const recipient = (req.assignedTo?.email) ? req.assignedTo : req.submitter?.manager;
          if (recipient?.email) {
            await sendNotification(
              recipient.email,
              `SLA Breach: Request #${req.id} is overdue`,
              `Hello ${recipient.displayName},\n\nThe request "${req.title}" submitted by ${req.submitter.displayName} has breached its SLA. Please review it as soon as possible.`
            );
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(`Failed to send SLA notification for request #${req.id}:`, err);
        }
      }

      if (overdueRequests.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`Sent ${overdueRequests.length} SLA breach notifications.`);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error in SLA cron job:', err);
    }
  });

  // eslint-disable-next-line no-console
  console.log('Cron jobs initialized');
}
