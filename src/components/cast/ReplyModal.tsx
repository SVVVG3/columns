"use client";

import { ComposeModal } from "@/components/cast/ComposeModal";

interface ReplyModalProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parentCast: any;
  onClose: () => void;
  threadRootHash?: string;
  viewerFid?: number;
}

export function ReplyModal({ parentCast, onClose, threadRootHash, viewerFid }: ReplyModalProps) {
  return (
    <ComposeModal
      onClose={onClose}
      viewerFid={viewerFid}
      parentHash={parentCast.hash}
      parentCast={parentCast}
      threadRootHash={threadRootHash}
    />
  );
}
