import { mastodon } from "masto";

export type DownloadedMedia = {
  altText: string;
  filename: string;
  type: mastodon.v1.MediaAttachmentType;
};
