import { APITweet } from "./types/fxTwitter";

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
