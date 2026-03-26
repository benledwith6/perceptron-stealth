import nodemailer from "nodemailer";
import {
  welcomeEmailHtml,
  welcomeEmailText,
  passwordResetEmailHtml,
  passwordResetEmailText,
  emailVerificationEmailHtml,
  emailVerificationEmailText,
} from "./email-templates";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const fromAddress = process.env.EMAIL_FROM || "noreply@example.com";

// Basic email format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sanitize a string to prevent email header injection.
 * Strips newlines, carriage returns, and null bytes.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\0]/g, "").trim();
}

/**
 * Validate an email address format and sanitize against injection.
 */
function validateEmail(email: string): string {
  const sanitized = sanitizeHeaderValue(email);
  if (!EMAIL_REGEX.test(sanitized)) {
    throw new Error(`Invalid email address: ${sanitized}`);
  }
  return sanitized;
}

/**
 * Send a generic email.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<void> {
  const safeTo = validateEmail(to);
  const safeSubject = sanitizeHeaderValue(subject);

  if (!safeSubject) {
    throw new Error("Email subject cannot be empty");
  }

  await transporter.sendMail({
    from: fromAddress,
    to: safeTo,
    subject: safeSubject,
    html,
    text: text || html.replace(/<[^>]*>/g, ""),
  });
}

/**
 * Send a welcome email after signup.
 */
export async function sendWelcomeEmail(user: {
  email: string;
  firstName: string;
}): Promise<void> {
  await sendEmail(
    user.email,
    "Welcome to Official AI!",
    welcomeEmailHtml(user.firstName),
    welcomeEmailText(user.firstName)
  );
}

/**
 * Send a password reset email with a reset link.
 */
export async function sendPasswordResetEmail(
  user: { email: string; firstName: string },
  resetToken: string
): Promise<void> {
  await sendEmail(
    user.email,
    "Reset your password",
    passwordResetEmailHtml(user.firstName, resetToken),
    passwordResetEmailText(user.firstName, resetToken)
  );
}

/**
 * Send an email verification email with a verification link.
 */
export async function sendEmailVerificationEmail(
  user: { email: string; firstName: string },
  verificationToken: string
): Promise<void> {
  await sendEmail(
    user.email,
    "Verify your email address",
    emailVerificationEmailHtml(user.firstName, verificationToken),
    emailVerificationEmailText(user.firstName, verificationToken)
  );
}
