import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
const fromName = process.env.RESEND_FROM_NAME ?? 'Call Center';

if (!apiKey && process.env.NODE_ENV === 'production') {
  throw new Error('RESEND_API_KEY is required in production');
}

const resend = apiKey ? new Resend(apiKey) : null;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  if (!resend) {
    // Dev fallback: log instead of throwing so local sign-up flows still work
    console.log(`[email:dev] would send "${subject}" to ${to}\n${text}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html,
    text,
  });

  if (error) {
    console.error('[email] resend error:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
