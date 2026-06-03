"use client";

import { ComposeModal } from "@/components/cast/ComposeModal";

interface ReplyModalProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parentCast: any;
  onClose: () => void;
  threadRootHash?: string;
}

export function ReplyModal({ parentCast, onClose, threadRootHash }: ReplyModalProps) {
  return (
    <ComposeModal
      onClose={onClose}
      parentHash={parentCast.hash}
      parentCast={parentCast}
      threadRootHash={threadRootHash}
    />
  );
}
