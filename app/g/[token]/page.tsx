import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import {
  createInstagramContext,
  getUserFollowStatusDetailed,
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
          postDeliveryQuestion: true,
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
  const delivery = {
    links,
    question: automation.postDeliveryQuestion,
    username: account.username,
  };

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
    return deliver(delivery);
  }

  let follows: boolean | null = null;
  let detail = "no usable credentials for this account";
  if (hasInstagramCredentials(account)) {
    try {
      const context = await createInstagramContext(account);
      const result = await getUserFollowStatusDetailed({
        context,
        recipientId: gate.igsid,
      });
      follows = result.follows;
      detail = result.detail;
    } catch (error) {
      // An account whose token we cannot use is our problem, not theirs.
      follows = null;
      detail = `context failed: ${error instanceof Error ? error.message : "unknown"}`;
    }
  }

  await prisma.followGate.update({
    where: { id: gate.id },
    data: {
      lastCheckedAt: new Date(),
      checkCount: { increment: 1 },
      lastFollows: follows,
      lastDetail: detail.slice(0, 500),
      ...(follows === false ? {} : { passedAt: new Date() }),
    },
  });

  // Letting an unverified visitor through is a deliberate choice, but a silent
  // one is indistinguishable from a broken gate: it looks exactly like the
  // check saying "yes". Record it where Diagnostics already looks, with the
  // igsid we asked about, so a gate that never verifies anyone is visible
  // instead of just permissive.
  if (follows === null) {
    await prisma.operationalEvent
      .create({
        data: {
          workspaceId: account.workspaceId,
          source: "SYSTEM",
          level: "WARNING",
          message: `Follow gate could not verify a visitor and let them through: ${detail.slice(0, 200)}`,
          payload: {
            automationId: automation.id,
            igsid: gate.igsid,
            detail: detail.slice(0, 500),
          },
        },
      })
      .catch(() => {});
  }

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
  return deliver(delivery);
}

function deliver({
  links,
  question,
  username,
}: {
  links: GateAction[];
  question: string | null;
  username: string;
}) {
  const questionText = question?.trim();

  // The open question is the handover to whoever runs the inbox, so it has to
  // be seen. Redirecting straight to the resource would skip the page it lives
  // on, so that shortcut only applies when there is no question to ask.
  if (links.length === 1 && !questionText) redirect(links[0].href);

  const questionBlock = questionText
    ? {
        text: questionText,
        action: {
          // They answer in the thread, and their reply is the first message
          // its owner receives — which is what lets a bot pick it up. A
          // message from us would be the second one, and rejected.
          label: "Responder por Instagram",
          href: `https://ig.me/m/${encodeURIComponent(username)}`,
          variant: "primary" as const,
        },
      }
    : null;

  if (links.length === 0) {
    return (
      <GateScreen
        eyebrow="¡Listo!"
        title="Ya estás dentro 🎉"
        body={questionText ? null : "Vuelve a Instagram, te escribo por ahí."}
        actions={[]}
        question={questionBlock}
      />
    );
  }

  return (
    <GateScreen
      eyebrow="¡Listo!"
      title="Aquí tienes 🎉"
      body={
        links.length > 1
          ? "Gracias por seguirme. Abre lo que necesites:"
          : "Gracias por seguirme. Aquí está lo que te prometí:"
      }
      actions={links}
      question={questionBlock}
    />
  );
}
