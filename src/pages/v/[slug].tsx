// Vitrine pública: /hot-secret/v/<slug> — carrossel das modelos; o lead escolhe com quem conversar e cai no chat dela.
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { ShowcaseCarousel } from "@/components/showcase/ShowcaseCarousel";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/auth";
import { publicShowcase, type PublicShowcase } from "@/services/showcase";

interface Props {
  showcase: PublicShowcase;
  draft: boolean;
}

export default function ShowcasePage({ showcase, draft }: Props) {
  const first = showcase.cards[0];
  return (
    <>
      <Head>
        <title>{showcase.title || showcase.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#0d0710" />
        <meta property="og:title" content={showcase.title || showcase.name} />
        {showcase.subtitle && <meta property="og:description" content={showcase.subtitle} />}
        {first?.photoUrl && <meta property="og:image" content={first.photoUrl} />}
      </Head>
      <ShowcaseCarousel showcase={showcase} draft={draft} />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? "").toLowerCase();
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return { notFound: true };
  // rascunho: só o admin vê (pré-visualização), e com os fluxos ainda não publicados
  const admin = !!(await verifyAdminSession(ctx.req.cookies[ADMIN_COOKIE]));
  const showcase = await publicShowcase(slug, admin);
  if (!showcase) return { notFound: true };
  ctx.res.setHeader("Cache-Control", "private, no-store");
  return { props: { showcase, draft: !showcase.published } };
};
