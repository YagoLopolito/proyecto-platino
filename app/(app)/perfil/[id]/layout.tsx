import type { ReactNode } from "react";
import { SwipeTabs } from "@/components/ui/SwipeTabs";
import { getOtherProfileContext, otherProfileTabs } from "@/lib/profile/other";

/**
 * Perfil de otro usuario (epic #183, issue #197): las mismas cuatro tabs que
 * el propio, sin engranaje ni editores. El contexto (redirect al propio, 404)
 * se resuelve acá una vez y las tabs lo reusan por `cache()`.
 */
export default async function PerfilAjenoLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { name } = await getOtherProfileContext(id);
  return (
    <SwipeTabs tabs={otherProfileTabs(id)} label={`Perfil de ${name}`}>
      {children}
    </SwipeTabs>
  );
}
