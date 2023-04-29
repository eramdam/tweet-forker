// @ts-expect-error
import cohost from "cohost";
import { stream } from "undici";
import fs from "node:fs";
import path from "node:path";
import { findChostFromTweetId } from "./storage";

export async function postTweetToCohost(
  tweet: APITweet,
  mediaFiles: ReadonlyArray<string>
) {
  const user = new cohost.User();
  await user.login(process.env.COHOST_EMAIL, process.env.COHOST_PASSWORD);
  const projects = await user.getProjects();
  const projectToPostTo = projects.find(
    (p: any) => p.handle === process.env.COHOST_PAGE
  );

  if (!projectToPostTo) {
    console.error(
      new Error(`No cohost projects found for ${process.env.COHOST_PAGE}`)
    );
    return undefined;
  }

  const basePost = {
    postState: 0,
    headline: "",
    adultContent: false,
    cws: [],
    tags: [process.env.COHOST_TAG].filter(Boolean),
    blocks: [
      {
        type: "markdown",
        // ugly-ass hack because im too lazy to do proper markdown here
        markdown: { content: tweet.text.replaceAll("\n", "<br />") },
      },
    ],
    shareOfPostId:
      (tweet.replying_to_status &&
        Number(findChostFromTweetId(tweet.replying_to_status))) ||
      undefined,
  };

  const draftId = await cohost.Post.create(projectToPostTo, basePost);

  const attachmentsData = await Promise.all(
    mediaFiles.slice(0, 4).map((photo) => {
      return new Promise<any>(async (resolve) => {
        console.log(`[cohost] uploading ${photo}`);

        const block = await projectToPostTo.uploadAttachment(
          draftId,
          path.basename(photo)
        );

        resolve(block);
      });
    })
  );

  const chost = await cohost.Post.update(projectToPostTo, draftId, {
    ...basePost,
    postState: 1,
    blocks: [
      ...basePost.blocks,
      ...attachmentsData.map((a) => {
        return {
          type: "attachment",
          attachment: {
            ...a,
          },
        };
      }),
    ],
  });

  return chost;
}
