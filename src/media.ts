import { stream } from "undici";
import fs from "node:fs";
import path from "node:path";

export type DownloadedMedia = {
  altText: string;
  filename: string;
};

export async function downloadMedia(tweet: APITweet) {
  return await Promise.all(
    (tweet.media?.photos || tweet.media?.videos || []).map((photoOrVideo) => {
      return new Promise<DownloadedMedia>(async (resolve) => {
        console.log(`Download ${photoOrVideo.url}`);
        await stream(
          photoOrVideo.url,
          {
            method: "GET",
          },
          () => fs.createWriteStream(path.basename(photoOrVideo.url)),
        );

        resolve({
          filename: path.basename(photoOrVideo.url),
          altText: photoOrVideo.altText || "",
        });
      });
    }),
  );
}
