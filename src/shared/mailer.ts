import { createTransport } from "nodemailer";
import { config } from "../config/index.js";

export class MailConfigurationError extends Error {}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<string | undefined> {
  if (!config.smtpHost || !config.emailFrom) {
    throw new MailConfigurationError(
      "Email sending is not configured. Set SMTP_HOST and EMAIL_FROM in the backend environment."
    );
  }
  if (Boolean(config.smtpUsername) !== Boolean(config.smtpPassword)) {
    throw new MailConfigurationError(
      "Set both SMTP_USERNAME and SMTP_PASSWORD, or leave both empty."
    );
  }

  const transporter = createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    ...(config.smtpUsername
      ? {
          auth: {
            user: config.smtpUsername,
            pass: config.smtpPassword,
          },
        }
      : {}),
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      transporter.sendMail({
        from: config.emailFrom,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("SMTP delivery timed out after 45 seconds")),
          45_000
        );
      }),
    ]);
    return result.messageId;
  } finally {
    if (timeout) clearTimeout(timeout);
    transporter.close();
  }
}
