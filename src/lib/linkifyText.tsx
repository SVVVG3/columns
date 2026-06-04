import type { ReactNode } from "react";

/** https://… or bare domains like diviswap.com */
const LINK_RE =
  /(https?:\/\/[^\s]+)|(?<![/@\w])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;

function splitTrailingPunctuation(url: string): { core: string; trailing: string } {
  const core = url.replace(/[.,!?)\]|;:]+$/, "");
  return { core, trailing: url.slice(core.length) };
}

/** Turn URLs in plain text into links that open in a new tab. */
export function renderLinkifiedText(text: string): ReactNode[] {
  const re = new RegExp(LINK_RE.source, LINK_RE.flags);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const [full, protocolUrl, bareDomain] = match;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const raw = protocolUrl ?? bareDomain ?? full;
    const { core, trailing } = splitTrailingPunctuation(raw);
    const href = protocolUrl ? core : `https://${core}`;

    nodes.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--accent)] hover:underline break-all"
      >
        {core}
      </a>
    );
    if (trailing) nodes.push(trailing);

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}
