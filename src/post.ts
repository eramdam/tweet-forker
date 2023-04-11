import fs from "fs";
import { login, mastodon } from "masto";
import path from "path";
import { stream } from "undici";

mastodon.v2.MediaAttachmentRepository;

export async function postTweetToMastodon(tweet: APITweet) {
  const { text, media } = tweet;
  const masto = await login({
    url: process.env.MASTODON_URL || "",
    accessToken: process.env.ACCESS_TOKEN,
  });

  const attachments = await Promise.all(
    (media?.photos || []).slice(0, 4).map((photo) => {
      return new Promise<
        Awaited<ReturnType<typeof masto.v2.mediaAttachments.create>>
      >(async (resolve) => {
        await stream(
          photo.url,
          {
            method: "GET",
          },
          () => fs.createWriteStream(path.basename(photo.url))
        );

        const attachment = await masto.v2.mediaAttachments.create({
          file: new Blob([fs.readFileSync(path.basename(photo.url))]),
        });

        fs.unlinkSync(path.basename(photo.url));

        resolve(attachment);
      });
    })
  );

  const status = await masto.v1.statuses.create({
    status: text,
    visibility: "unlisted",
    mediaIds: attachments.map((attachment) => attachment.id),
  });
}
