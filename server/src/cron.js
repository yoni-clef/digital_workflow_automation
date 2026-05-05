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
          status: 'REVIEW',
          isDeleted: false
        },
        include: {
          assignedTo: true,
          submitter: true
        }
      });

      for (const req of overdueRequests) {
        const assignee = req.assignedTo;
        if (assignee && assignee.email) {
          await sendNotification(
            assignee.email,
            `SLA Breach: Request #${req.id} is overdue`,
            `Hello ${assignee.displayName},\n\nThe request "${req.title}" submitted by ${req.submitter.displayName} has breached its SLA. Please review it as soon as possible.`
          );
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
