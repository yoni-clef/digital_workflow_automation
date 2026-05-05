import nodemailer from 'nodemailer';

let transporter;

async function initTransporter() {
  if (transporter) return transporter;

  // If SMTP_* env vars are provided, use the real SMTP server.
  // Otherwise, fall back to Ethereal's test SMTP account (prototype convenience).
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure =
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE === 'true'
        : port === 465;

    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || '',
          }
        : undefined,
    });

    return transporter;
  }

  // Generate test SMTP service account from ethereal.email
  const testAccount = await nodemailer.createTestAccount();

  // create reusable transporter object using the default SMTP transport
  transporter = nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user, // generated ethereal user
      pass: testAccount.pass, // generated ethereal password
    },
  });

  return transporter;
}

export async function sendNotification(to, subject, text) {
  try {
    const t = await initTransporter();
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || '"Workflow System" <noreply@workflow.local>',
      to,
      subject,
      text,
    });
    // eslint-disable-next-line no-console
    console.log("Message sent: %s", info.messageId);
    // eslint-disable-next-line no-console
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    return info;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to send email:", err);
  }
}
