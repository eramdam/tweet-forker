import {
  AppBskyEmbedExternal,
  AppBskyEmbedImages,
  AtUri,
  AtpAgent,
  RichText,
} from "@atproto/api";
import fs from "fs";
import mime from "mime-types";
import { findPost } from "../storage";
import { DownloadedMedia } from "./commonTypes";
import { makeMediaFilepath } from "./media";
import { getTweetReplyingTo } from "./twitter";
import { mastodon } from "masto";
import { getMastodonStatusInReplyTo } from "./mastodon";
import { stream } from "undici";

export async function postTweetToBluesky(
  tweet: APITweet,
  mediaFiles: ReadonlyArray<DownloadedMedia>,
) {
  const agent = new AtpAgent({ service: "https://staging.bsky.social" });

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
            fs.readFileSync(makeMediaFilepath(photo.filename)),
            {
              encoding: mime.lookup(makeMediaFilepath(photo.filename)) || "",
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

  const replyToId = getTweetReplyingTo(tweet);
  const maybeInReplyToId =
    replyToId && findPost.fromTwitter.toBluesky(replyToId);
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

export async function postMastodonToBluesky(
  status: mastodon.v1.Status,
  source: mastodon.v1.StatusSource,
  mediaFiles: ReadonlyArray<DownloadedMedia>,
) {
  const agent = new AtpAgent({ service: "https://staging.bsky.social" });

  console.log("[bsky] login");
  const text = source.text;
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
            fs.readFileSync(makeMediaFilepath(photo.filename)),
            {
              encoding: mime.lookup(makeMediaFilepath(photo.filename)) || "",
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

  const replyToId = getMastodonStatusInReplyTo(status);
  const maybeInReplyToId =
    replyToId && findPost.fromMastodon.toBluesky(replyToId);
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

  let embed: AppBskyEmbedImages.Main | AppBskyEmbedExternal.Main | undefined =
    undefined;

  if (imageRecords.length) {
    embed = {
      $type: "app.bsky.embed.images",
      images: imageRecords.map((r, index) => {
        return {
          image: r.data.blob,
          alt: mediaFiles[index]?.altText || "",
        };
      }),
    };
  }

  if (status.card) {
    embed = {
      $type: "app.bsky.embed.external",
      external: {
        description: status.card.description,
        title: status.card.title,
        descriptionHtml: status.card.description || "",
        uri: status.card.url,
      },
    };

    if (status.card.image) {
      await stream(status.card.image, { method: "GET" }, () =>
        fs.createWriteStream(makeMediaFilepath(status.card!.image!)),
      );

      const cardImageRecord = await agent.uploadBlob(
        fs.readFileSync(makeMediaFilepath(status.card!.image!)),
        {
          encoding: mime.lookup(makeMediaFilepath(status.card.image!)) || "",
        },
      );

      embed.external.thumb = cardImageRecord.data.blob;

      fs.unlinkSync(makeMediaFilepath(status.card!.image!));
    }
  }

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
    embed,
  });

  return res;
}
