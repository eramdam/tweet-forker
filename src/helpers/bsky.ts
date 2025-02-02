import {
  AppBskyEmbedExternal,
  AppBskyEmbedImages,
  AppBskyEmbedVideo,
  AtUri,
  AtpAgent,
  AppBskyVideoNS,
  RichText,
  BlobRef,
  AppBskyVideoDefs,
} from "@atproto/api";
import fs from "fs";
import mime from "mime-types";
import { findPost } from "../storage";
import { DownloadedMedia } from "./commonTypes";
import { getVideoDimensions, getVideoSize, makeMediaFilepath } from "./media";
import { getTweetReplyingTo } from "./twitter";
import { mastodon } from "masto";
import { getMastodonStatusInReplyTo } from "./mastodon";
import { stream } from "undici";
import sharp from "sharp";
import { JobStatus } from "@atproto/api/dist/client/types/app/bsky/video/defs";
import { Readable } from "node:stream";

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
    mediaFiles
      .filter((f) => {
        return f.type === "image";
      })
      .slice(0, 4)
      .map((t) => sharp(t.filename).metadata()),
  );
  const imageFiles = mediaFiles.filter((f) => f.type === "image").slice(0, 4);
  const imageRecords = await Promise.all(
    imageFiles.slice(0, 4).map((photo) => {
      return new Promise<Awaited<ReturnType<typeof agent.uploadBlob>>>(
        async (resolve) => {
          console.log(`[bsky] uploading ${photo.filename}`);
          const file = fs.readFileSync(makeMediaFilepath(photo.filename));
          let fileArr = new Uint8Array(file);

          if (
            !photo.filename.endsWith("mp4") &&
            !photo.filename.endsWith("gif")
          ) {
            if (fileArr.length > BSKY_MAX_BLOB_SIZE_IN_BYTES) {
              console.log("Compressing...", photo.filename);
              const compressedResult = await sharp(fileArr)
                .resize({ height: 2000 })
                .jpeg({ quality: 75 })
                .toBuffer();

              fileArr = new Uint8Array(compressedResult.buffer);
            }
          }

          const response = await agent.uploadBlob(fileArr, {
            encoding: mime.lookup(makeMediaFilepath(photo.filename)) || "",
          });

          resolve(response);
        },
      );
    }),
  );
  const videoFiles = mediaFiles.filter((f) => f.type === "video").slice(0, 1);
  const videoAgent = new AtpAgent({ service: "https://video.bsky.app" });
  const { data: serviceAuth } = await agent.com.atproto.server.getServiceAuth({
    aud: `did:web:${agent.dispatchUrl.host}`,
    lxm: "com.atproto.repo.uploadBlob",
    exp: Date.now() / 1000 + 60 * 30, // 30 minutes
  });
  const token = serviceAuth.token;
  const videoRecords = await Promise.all(
    videoFiles.map((video) => {
      return new Promise<Awaited<BlobRef>>(async (resolve, reject) => {
        const uploadUrl = new URL(
          "https://video.bsky.app/xrpc/app.bsky.video.uploadVideo",
        );
        uploadUrl.searchParams.append("did", agent.session!.did);
        uploadUrl.searchParams.append("name", video.filename.split("/").pop()!);

        const uploadResponse = await fetch(uploadUrl, {
          method: "POST",
          duplex: "half",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "video/mp4",
            "Content-Length": String(await getVideoSize(video.filename)),
          },
          body: Readable.toWeb(
            fs.createReadStream(video.filename),
          ) as ReadableStream,
        });

        const jobStatus =
          (await uploadResponse.json()) as AppBskyVideoDefs.JobStatus;
        console.log("JobId:", jobStatus.jobId);
        let blob: BlobRef | undefined = jobStatus.blob;

        while (!blob) {
          const { data: status } = await videoAgent.app.bsky.video.getJobStatus(
            {
              jobId: jobStatus.jobId,
            },
          );
          console.log(
            "Status:",
            status.jobStatus.state,
            status.jobStatus.progress || "",
          );
          if (
            status.jobStatus.blob &&
            status.jobStatus.state === "JOB_STATE_COMPLETED"
          ) {
            blob = status.jobStatus.blob;
          }
        }

        resolve(blob);
      });
    }),
  );
  const videoMetadata = videoFiles[0]
    ? await getVideoDimensions(videoFiles[0].filename)
    : undefined;

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

  let embed:
    | AppBskyEmbedImages.Main
    | AppBskyEmbedExternal.Main
    | AppBskyEmbedVideo.Main
    | undefined = undefined;

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

  if (imageRecords.length) {
    embed = {
      $type: "app.bsky.embed.images",
      images: imageRecords.map((r, index) => {
        return {
          image: r.data.blob,
          alt: imageFiles[index]?.altText || "",
          aspectRatio: {
            width: imageMetadata[index].width,
            height: imageMetadata[index].height,
          },
        };
      }),
    } as AppBskyEmbedImages.Main;
  }

  if (videoRecords.length) {
    embed = {
      $type: "app.bsky.embed.video",
      video: videoRecords[0],
      aspectRatio:
        (videoMetadata && {
          width: videoMetadata.width,
          height: videoMetadata.height,
        }) ||
        undefined,
    };
    console.log(embed);
  }

  if (isStatusTooLong) {
    const embedMeta = await makeEmbedFromMastodonUrl(status.uri);

    embed = {
      $type: "app.bsky.embed.external",
      external: {
        description: embedMeta.description,
        title: embedMeta.title,
        descriptionHtml: embedMeta.description || "",
        uri: embedMeta.url,
      },
    };
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
    embed,
  });

  return res;
}

async function makeEmbedFromMastodonUrl(link: string) {
  const url = new URL(`https://cardyb.bsky.app/v1/extract`);
  url.searchParams.set("url", link);

  const res = await fetch(url.toString());
  return await res.json();
}

function getHostnameFromUrl(url: string | URL): string | null {
  let urlp;
  try {
    urlp = new URL(url);
  } catch (e) {
    return null;
  }
  return urlp.hostname;
}

function getServiceAuthAudFromUrl(url: string | URL): string | null {
  const hostname = getHostnameFromUrl(url);
  if (!hostname) {
    return null;
  }
  return `did:web:${hostname}`;
}
