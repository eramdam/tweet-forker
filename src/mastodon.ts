import fs from "fs";
import { createRestAPIClient } from "masto";
import path from "path";
import { findTootFromTweetId } from "./storage";
import { DownloadedMedia } from "./media";
import { getReplyingTo } from "./fxTwitterHelpers";

export async function postTweetToMastodon(
  tweet: APITweet,
  mediaFiles: ReadonlyArray<DownloadedMedia>,
) {
  const text = tweet.text + (tweet.quote?.url ? ` ${tweet.quote?.url}` : ``);
  console.log(`[mastodon] login`);
  const masto = await createRestAPIClient({
    url: process.env.MASTODON_URL || "",
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
  });

  if (mediaFiles.length > 0) {
    console.log(`[mastodon] uploading images...`);
  }
  const attachments = await Promise.all(
    mediaFiles.slice(0, 4).map((photoOrVideo) => {
      return new Promise<Awaited<ReturnType<typeof masto.v2.media.create>>>(
        async (resolve) => {
          console.log(`[mastodon] uploading ${photoOrVideo.filename}`);

          const attachment = await masto.v2.media.create({
            file: new Blob([
              fs.readFileSync(path.basename(photoOrVideo.filename)),
            ]),
            description: photoOrVideo.altText ?? undefined,
          });

          resolve(attachment);
        },
      );
    }),
  );

  const inReplyTo = getReplyingTo(tweet);
  const maybeInReplyToId = inReplyTo && findTootFromTweetId(inReplyTo);

  const status = await masto.v1.statuses.create({
    status: text,
    visibility: "unlisted",
    mediaIds: attachments.map((attachment) => attachment.id),
    inReplyToId: maybeInReplyToId ?? undefined,
  });

  return status;
}
