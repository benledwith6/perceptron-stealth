const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
const appName = "Official AI";

/**
 * Escape HTML special characters to prevent XSS in email templates.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName}</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0f;padding:40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#12121a;border-radius:12px;border:1px solid rgba(255,255,255,0.06);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.06);">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:36px;height:36px;background:linear-gradient(135deg,#3b82f6,#9333ea);border-radius:10px;text-align:center;vertical-align:middle;font-size:18px;color:#ffffff;">
                    &#10024;
                  </td>
                  <td style="padding-left:10px;font-size:18px;font-weight:700;color:#ffffff;">
                    Official <span style="background:linear-gradient(135deg,#3b82f6,#9333ea);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">AI</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px;border-top:1px solid rgba(255,255,255,0.06);">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.25);line-height:1.6;">
                &copy; ${new Date().getFullYear()} ${appName}. All rights reserved.<br/>
                You received this email because you have an account with ${appName}.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  const safeUrl = escapeHtml(url);
  const safeText = escapeHtml(text);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
  <tr>
    <td style="background:linear-gradient(135deg,#3b82f6,#9333ea);border-radius:10px;padding:14px 32px;">
      <a href="${safeUrl}" target="_blank" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">
        ${safeText}
      </a>
    </td>
  </tr>
</table>`;
}

// --- Welcome Email ---

export function welcomeEmailHtml(firstName: string): string {
  const safeName = escapeHtml(firstName);
  return layout(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#ffffff;">
      Welcome to ${appName}, ${safeName}!
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.7;">
      Your account has been created. You now have access to AI-powered video content creation, automated scheduling, and personalized marketing tools.
    </p>
    <p style="margin:0 0 4px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.7;">
      Here is what to do next:
    </p>
    <ul style="margin:8px 0 0;padding-left:20px;font-size:14px;color:rgba(255,255,255,0.45);line-height:2;">
      <li>Upload your professional photo</li>
      <li>Record a 30-second voice sample</li>
      <li>Set up your brand profile</li>
      <li>Create your first AI video</li>
    </ul>
    ${button("Go to Dashboard", `${baseUrl}/dashboard/overview`)}
    <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.3);line-height:1.6;">
      Need help getting started? Reply to this email and our team will be happy to assist.
    </p>
  `);
}

export function welcomeEmailText(firstName: string): string {
  return `Welcome to ${appName}, ${firstName}!

Your account has been created. You now have access to AI-powered video content creation, automated scheduling, and personalized marketing tools.

Here is what to do next:
- Upload your professional photo
- Record a 30-second voice sample
- Set up your brand profile
- Create your first AI video

Go to your dashboard: ${baseUrl}/dashboard/overview

Need help getting started? Reply to this email and our team will be happy to assist.

-- ${appName}`;
}

// --- Password Reset Email ---

export function passwordResetEmailHtml(firstName: string, resetToken: string): string {
  const safeName = escapeHtml(firstName);
  const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
  return layout(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#ffffff;">
      Reset your password
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.7;">
      Hi ${safeName}, we received a request to reset your password. Click the button below to choose a new one. This link is valid for 1 hour.
    </p>
    ${button("Reset Password", resetUrl)}
    <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.3);line-height:1.6;">
      If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
    </p>
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.6;word-break:break-all;">
      Direct link: ${resetUrl}
    </p>
  `);
}

export function passwordResetEmailText(firstName: string, resetToken: string): string {
  const resetUrl = `${baseUrl}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;
  return `Reset your password

Hi ${firstName}, we received a request to reset your password. Visit the link below to choose a new one. This link is valid for 1 hour.

${resetUrl}

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

-- ${appName}`;
}

// --- Email Verification Email ---

export function emailVerificationEmailHtml(firstName: string, verificationToken: string): string {
  const safeName = escapeHtml(firstName);
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;
  return layout(`
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#ffffff;">
      Verify your email address
    </h1>
    <p style="margin:0 0 12px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.7;">
      Hi ${safeName}, please confirm your email address by clicking the button below. This helps us keep your account secure.
    </p>
    ${button("Verify Email", verifyUrl)}
    <p style="margin:0 0 8px;font-size:13px;color:rgba(255,255,255,0.3);line-height:1.6;">
      If you did not create an account with ${appName}, you can ignore this email.
    </p>
    <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.2);line-height:1.6;word-break:break-all;">
      Direct link: ${verifyUrl}
    </p>
  `);
}

export function emailVerificationEmailText(firstName: string, verificationToken: string): string {
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`;
  return `Verify your email address

Hi ${firstName}, please confirm your email address by visiting the link below. This helps us keep your account secure.

${verifyUrl}

If you did not create an account with ${appName}, you can ignore this email.

-- ${appName}`;
}
