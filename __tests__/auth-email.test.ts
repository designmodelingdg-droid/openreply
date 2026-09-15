import { describe, expect, it } from "vitest";
import { buildSignInEmail } from "../lib/auth-email";

const url =
  "https://openreply-omega-five.vercel.app/api/auth/callback/resend?token=abc&email=x%40y.com";

describe("sign-in email", () => {
  // The Auth.js default is `Sign in to <host>`. A free-hosting hostname in the
  // subject of a mail sent from a business domain is what puts it in spam.
  it("names the business in the subject, never the deployment host", () => {
    const { subject } = buildSignInEmail({ url });

    expect(subject).toBe("Tu acceso a Design Modeling Academy");
    expect(subject).not.toContain("vercel.app");
    expect(subject).not.toContain("Sign in");
  });

  it("carries the link in both the HTML and the plain-text part", () => {
    const { html, text } = buildSignInEmail({ url });

    expect(html).toContain(`href="${url}"`);
    expect(text).toContain(url);
    // A text part that does not match the HTML is itself a spam signal.
    expect(text).toContain("Tu acceso a Design Modeling Academy");
  });

  it("says what the link does and how to ignore it", () => {
    const { html, text } = buildSignInEmail({ url });

    for (const body of [html, text]) {
      // The wording differs in case between the two parts, not in substance.
      expect(body.toLowerCase()).toContain("caduca en 24 horas");
      expect(body).toContain("Si no pediste este acceso");
    }
  });
});
