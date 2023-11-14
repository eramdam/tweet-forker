import { AtUri, BskyAgent, RichText } from "@atproto/api";
import fs from "fs";
import mime from "mime-types";
import path from "path";
import { APITweet } from "./types/fxTwitter";
import { DownloadedMedia } from "./media";
import { getReplyingTo } from "./fxTwitterHelpers";
import { findSkeetFromTweetId } from "./storage";

export const blueskyAgent = new BskyAgent({ service: "https://bsky.social" });

export async function postTweetToBluesky(
  tweet: APITweet,
  mediaFiles: ReadonlyArray<DownloadedMedia>,
) {
  console.log("[bsky] login");
  const text = tweet.text + (tweet.quote?.url ? ` ${tweet.quote?.url}` : ``);
  await blueskyAgent.login({
    identifier: process.env.BSKY_ID || "",
    password: process.env.BSKY_PASSWORD || "",
  });

  if (mediaFiles.length > 0) {
    console.log("[bsky] upload images");
  }
  const imageRecords = await Promise.all(
    mediaFiles.slice(0, 4).map((photo) => {
      return new Promise<Awaited<ReturnType<typeof blueskyAgent.uploadBlob>>>(
        async (resolve) => {
          console.log(`[bsky] uploading ${photo.filename}`);
          const response = await blueskyAgent.uploadBlob(
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
  await rt.detectFacets(blueskyAgent);

  const replyToId = getReplyingTo(tweet);
  const maybeInReplyToId = replyToId && findSkeetFromTweetId(replyToId);
  console.log(`[bsky] in reply to ${maybeInReplyToId}]`);

  const uriP = maybeInReplyToId ? new AtUri(maybeInReplyToId) : undefined;
  const parentPost = uriP
    ? await blueskyAgent.getPost({
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

  const res = await blueskyAgent.post({
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

export async function getPostByUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  let usernameFromUrl = url.pathname.split("/")[2];
  let did: string = "";

  if (!usernameFromUrl.includes("did:plc")) {
    console.log({ usernameFromUrl });
    did = (
      await blueskyAgent.resolveHandle({
        handle: usernameFromUrl,
      })
    ).data.did;
  } else {
    did = usernameFromUrl;
  }

  const postId = url.pathname.split("/")[4];
  const uri = `at://${did}/app.bsky.feed.post/${postId}`;
  const post = await blueskyAgent.getPosts({
    uris: [uri],
  });

  return post.data?.posts?.[0];
}

export enum BlueskyEmbedRecordTypes {}
