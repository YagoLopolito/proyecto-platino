import { StudioGames } from "@/components/studios/StudioGames";

export const metadata = { title: "Estudio" };

/** Estudio › Publicados. */
export default async function StudioPublishedPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ orden?: string }>;
}) {
  const [{ slug }, { orden }] = await Promise.all([params, searchParams]);
  return <StudioGames slug={slug} kind="published" orden={orden} />;
}
