// Página pública do Grupo VIP: /hot-secret/g/<slug>
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useMemo } from "react";
import { VipProfile } from "@/components/vip/VipProfile";
import { ChatI18nContext, asChatLocale, makeChatI18n } from "@/features/i18n/chat";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sandboxAllowed } from "@/services/payments";

interface Props {
  slug: string;
  title: string;
  description: string;
  image: string | null;
  locale: string;
  sandbox: boolean;
}

export default function VipGroupPage({ slug, title, description, image, locale, sandbox }: Props) {
  const i18n = useMemo(() => makeChatI18n(asChatLocale(locale)), [locale]);
  return (
    <ChatI18nContext.Provider value={i18n}>
      <Head>
        <title>{title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#0d0710" />
        <meta property="og:title" content={title} />
        {description && <meta property="og:description" content={description} />}
        {image && <meta property="og:image" content={image} />}
      </Head>
      <VipProfile slug={slug} sandbox={sandbox} />
    </ChatI18nContext.Provider>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? "");
  const group = /^[a-z0-9-]{2,60}$/.test(slug) ? await prisma.vipGroup.findUnique({ where: { slug } }) : null;
  const admin = !!(await verifyAdminSession(ctx.req.cookies[ADMIN_COOKIE]));
  if (!group || (!group.published && !admin)) return { notFound: true };
  const character = group.characterId ? await prisma.character.findUnique({ where: { id: group.characterId } }) : null;
  return {
    props: {
      slug,
      title: group.name || character?.name || "VIP",
      description: (group.bio ?? "").slice(0, 160),
      image: group.avatarUrl || character?.avatarUrl || group.coverUrl || null,
      locale: group.locale,
      sandbox: sandboxAllowed() && (process.env.PAYMENT_PROVIDER ?? "sandbox") === "sandbox",
    },
  };
};
