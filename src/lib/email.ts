import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "Nexus <noreply@nexusai360.com>";

export async function sendPasswordResetEmail(
  to: string,
  userName: string,
  resetUrl: string
) {
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: "Redefinição de senha — Nexus Roteador Webhook",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; background: #09090b; color: #fafafa;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #2563eb; border-radius: 12px; padding: 12px; margin-bottom: 16px;">
            <span style="font-size: 24px; color: white;">⚡</span>
          </div>
          <h1 style="font-size: 20px; font-weight: 700; color: #fafafa; margin: 0;">Nexus Roteador Webhook</h1>
        </div>

        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 8px;">
          Olá, <strong style="color: #fafafa;">${userName}</strong>.
        </p>
        <p style="color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 24px;">
          Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:
        </p>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(to right, #2563eb, #3b82f6); color: white; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-size: 14px; font-weight: 600;">
            Redefinir minha senha
          </a>
        </div>

        <p style="color: #71717a; font-size: 12px; line-height: 1.5; margin-bottom: 8px;">
          Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este e-mail.
        </p>

        <hr style="border: none; border-top: 1px solid #27272a; margin: 24px 0;" />

        <p style="color: #52525b; font-size: 11px; text-align: center;">
          NexusAI360 &copy; ${new Date().getFullYear()}
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[sendPasswordResetEmail]", error);
    throw new Error("Erro ao enviar e-mail de redefinição");
  }
}
