import { AtUri, BskyAgent, RichText } from "@atproto/api";
import fs from "fs";
import mime from "mime-types";
import path from "path";
import { stream } from "undici";
import { findSkeetFromTweetId } from "./storage";

export async function postTweetToBluesky(
  tweet: APITweet,
  mediaFiles: ReadonlyArray<string>
) {
  const agent = new BskyAgent({ service: "https://staging.bsky.social" });

  console.log("[bsky] login");
  await agent.login({
    identifier: process.env.BSKY_ID || "",
    password: process.env.BSKY_PASSWORD || "",
  });
  const { media, text } = tweet;

  console.log("[bsky] upload images if needed");
  const imageRecords = await Promise.all(
    mediaFiles.slice(0, 4).map((photo) => {
      return new Promise<Awaited<ReturnType<typeof agent.uploadBlob>>>(
        async (resolve) => {
          const response = await agent.uploadBlob(
            fs.readFileSync(path.basename(photo)),
            {
              encoding: mime.lookup(path.basename(photo)) || "",
            }
          );

          resolve(response);
        }
      );
    })
  );

  console.log("[bsky] text formatting");
  const rt = new RichText({ text: text });
  await rt.detectFacets(agent);

  const maybeInReplyToId =
    tweet.replying_to_status && findSkeetFromTweetId(tweet.replying_to_status);
  console.log(`[bsky] in reply to ${maybeInReplyToId}]`);

  const uriP = maybeInReplyToId ? new AtUri(maybeInReplyToId) : undefined;
  console.log({ uriP });
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
          images: imageRecords.map((r) => {
            return {
              image: r.data.blob,
              alt: "",
            };
          }),
        }
      : undefined,
  });

  return res;
}
