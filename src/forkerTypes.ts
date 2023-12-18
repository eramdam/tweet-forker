import { AppBskyFeedDefs } from "@atproto/api";
import { APIPhoto, APITweet } from "./types/fxTwitter";
import { AppBskyEmbedImages } from "@atproto/api";
import { mastodon } from "masto";
import { convert as htmlToTextConvert } from "html-to-text";

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
        altText: m.type === "photo" ? (m as APIPhoto).altText : "",
      };
    }) as PhotoOrVideo[],
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

export function mastodonToForker(post: mastodon.v1.Status): ForkerPost {
  function makeMedia(): ForkerPost["media"] {
    if (post.mediaAttachments.length <= 0) {
      return undefined;
    }

    return post.mediaAttachments
      .map((m) => {
        if (m.type === "unknown" || m.type === "audio") {
          return undefined;
        }

        return m;
      })
      .filter(Boolean)
      .map((m) => {
        let type = "";

        if (m.type === "gifv") {
          type = "gif";
        } else if (m.type === "image") {
          type = "photo";
        } else if (m.type === "video") {
          type = "video";
        }

        return {
          type,
          url: m.url,
          altText: m.description || "",
        } as PhotoOrVideo;
      });
  }
  return {
    originalSource: "mastodon",
    id: post.id,
    url: post.url || post.uri,
    text: htmlToTextConvert(post.content || "", {
      wordwrap: false,
    }),
    createdAt: post.createdAt,
    replyingToStatus: post.inReplyToId || null,
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
