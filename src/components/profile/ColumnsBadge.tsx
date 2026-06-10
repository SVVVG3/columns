import Image from "next/image";
import columnsLogo from "../../../public/columns-logo.png";

/** Badge shown on profiles of Columns Pro members. */
export function ColumnsBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 shrink-0"
      title="Columns Pro"
    >
      <span className="w-5 h-5 rounded-md overflow-hidden shrink-0 bg-[var(--surface)] border border-[var(--accent)]/30 flex items-center justify-center">
        <Image
          src={columnsLogo}
          alt=""
          width={20}
          height={20}
          className="w-full h-full object-cover"
        />
      </span>
      <span className="text-[11px] font-semibold text-[var(--accent)] whitespace-nowrap">
        Columns Pro
      </span>
    </span>
  );
}
