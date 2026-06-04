import type { FollowRelationship } from "@/lib/followCheck";

export function profileFollowStatusLines(
  username: string,
  rel: FollowRelationship
): string[] {
  const handle = `@${username.replace(/^@/, "")}`;
  const lines: string[] = [];

  if (rel.viewerFollowsUser && rel.userFollowsViewer) {
    lines.push(`You and ${handle} follow each other`);
  } else {
    if (rel.viewerFollowsUser) lines.push(`You follow ${handle}`);
    if (rel.userFollowsViewer) lines.push(`${handle} follows you`);
  }

  return lines;
}
