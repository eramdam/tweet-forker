// @ts-expect-error
import cohost from "cohost";
import { mastodon } from "masto";
import path from "node:path";
import { findPost } from "../storage";
import { DownloadedMedia } from "./commonTypes";
import { getMastodonStatusInReplyTo } from "./mastodon";
import { getTweetReplyingTo } from "./twitter";
import { makeMediaFilepath } from "./media";

export async function postTweetToCohost(
  tweet: APITweet,
  mediaFiles: ReadonlyArray<DownloadedMedia>,
): Promise<string | undefined> {
  const user = new cohost.User();
  await user.login(process.env.COHOST_EMAIL, process.env.COHOST_PASSWORD);
  const projects = await user.getProjects();
  const projectToPostTo = projects.find(
    (p: any) => p.handle === process.env.COHOST_PAGE,
  );

  if (!projectToPostTo) {
    console.error(
      new Error(`No cohost projects found for ${process.env.COHOST_PAGE}`),
    );
    return undefined;
  }

  // ugly-ass hack because im too lazy to do proper markdown here
  const text = tweet.text.replaceAll("\n", "<br />");

  const tweetReplyToId = getTweetReplyingTo(tweet);

  const basePost = {
    postState: 0,
    headline: "",
    adultContent: false,
    cws: [],
    tags: [process.env.COHOST_TAG].filter(Boolean),
    blocks: [
      {
        type: "markdown",
        markdown: { content: text },
      },
    ],
    shareOfPostId:
      (tweetReplyToId &&
        Number(findPost.fromTwitter.toCohost(tweetReplyToId))) ||
      undefined,
  };

  const draftId = await cohost.Post.create(projectToPostTo, basePost);

  const attachmentsData = await Promise.all(
    mediaFiles.slice(0, 4).map((photo) => {
      return new Promise<any>(async (resolve) => {
        console.log(`[cohost] uploading ${photo.filename}`);

        const block = await projectToPostTo.uploadAttachment(
          draftId,
          makeMediaFilepath(photo.filename),
        );

        resolve(block);
      });
    }),
  );

  const chost = await cohost.Post.update(projectToPostTo, draftId, {
    ...basePost,
    postState: 1,
    blocks: [
      ...basePost.blocks,
      ...attachmentsData.map((a, index) => {
        return {
          type: "attachment",
          attachment: {
            ...a,
            altText: mediaFiles[index]?.altText ?? "",
          },
        };
      }),
    ],
  });

  return String(chost);
}

export async function postMastodonToCohost(
  status: mastodon.v1.Status,
  source: mastodon.v1.StatusSource,
  mediaFiles: ReadonlyArray<DownloadedMedia>,
): Promise<string | undefined> {
  const user = new cohost.User();
  await user.login(process.env.COHOST_EMAIL, process.env.COHOST_PASSWORD);
  const projects = await user.getProjects();
  const projectToPostTo = projects.find(
    (p: any) => p.handle === process.env.COHOST_PAGE,
  );

  if (!projectToPostTo) {
    console.error(
      new Error(`No cohost projects found for ${process.env.COHOST_PAGE}`),
    );
    return undefined;
  }

  const text = source.text;
  const contentWarnings = source.spoilerText
    ? source.spoilerText.split(",").map((s) => s.trim())
    : [];

  const mastodonReplyToId = getMastodonStatusInReplyTo(status);

  const basePost = {
    postState: 0,
    headline: "",
    adultContent: false,
    cws: contentWarnings,
    tags: [process.env.COHOST_TAG].filter(Boolean),
    blocks: [
      {
        type: "markdown",
        markdown: { content: text },
      },
    ],
    shareOfPostId:
      (mastodonReplyToId &&
        Number(findPost.fromMastodon.toCohost(mastodonReplyToId))) ||
      undefined,
  };

  const draftId = await cohost.Post.create(projectToPostTo, basePost);
  const attachmentsData = await Promise.all(
    mediaFiles.slice(0, 4).map((photo) => {
      return new Promise<any>(async (resolve) => {
        console.log(`[cohost] uploading ${photo.filename}`);

        const block = await projectToPostTo.uploadAttachment(
          draftId,
          makeMediaFilepath(photo.filename),
        );

        resolve(block);
      });
    }),
  );

  const chost = await cohost.Post.update(projectToPostTo, draftId, {
    ...basePost,
    postState: 1,
    blocks: [
      ...basePost.blocks,
      ...attachmentsData.map((a, index) => {
        return {
          type: "attachment",
          attachment: {
            ...a,
            altText: mediaFiles[index]?.altText ?? "",
          },
        };
      }),
    ],
  });

  return String(chost);
}
