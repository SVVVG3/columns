"use client";

import { ComposeModal } from "@/components/cast/ComposeModal";

interface ReplyModalProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parentCast: any;
  onClose: () => void;
  onPosted?: () => void;
  threadRootHash?: string;
  viewerFid?: number;
}

export function ReplyModal({ parentCast, onClose, onPosted, threadRootHash, viewerFid }: ReplyModalProps) {
  return (
    <ComposeModal
      onClose={onClose}
      onPosted={onPosted}
      viewerFid={viewerFid}
      parentHash={parentCast.hash}
      parentCast={parentCast}
      threadRootHash={threadRootHash}
    />
  );
}
