import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import {
  createInstagramContext,
  getUserFollowStatus,
  hasInstagramCredentials,
} from "@/lib/instagram/provider";
import { buildTrackedUrl } from "@/lib/tracking/message";
import { isCrawlerRequest } from "@/lib/tracking/server";
import { GateScreen, type GateAction } from "./gate-screen";

// The answer depends on a live call to Meta about one particular person, so
// nothing here may be cached or prerendered.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tu recurso",
  robots: { index: false, follow: false },
};

type GatePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function resourceActions(
  trackedLinks: { slug: string; label: string | null }[],
  primaryLabel: string | null
): GateAction[] {
  return trackedLinks.map((link, index) => ({
    label: (index === 0 ? primaryLabel : link.label) || link.label || "Abrir",
    href: buildTrackedUrl(link.slug),
    variant: index === 0 ? "primary" : "secondary",
  }));
}

export default async function FollowGatePage({
  params,
  searchParams,
}: GatePageProps) {
  const { token } = await params;
  // Read but unused: the "verify again" button varies this so the in-app
  // browser fetches the page instead of showing its cached copy.
  await searchParams;

  const gate = await prisma.followGate.findUnique({
    where: { token },
    select: {
      id: true,
      igsid: true,
      passedAt: true,
      automation: {
        select: {
          id: true,
          isActive: true,
          linkButtonLabel: true,
          followRepromptMessage: true,
          trackedLinks: {
            orderBy: { createdAt: "asc" },
            select: { slug: true, label: true },
          },
          instagramAccount: {
            select: {
              provider: true,
              workspaceId: true,
              zernioAccountId: true,
              instagramId: true,
              accessToken: true,
              username: true,
            },
          },
        },
      },
    },
  });

  if (!gate) {
    return (
      <GateScreen
        title="Este enlace ya no es válido"
        body="Vuelve al comentario y escribe la palabra clave otra vez para recibir un enlace nuevo."
        actions={[]}
      />
    );
  }

  const { automation } = gate;
  const account = automation.instagramAccount;
  const links = resourceActions(
    automation.trackedLinks,
    automation.linkButtonLabel
  );

  // A link preview crawler hits this URL the moment the DM is delivered,
  // before anyone taps anything. Give it a page to show, but never spend a
  // Meta call or record a check on it.
  const userAgent = (await headers()).get("user-agent");
  if (isCrawlerRequest(userAgent)) {
    return (
      <GateScreen
        eyebrow="Design Modeling Academy"
        title="Tu recurso te está esperando"
        body="Toca el botón del mensaje para abrirlo."
        actions={[]}
      />
    );
  }

  // Already verified once: let them back in without asking Meta again, so a
  // link they reopen next week still works.
  if (gate.passedAt) {
    return deliver(links);
  }

  let follows: boolean | null = null;
  if (hasInstagramCredentials(account)) {
    try {
      const context = await createInstagramContext(account);
      follows = await getUserFollowStatus({
        context,
        recipientId: gate.igsid,
      });
    } catch {
      // An account whose token we cannot use is our problem, not theirs.
      follows = null;
    }
  }

  await prisma.followGate.update({
    where: { id: gate.id },
    data: {
      lastCheckedAt: new Date(),
      checkCount: { increment: 1 },
      ...(follows === false ? {} : { passedAt: new Date() }),
    },
  });

  if (follows === false) {
    const profileUrl = `https://www.instagram.com/${encodeURIComponent(account.username)}/`;
    return (
      <GateScreen
        eyebrow="Falta un paso"
        title="Veo que aún no me sigues 👀"
        body={
          automation.followRepromptMessage?.trim() ||
          `Sígueme en @${account.username} y vuelve aquí para desbloquear tu recurso. Toma dos segundos.`
        }
        actions={[
          {
            label: `Seguir a @${account.username}`,
            href: profileUrl,
            variant: "primary",
          },
          {
            // A fresh value each render: the in-app browser would otherwise
            // serve the same "not following yet" page it already has.
            label: "Ya te sigo, verificar",
            href: `?v=${Date.now().toString(36)}`,
            variant: "secondary",
          },
        ]}
        footnote="Si acabas de seguirme, espera unos segundos antes de verificar."
      />
    );
  }

  // Following — or Instagram would not say, in which case we let them through
  // rather than trap a real follower behind an answer we cannot get.
  return deliver(links);
}

function deliver(links: GateAction[]) {
  // One resource: send them straight to it, through /r/<slug> so the click is
  // counted. More than one: they have to choose, so show the buttons.
  if (links.length === 1) redirect(links[0].href);

  if (links.length === 0) {
    return (
      <GateScreen
        eyebrow="¡Listo!"
        title="Ya estás dentro 🎉"
        body="Vuelve a Instagram, te escribo por ahí."
        actions={[]}
      />
    );
  }

  return (
    <GateScreen
      eyebrow="¡Listo!"
      title="Aquí tienes 🎉"
      body="Gracias por seguirme. Abre lo que necesites:"
      actions={links}
    />
  );
}
