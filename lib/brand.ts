/**
 * Look and feel of everything OpenReply sends outward: the public follow-gate
 * page and the sign-in email.
 *
 * Both reach someone who never sees the dashboard — a commenter in Instagram's
 * in-app browser, a teammate in their inbox — so they have to look like the
 * business, not like the tool behind it. The defaults are the Design Modeling
 * Academy brandkit; every value can be overridden per deployment.
 */
export const BRAND = {
  azulPrincipal: process.env.FOLLOW_GATE_COLOR_PRIMARY ?? "#003e5c",
  azulMedio: "#0a5a80",
  azulNavy: "#001e30",
  naranja: process.env.FOLLOW_GATE_COLOR_ACCENT ?? "#ca7520",
  naranjaClaro: "#e8a04a",
  naranjaPalido: "#f7e8cc",
  crema: "#fafaf7",
  logoUrl:
    process.env.FOLLOW_GATE_LOGO_URL ??
    "https://assets.cdn.filesafe.space/nkKbOarn5IwHeMv48uY9/media/6a04bbc1fa8afa3be0bb00d8.png",
  /** The business name, as a recipient would recognise it. */
  name: process.env.BRAND_NAME ?? "Design Modeling Academy",
  /** Overpass for headings and UI, Nunito for body copy. */
  fontsHref:
    "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&family=Overpass:wght@600;700;800&display=swap",
} as const;
