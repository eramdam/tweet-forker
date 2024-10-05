import { TwitterApi } from "twitter-api-v2";
import { stream } from "undici";
import fs from "node:fs";
import path from "node:path";
import { DownloadedMedia } from "./commonTypes";
import { makeMediaFilepath } from "./media";
import { mastodon } from "masto";
import { findPost } from "../storage";

export async function downloadTwitterMedia(tweet: APITweet) {
  return await Promise.all(
    (tweet.media?.photos || tweet.media?.videos || []).map((photoOrVideo) => {
      return new Promise<DownloadedMedia>(async (resolve) => {
        console.log(`Download ${photoOrVideo.url}`);
        await stream(
          photoOrVideo.url,
          {
            method: "GET",
          },
          () => fs.createWriteStream(makeMediaFilepath(photoOrVideo.url)),
        );

        resolve({
          filename: makeMediaFilepath(photoOrVideo.url),
          altText: (photoOrVideo as any).altText || "",
        });
      });
    }),
  );
}
export function getTweetReplyingTo(tweet: APITweet) {
  if (tweet.replying_to_status) {
    return tweet.replying_to_status;
  }
  return tweet.replying_to_status ?? tweet.replying_to?.post ?? null;
}

export async function postMastodonToTwitter(
  status: mastodon.v1.Status,
  source: mastodon.v1.StatusSource,
  mediaFiles: ReadonlyArray<DownloadedMedia>,
) {
  try {
    console.log("[twitter] login");
    const twitterClient = new TwitterApi({
      appKey: process.env.TWITTER_API_KEY || "",
      appSecret: process.env.TWITTER_API_KEY_SECRET || "",
      accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
      accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || "",
    });

    const text = source.text;
    const textTooLong = text.length > 280;
    let tweetText = textTooLong
      ? text.slice(0, 252) + "…" + ` ${status.uri}`
      : text;

    if (status.spoilerText) {
      tweetText = `[cw ${status.spoilerText}] ${status.uri}`;
    }

    const mediaIds = await Promise.all(
      mediaFiles
        .filter(() => {
          return !status.spoilerText;
        })
        .slice(0, 4)
        .map((photo) => {
          return new Promise<string>(async (resolve) => {
            console.log(`[twitter] uploading ${photo.filename}`);
            const mediaId = await twitterClient.v1.uploadMedia(
              photo.filename,
              {},
            );
            if (photo.altText) {
              await twitterClient.v1.createMediaMetadata(mediaId, {
                alt_text: {
                  text: photo.altText,
                },
              });
            }
            resolve(mediaId);
          });
        }),
    );

    console.log("[twitter] tweeting");

    const maybeInReplyToId =
      (status.inReplyToId &&
        findPost.fromMastodon.toTwitter(status.inReplyToId)) ||
      undefined;

    return await twitterClient.v2.tweet(tweetText, {
      // @ts-expect-error
      media: mediaIds.length
        ? {
            media_ids: mediaIds,
          }
        : undefined,
      reply: maybeInReplyToId
        ? {
            in_reply_to_tweet_id: maybeInReplyToId,
          }
        : undefined,
    });
  } catch (e) {
    console.error(e);
  }
}
