import Image from "next/image";

/** Avatar de PSN del usuario, con placeholder cuando la cuenta no tiene uno. */
export function FriendAvatar({
  url,
  name,
  size = 32,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  const className = "shrink-0 rounded-full object-cover";
  if (!url) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400"
        aria-hidden="true"
      >
        {name.slice(0, 1).toUpperCase()}
      </div>
    );
  }
  return <Image src={url} alt="" width={size} height={size} className={className} />;
}
