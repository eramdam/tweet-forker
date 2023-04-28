import fs from "fs";
import { login } from "masto";
import path from "path";
import { stream } from "undici";
import { findTootFromTweetId } from "./storage";

export async function postTweetToMastodon(tweet: APITweet) {
  const { text, media } = tweet;
  console.log(`[mastodon] login`);
  const masto = await login({
    url: process.env.MASTODON_URL || "",
    accessToken: process.env.ACCESS_TOKEN,
  });

  console.log(`[mastodon] uploading images...`);
  const attachments = await Promise.all(
    (media?.photos || media?.videos || []).slice(0, 4).map((photoOrVideo) => {
      return new Promise<
        Awaited<ReturnType<typeof masto.v2.mediaAttachments.create>>
      >(async (resolve) => {
        console.log(`[mastodon] uploading ${photoOrVideo.url}`);
        await stream(
          photoOrVideo.url,
          {
            method: "GET",
          },
          () => fs.createWriteStream(path.basename(photoOrVideo.url))
        );

        const attachment = await masto.v2.mediaAttachments.create({
          file: new Blob([fs.readFileSync(path.basename(photoOrVideo.url))]),
        });

        fs.unlinkSync(path.basename(photoOrVideo.url));

        resolve(attachment);
      });
    })
  );

  const maybeInReplyToId =
    tweet.replying_to_status && findTootFromTweetId(tweet.replying_to_status);
  console.log({ maybeInReplyToId });

  const status = await masto.v1.statuses.create({
    status: text,
    visibility: "unlisted",
    mediaIds: attachments.map((attachment) => attachment.id),
    inReplyToId: maybeInReplyToId ?? undefined,
  });

  return status;
}
