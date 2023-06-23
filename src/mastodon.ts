import fs from "fs";
import { login } from "masto";
import path from "path";
import { findTootFromTweetId } from "./storage";
import { DownloadedMedia } from "./media";

export async function postTweetToMastodon(
  tweet: APITweet,
  mediaFiles: ReadonlyArray<DownloadedMedia>
) {
  const text = tweet.text + (tweet.quote?.url ? ` ${tweet.quote?.url}` : ``);
  console.log(`[mastodon] login`);
  const masto = await login({
    url: process.env.MASTODON_URL || "",
    accessToken: process.env.ACCESS_TOKEN,
  });

  console.log(`[mastodon] uploading images...`);
  const attachments = await Promise.all(
    mediaFiles.slice(0, 4).map((photoOrVideo) => {
      return new Promise<
        Awaited<ReturnType<typeof masto.v2.mediaAttachments.create>>
      >(async (resolve) => {
        console.log(`[mastodon] uploading ${photoOrVideo}`);

        const attachment = await masto.v2.mediaAttachments.create({
          file: new Blob([
            fs.readFileSync(path.basename(photoOrVideo.filename)),
          ]),
          description: photoOrVideo.altText ?? undefined,
        });

        resolve(attachment);
      });
    })
  );

  const maybeInReplyToId =
    tweet.replying_to_status && findTootFromTweetId(tweet.replying_to_status);

  const status = await masto.v1.statuses.create({
    status: text,
    visibility: "unlisted",
    mediaIds: attachments.map((attachment) => attachment.id),
    inReplyToId: maybeInReplyToId ?? undefined,
  });

  return status;
}
