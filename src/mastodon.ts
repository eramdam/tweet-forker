import fs from "fs";
import { createRestAPIClient, mastodon } from "masto";
import path from "path";
import { findTootFromTweetId } from "./storage";
import { DownloadedMedia } from "./helpers/commonTypes";
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

export async function getJsonFromMastodon(url: string): Promise<{
  status: mastodon.v1.Status;
  source: mastodon.v1.StatusSource;
}> {
  const masto = createRestAPIClient({
    url: process.env.MASTODON_URL || "",
    accessToken: process.env.MASTODON_ACCESS_TOKEN,
  });

  const results = await masto.v2.search.list({
    q: url,
    resolve: true,
    limit: 1,
  });

  const firstStatus = results.statuses[0];

  if (!firstStatus) {
    throw new MastodonStatusNotFoundError("No status found");
  }

  const status = await masto.v1.statuses.$select(firstStatus.id).fetch();
  const source = await masto.v1.statuses.$select(status.id).source.fetch();

  return { status, source };
}

export class MastodonStatusNotFoundError extends Error {}
