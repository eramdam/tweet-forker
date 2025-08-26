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
import sharp from "sharp";

const BSKY_MAX_BLOB_SIZE_IN_BYTES = 976_560;

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
  const isStatusTooLong = source.text.length > 300;
  const text = isStatusTooLong ? source.text.slice(0, 299) + "…" : source.text;
  await agent.login({
    identifier: process.env.BSKY_ID || "",
    password: process.env.BSKY_PASSWORD || "",
  });

  if (mediaFiles.length > 0) {
    console.log("[bsky] upload images");
  }
  const imageMetadata = await Promise.all(
    mediaFiles.slice(0, 4).map((t) => sharp(t.filename).metadata()),
  );
  const imageRecords = await Promise.all(
    mediaFiles.slice(0, 4).map((photo) => {
      return new Promise<Awaited<ReturnType<typeof agent.uploadBlob>>>(
        async (resolve) => {
          console.log(`[bsky] uploading ${photo.filename}`);
          const file = fs.readFileSync(makeMediaFilepath(photo.filename));
          let fileArr = new Uint8Array(file);

          if (fileArr.length > BSKY_MAX_BLOB_SIZE_IN_BYTES) {
            console.log("Compressing...", photo.filename);
            const compressedResult = await sharp(fileArr)
              .resize({ height: 2000 })
              .jpeg({ quality: 75 })
              .toBuffer();

            fileArr = new Uint8Array(compressedResult.buffer);
          }

          const response = await agent.uploadBlob(fileArr, {
            encoding: mime.lookup(makeMediaFilepath(photo.filename)) || "",
          });

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

  if (status.card) {
    embed = {
      $type: "app.bsky.embed.external",
      external: {
        description: status.card.description,
        title: status.card.title,
        uri: status.card.url,
      },
    } satisfies AppBskyEmbedExternal.Main;

    if (status.card.image) {
      await stream(status.card.image, { method: "GET" }, () =>
        fs.createWriteStream(makeMediaFilepath(status.card!.image!)),
      );

      const file = fs.readFileSync(makeMediaFilepath(status.card!.image!));
      const fileArr = new Uint8Array(file);
      const cardImageRecord = await agent.uploadBlob(fileArr, {
        encoding: mime.lookup(makeMediaFilepath(status.card.image!)) || "",
      });

      embed.external.thumb = cardImageRecord.data.blob;

      fs.unlinkSync(makeMediaFilepath(status.card!.image!));
    }
  }

  if (imageRecords.length) {
    embed = {
      $type: "app.bsky.embed.images",
      images: imageRecords.map((r, index) => {
        return {
          image: r.data.blob,
          alt: mediaFiles[index]?.altText || "",
          aspectRatio: {
            width: imageMetadata[index].width || 1,
            height: imageMetadata[index].height || 1,
          },
        };
      }),
    } satisfies AppBskyEmbedImages.Main;
  }

  if (isStatusTooLong) {
    const embedMeta = await makeEmbedFromMastodonUrl(status.uri);

    embed = {
      $type: "app.bsky.embed.external",
      external: {
        description: embedMeta.description,
        title: embedMeta.title,
        uri: embedMeta.url,
      },
    } as const;
  }

  const res = await agent.post({
    $type: "app.bsky.feed.post",
    text: rt.text,
    facets: rt.facets,
    langs: status.language ? [status.language] : ["en-US"],
    reply:
      parentPost && parentRef
        ? {
            root: parentPost.value.reply?.root || parentRef,
            parent: parentRef,
          }
        : undefined,
    // @ts-expect-error
    embed: embed?.$type ? embed : undefined,
  });

  const { rkey } = new AtUri(res.uri);

  if (agent.session?.did) {
    await agent.com.atproto.repo.createRecord({
      repo: agent.session?.did,
      collection: "app.bsky.feed.threadgate",
      rkey,
      record: {
        $type: "app.bsky.feed.threadgate",
        post: res.uri,
        allow: [{ $type: "app.bsky.feed.threadgate#followerRule" }],
        createdAt: new Date().toISOString(),
      },
    });
  }

  return res;
}

async function makeEmbedFromMastodonUrl(link: string) {
  const url = new URL(`https://cardyb.bsky.app/v1/extract`);
  url.searchParams.set("url", link);

  const res = await fetch(url.toString());
  return await res.json();
}
