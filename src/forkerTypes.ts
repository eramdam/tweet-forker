import { AppBskyFeedDefs } from "@atproto/api";
import { APITweet } from "./types/fxTwitter";
import { AppBskyEmbedImages } from "@atproto/api";

export function twitterToForker(tweet: APITweet): ForkerPost {
  return {
    originalSource: "twitter",
    id: tweet.id,
    url: tweet.url,
    text: tweet.text,
    createdAt: tweet.created_at,
    media: (tweet.media?.all || [])?.map((m) => {
      return {
        type: m.type,
        url: m.url,
        altText: m.altText,
      };
    }),
    replyingToStatus: tweet.replying_to_status,
  };
}

export function blueskyToForker(post: AppBskyFeedDefs.PostView): ForkerPost {
  function makeMedia(): PhotoOrVideo[] | undefined {
    const embed = post.embed;

    if (!AppBskyEmbedImages.isView(embed)) {
      return undefined;
    }

    return embed.images.map((i) => {
      return {
        altText: i.alt,
        url: i.fullsize,
        // Bluesky only supports static images as of writing
        type: "photo",
      };
    });
  }
  return {
    originalSource: "bluesky",
    id: post.cid,
    url: post.uri,
    text: (post.record as any).text || "",
    createdAt: post.indexedAt,
    replyingToStatus: null,
    media: makeMedia(),
  };
}

export interface ForkerPost {
  originalSource: "twitter" | "mastodon" | "bluesky" | "cohost";
  id: string;
  url: string;
  text: string;
  createdAt: string;
  media?: PhotoOrVideo[];
  replyingToStatus: string | null;
}

type Photo = {
  type: "photo";
  url: string;
  altText: string;
};
type Video = {
  type: "video" | "gif";
  url: string;
};

type PhotoOrVideo = Photo | Video;
