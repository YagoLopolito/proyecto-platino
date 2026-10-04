import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPost } from "@/lib/posts/queries";
import { PostDetail } from "./PostDetail";

/** Carga una publicación y la muestra (página o modal). 404 si no existe o no es visible. */
export async function PostDetailScreen({ postId, inModal }: { postId: string; inModal: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const post = await getPost(supabase, user.id, postId);
  if (!post) notFound();
  return <PostDetail post={post} inModal={inModal} />;
}
