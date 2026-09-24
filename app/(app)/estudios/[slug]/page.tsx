import { StudioGames } from "@/components/studios/StudioGames";

export const metadata = { title: "Estudio" };

/** Estudio › Desarrollados (la tab por defecto). */
export default async function StudioDevelopedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ orden?: string }>;
}) {
  const [{ slug }, { orden }] = await Promise.all([params, searchParams]);
  return <StudioGames slug={slug} kind="developed" orden={orden} />;
}
