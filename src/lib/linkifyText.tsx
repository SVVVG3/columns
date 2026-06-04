import type { ReactNode } from "react";

/** @user, /channel, https://…, or bare domains like diviswap.com */
const TOKEN_RE =
  /@([\w.]+)|(?<![^\s/])\/([a-z][a-z0-9-]*)|(https?:\/\/[^\s]+)|(?<![/@\w])((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi;

function splitTrailingPunctuation(value: string): { core: string; trailing: string } {
  const core = value.replace(/[.,!?)\]|;:]+$/, "");
  return { core, trailing: value.slice(core.length) };
}

export interface LinkifyTextOptions {
  /** Open in-app profile preview when an @mention is clicked. */
  onMentionClick?: (username: string) => void;
  /** Add a channel column when a /channel slug is clicked. */
  onChannelClick?: (channelId: string) => void;
}

/** Turn @mentions, /channels, and URLs in plain text into interactive elements. */
export function renderLinkifiedText(
  text: string,
  options?: LinkifyTextOptions
): ReactNode[] {
  const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const [full, mentionUser, channelSlug, protocolUrl, bareDomain] = match;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (mentionUser !== undefined) {
      const { core: username, trailing } = splitTrailingPunctuation(mentionUser);
      const label = `@${username}`;

      if (options?.onMentionClick && username) {
        nodes.push(
          <button
            key={match.index}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              options.onMentionClick!(username);
            }}
            className="text-[var(--accent)] hover:underline focus:outline-none"
          >
            {label}
          </button>
        );
      } else {
        nodes.push(label);
      }
      if (trailing) nodes.push(trailing);
    } else if (channelSlug !== undefined) {
      const { core: slug, trailing } = splitTrailingPunctuation(channelSlug);
      const label = `/${slug}`;

      if (options?.onChannelClick && slug) {
        nodes.push(
          <button
            key={match.index}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              options.onChannelClick!(slug);
            }}
            className="text-[var(--accent)] hover:underline focus:outline-none"
          >
            {label}
          </button>
        );
      } else {
        nodes.push(label);
      }
      if (trailing) nodes.push(trailing);
    } else {
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
    }

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}
