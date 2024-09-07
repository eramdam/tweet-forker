import { stream } from "undici";
import fs from "node:fs";
import path from "node:path";
import { DownloadedMedia } from "./commonTypes";
import { makeMediaFilepath } from "./media";

export async function downloadTwitterMedia(tweet: APITweet) {
  return await Promise.all(
    (tweet.media?.photos || tweet.media?.videos || []).map((photoOrVideo) => {
      return new Promise<DownloadedMedia>(async (resolve) => {
        console.log(`Download ${photoOrVideo.url}`);
        await stream(
          photoOrVideo.url,
          {
            method: "GET",
          },
          () => fs.createWriteStream(makeMediaFilepath(photoOrVideo.url)),
        );

        resolve({
          filename: makeMediaFilepath(photoOrVideo.url),
          altText: (photoOrVideo as any).altText || "",
        });
      });
    }),
  );
}
export function getTweetReplyingTo(tweet: APITweet) {
  if (tweet.replying_to_status) {
    return tweet.replying_to_status;
  }
  return tweet.replying_to_status ?? tweet.replying_to?.post ?? null;
}
