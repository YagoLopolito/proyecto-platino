import Image from "next/image";

/** Marca de producto mostrada arriba de los forms de login/registro. */
export function AuthBrandMark() {
  return (
    <div className="mb-6 flex justify-center">
      <Image
        src="/logo.webp"
        alt="Platinoob"
        width={900}
        height={153}
        priority
        unoptimized
        className="h-9 w-auto"
      />
    </div>
  );
}
