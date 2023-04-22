import fs from "fs";
import { login, mastodon } from "masto";
import path from "path";
import { stream } from "undici";
import { findStatus } from "./storage";

mastodon.v2.MediaAttachmentRepository;

export async function postTweetToMastodon(tweet: APITweet) {
  const { text, media } = tweet;
  const masto = await login({
    url: process.env.MASTODON_URL || "",
    accessToken: process.env.ACCESS_TOKEN,
  });

  const attachments = await Promise.all(
    (media?.photos || media?.videos || []).slice(0, 4).map((photoOrVideo) => {
      return new Promise<
        Awaited<ReturnType<typeof masto.v2.mediaAttachments.create>>
      >(async (resolve) => {
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
    tweet.replying_to_status && findStatus(tweet.replying_to_status);

  const status = await masto.v1.statuses.create({
    status: text,
    visibility: "unlisted",
    mediaIds: attachments.map((attachment) => attachment.id),
    inReplyToId: maybeInReplyToId ?? undefined,
  });

  return status;
}
