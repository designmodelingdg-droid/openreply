import { BRAND } from "@/lib/brand";

/**
 * The sign-in email.
 *
 * Auth.js ships a default that puts the deployment's hostname in the subject —
 * "Sign in to openreply-omega-five.vercel.app" — and sends it from whatever
 * domain the mail service is verified for. To a spam filter that reads as
 * phishing: the sender is one domain, every link points at another, and the
 * other is free hosting. Perfect SPF and DKIM do not save it.
 *
 * This replaces it with a message that names the business instead of the
 * hostname, in the language its recipients read, with a plain-text part that
 * matches the HTML. It does not fix the domain mismatch itself — only serving
 * the app from the same domain as the sender does that — but it removes every
 * other signal.
 */
export function buildSignInEmail({ url }: { url: string }) {
  const subject = `Tu acceso a ${BRAND.name}`;

  const text = [
    `Tu acceso a ${BRAND.name}`,
    "",
    "Abre este enlace para entrar. Caduca en 24 horas y solo se puede usar una vez:",
    url,
    "",
    "Si no pediste este acceso, ignora este mensaje.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:${BRAND.crema};font-family:'Nunito',Helvetica,Arial,sans-serif;color:${BRAND.azulNavy}">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px">
      <tr>
        <td style="padding:32px 28px;text-align:center">
          <img src="${BRAND.logoUrl}" alt="${BRAND.name}" height="40" style="height:40px;width:auto;margin-bottom:24px">
          <h1 style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:22px;font-weight:bold;color:${BRAND.azulPrincipal}">
            Tu acceso a ${BRAND.name}
          </h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:${BRAND.azulMedio}">
            Toca el botón para entrar. El enlace caduca en 24 horas y solo se puede usar una vez.
          </p>
          <a href="${url}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:${BRAND.naranja};color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;text-decoration:none">
            Entrar
          </a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${BRAND.azulMedio}">
            Si no pediste este acceso, ignora este mensaje.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}
