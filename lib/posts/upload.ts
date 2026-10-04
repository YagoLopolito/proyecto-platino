/**
 * Subida directa del navegador a Supabase Storage. Sólo cliente.
 *
 * Los archivos NUNCA pasan por una función de Vercel (límite de body): van con
 * la sesión del usuario al endpoint resumable (TUS) de Storage, y lo que
 * autoriza la escritura es la policy de `storage.objects` (carpeta propia y post
 * propio en subida, ver la migración `20261004000000_posts.sql`). TUS permite
 * reanudar un video grande a mitad de camino, y da progreso por byte.
 *
 * Supabase pide chunks de exactamente 6 MB para TUS.
 */
import { Upload } from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { POST_MEDIA_BUCKET } from "./constants";

const TUS_CHUNK_BYTES = 6 * 1024 * 1024;

async function accessToken(): Promise<string> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Tu sesión venció. Volvé a iniciar sesión.");
  return token;
}

export interface UploadHandle {
  promise: Promise<void>;
  abort: () => void;
}

/**
 * Sube `blob` a `path` por TUS. `onProgress` recibe 0..1. Un reintento con el
 * mismo `path` reanuda donde quedó (tus-js-client guarda la URL de la subida).
 */
export function uploadResumable(
  blob: Blob,
  path: string,
  contentType: string,
  onProgress: (fraction: number) => void,
): UploadHandle {
  let upload: Upload | null = null;
  const promise = accessToken().then(
    (token) =>
      new Promise<void>((resolve, reject) => {
        upload = new Upload(blob, {
          endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
          retryDelays: [0, 1000, 3000],
          headers: {
            authorization: `Bearer ${token}`,
            // Un reintento después de una subida que sí llegó entera no tiene
            // que fallar con 409: la policy de update permite pisar mientras el
            // post siga en subida.
            "x-upsert": "true",
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: POST_MEDIA_BUCKET,
            objectName: path,
            contentType,
            cacheControl: "3600",
          },
          chunkSize: TUS_CHUNK_BYTES,
          onError: (error) => reject(error),
          onProgress: (sent, total) => onProgress(total > 0 ? sent / total : 0),
          onSuccess: () => {
            onProgress(1);
            resolve();
          },
        });
        upload
          .findPreviousUploads()
          .then((previous) => {
            if (previous.length > 0) upload?.resumeFromPreviousUpload(previous[0]);
            upload?.start();
          })
          .catch(reject);
      }),
  );
  return { promise, abort: () => void upload?.abort() };
}

/** Subida simple, para el derivado y el poster (pesan poco). */
export async function uploadSmall(blob: Blob, path: string, contentType: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(POST_MEDIA_BUCKET)
    .upload(path, blob, { contentType, upsert: true, cacheControl: "3600" });
  if (error) throw new Error(error.message);
}
