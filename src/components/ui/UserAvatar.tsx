import Image from "next/image";

const SIZES = {
  xs: { px: 16, className: "w-4 h-4" },
  sm: { px: 24, className: "w-6 h-6" },
  md: { px: 28, className: "w-7 h-7" },
  lg: { px: 36, className: "w-9 h-9" },
  xl: { px: 72, className: "w-[72px] h-[72px]" },
  token: { px: 32, className: "w-8 h-8" },
} as const;

export type AvatarSize = keyof typeof SIZES;

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: AvatarSize;
  className?: string;
}

/** Circular avatar — fixed square box + object-cover so non-square source images stay round. */
export function UserAvatar({
  src,
  alt = "",
  size = "lg",
  className = "",
}: UserAvatarProps) {
  const { px, className: sizeClass } = SIZES[size];
  const base = `${sizeClass} rounded-full object-cover shrink-0`;

  if (!src) {
    return (
      <div
        className={`${base} bg-[var(--surface-hover)] ${className}`}
        aria-hidden={!alt}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={px}
      height={px}
      className={`${base} ${className}`}
      unoptimized
    />
  );
}
