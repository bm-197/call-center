type InvitationEmailInput = {
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
  role: string;
  acceptUrl: string;
};

export function invitationEmail(input: InvitationEmailInput) {
  const { organizationName, inviterName, inviterEmail, role, acceptUrl } =
    input;

  const subject = `${inviterName} invited you to join ${organizationName}`;

  const text = `
${inviterName} (${inviterEmail}) invited you to join ${organizationName} as ${role}.

Accept the invitation:
${acceptUrl}

This invitation will expire in 7 days. If you weren't expecting this, you can ignore this email.
  `.trim();

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f6f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e5e2;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;">
                <div style="font-size:13px;color:#6b6b66;letter-spacing:0.04em;text-transform:uppercase;">Call Center</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;">
                <h1 style="margin:0;font-size:22px;font-weight:600;line-height:1.3;">
                  You've been invited to join<br/>
                  <span style="color:#3a3a36;">${escapeHtml(organizationName)}</span>
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;font-size:15px;line-height:1.6;color:#3a3a36;">
                <strong>${escapeHtml(inviterName)}</strong>
                <span style="color:#6b6b66;">(${escapeHtml(inviterEmail)})</span>
                invited you to join
                <strong>${escapeHtml(organizationName)}</strong>
                as <strong>${escapeHtml(role)}</strong>.
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <a href="${acceptUrl}"
                  style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:500;">
                  Accept invitation
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;font-size:13px;color:#8a8a85;line-height:1.6;">
                Or copy this link into your browser:<br/>
                <a href="${acceptUrl}" style="color:#3a3a36;word-break:break-all;">${acceptUrl}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#fafaf8;border-top:1px solid #e5e5e2;font-size:12px;color:#8a8a85;">
                This invitation expires in 7 days. If you weren't expecting this, you can safely ignore this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
