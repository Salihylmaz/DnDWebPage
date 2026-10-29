import nodemailer, { Transporter } from 'nodemailer';
import { env } from './env';

let transporter: Transporter | undefined;

export function isEmailVerificationConfigured(): boolean {
  return Boolean(
    env.SMTP_HOST && env.SMTP_PORT && Number.isInteger(env.SMTP_PORT) &&
    env.SMTP_USER && env.SMTP_PASS && env.EMAIL_FROM && env.APP_BASE_URL
  );
}

export async function sendEmailVerification(to: string, token: string): Promise<void> {
  if (!isEmailVerificationConfigured()) {
    throw new Error('Email verification is not configured');
  }

  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  // Put the secret in the URL fragment so it is not sent to the web server or logged in access logs.
  const verificationUrl = `${env.APP_BASE_URL}/verify-email#token=${encodeURIComponent(token)}`;
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject: 'DnD Oturumları e-posta doğrulaması',
    text: `E-posta adresini doğrulamak için bu bağlantıyı aç: ${verificationUrl}\nBağlantı 24 saat geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok say.`,
    html: `<p>Hesabını etkinleştirmek için e-posta adresini doğrula.</p><p><a href="${verificationUrl}">E-posta adresimi doğrula</a></p><p>Bağlantı 24 saat geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok say.</p>`,
  });
}
