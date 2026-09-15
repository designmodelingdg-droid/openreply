import { FOLLOW_GATE_BRAND as brand } from "@/lib/follow-gate/brand";

export type GateAction = {
  label: string;
  href: string;
  variant: "primary" | "secondary";
};

/**
 * The whole visual surface of the gate: a card with the account's logo, one
 * headline, one line of copy and up to a handful of buttons.
 *
 * Styles are inlined rather than taken from the app's Tailwind theme on
 * purpose. This page renders inside Instagram's in-app browser, under a root
 * layout that forces the dashboard's dark theme, and it belongs to the account
 * that sent the DM — so it carries its own palette and covers the viewport
 * itself instead of inheriting one.
 */
export function GateScreen({
  eyebrow,
  title,
  body,
  actions,
  question,
  footnote,
}: {
  eyebrow?: string | null;
  title: string;
  body?: string | null;
  actions: GateAction[];
  /**
   * Asked after the resource is handed over, with the button that opens the
   * DM thread to answer it. The reply is what starts the conversation — and
   * it has to come from them, because a message from us would be the second
   * one in the thread and Instagram rejects it.
   */
  question?: { text: string; action: GateAction } | null;
  footnote?: string | null;
}) {
  return (
    <>
      <link rel="stylesheet" href={brand.fontsHref} />
      <div
        style={{
          minHeight: "100vh",
          width: "100%",
          background: `linear-gradient(160deg, ${brand.crema} 0%, ${brand.naranjaPalido} 100%)`,
          color: brand.azulNavy,
          fontFamily: "Nunito, system-ui, -apple-system, sans-serif",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "440px",
            background: "#ffffff",
            borderRadius: "20px",
            padding: "32px 24px",
            boxShadow: "0 18px 50px rgba(0, 62, 92, 0.16)",
            textAlign: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- remote logo, no loader needed */}
          <img
            src={brand.logoUrl}
            alt=""
            style={{ height: "48px", width: "auto", margin: "0 auto 24px" }}
          />

          {eyebrow ? (
            <p
              style={{
                margin: "0 0 8px",
                fontFamily: "Overpass, system-ui, sans-serif",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: brand.naranja,
              }}
            >
              {eyebrow}
            </p>
          ) : null}

          <h1
            style={{
              margin: "0 0 12px",
              fontFamily: "Overpass, system-ui, sans-serif",
              fontSize: "24px",
              lineHeight: 1.25,
              fontWeight: 800,
              color: brand.azulPrincipal,
            }}
          >
            {title}
          </h1>

          {body ? (
            <p
              style={{
                margin: "0 0 24px",
                fontSize: "16px",
                lineHeight: 1.55,
                color: brand.azulMedio,
                whiteSpace: "pre-wrap",
              }}
            >
              {body}
            </p>
          ) : null}

          <div
            style={{ display: "flex", flexDirection: "column", gap: "12px" }}
          >
            {actions.map((action) => (
              <a
                key={`${action.label}:${action.href}`}
                href={action.href}
                style={{
                  display: "block",
                  padding: "15px 20px",
                  borderRadius: "12px",
                  fontFamily: "Overpass, system-ui, sans-serif",
                  fontSize: "16px",
                  fontWeight: 700,
                  textDecoration: "none",
                  ...(action.variant === "primary"
                    ? { background: brand.naranja, color: "#ffffff" }
                    : {
                        background: "#ffffff",
                        color: brand.azulPrincipal,
                        border: `2px solid ${brand.azulPrincipal}`,
                      }),
                }}
              >
                {action.label}
              </a>
            ))}
          </div>

          {question ? (
            <div
              style={{
                marginTop: "28px",
                paddingTop: "24px",
                borderTop: `1px solid ${brand.naranjaPalido}`,
              }}
            >
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: "16px",
                  lineHeight: 1.55,
                  color: brand.azulNavy,
                  whiteSpace: "pre-wrap",
                }}
              >
                {question.text}
              </p>
              <a
                href={question.action.href}
                style={{
                  display: "block",
                  padding: "15px 20px",
                  borderRadius: "12px",
                  fontFamily: "Overpass, system-ui, sans-serif",
                  fontSize: "16px",
                  fontWeight: 700,
                  textDecoration: "none",
                  background: brand.azulPrincipal,
                  color: "#ffffff",
                }}
              >
                {question.action.label}
              </a>
            </div>
          ) : null}

          {footnote ? (
            <p
              style={{
                margin: "20px 0 0",
                fontSize: "13px",
                lineHeight: 1.5,
                color: brand.azulMedio,
                opacity: 0.75,
              }}
            >
              {footnote}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
