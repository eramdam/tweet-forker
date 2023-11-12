import { AtUri, BskyAgent, RichText } from "@atproto/api";
import fs from "fs";
import mime from "mime-types";
import path from "path";
import { stream } from "undici";
import { findSkeetFromTweetId } from "./storage";
import { DownloadedMedia } from "./media";

export async function postTweetToBluesky(
  tweet: APITweet,
  mediaFiles: ReadonlyArray<DownloadedMedia>,
) {
  const agent = new BskyAgent({ service: "https://staging.bsky.social" });

  console.log("[bsky] login");
  const text = tweet.text + (tweet.quote?.url ? ` ${tweet.quote?.url}` : ``);
  await agent.login({
    identifier: process.env.BSKY_ID || "",
    password: process.env.BSKY_PASSWORD || "",
  });

  if (mediaFiles.length > 0) {
    console.log("[bsky] upload images");
  }
  const imageRecords = await Promise.all(
    mediaFiles.slice(0, 4).map((photo) => {
      return new Promise<Awaited<ReturnType<typeof agent.uploadBlob>>>(
        async (resolve) => {
          console.log(`[bsky] uploading ${photo.filename}`);
          const response = await agent.uploadBlob(
            fs.readFileSync(path.basename(photo.filename)),
            {
              encoding: mime.lookup(path.basename(photo.filename)) || "",
            },
          );

          resolve(response);
        },
      );
    }),
  );

  console.log("[bsky] text formatting");
  const rt = new RichText({ text: text });
  await rt.detectFacets(agent);

  const maybeInReplyToId =
    tweet.replying_to_status && findSkeetFromTweetId(tweet.replying_to_status);
  console.log(`[bsky] in reply to ${maybeInReplyToId}]`);

  const uriP = maybeInReplyToId ? new AtUri(maybeInReplyToId) : undefined;
  const parentPost = uriP
    ? await agent.getPost({
        repo: uriP.host,
        rkey: uriP.rkey,
      })
    : undefined;

  const parentRef = parentPost
    ? {
        uri: parentPost.uri,
        cid: parentPost.cid,
      }
    : undefined;

  const res = await agent.post({
    $type: "app.bsky.feed.post",
    text: rt.text,
    facets: rt.facets,
    reply:
      parentPost && parentRef
        ? {
            root: parentPost.value.reply?.root || parentRef,
            parent: parentRef,
          }
        : undefined,
    embed: imageRecords.length
      ? {
          $type: "app.bsky.embed.images",
          images: imageRecords.map((r, index) => {
            return {
              image: r.data.blob,
              alt: mediaFiles[index]?.altText || "",
            };
          }),
        }
      : undefined,
  });

  return res;
}
