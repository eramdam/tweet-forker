import { compact } from "lodash";
import fs from "node:fs";
import { request } from "undici";
import { postTweetToBluesky } from "../bsky";
import { postTweetToCohost } from "../cohost";
import { postTweetToMastodon } from "../mastodon";
import { downloadMedia } from "../media";
import { expandUrlsInTweetText } from "../redirects";
import { Services, saveStatus } from "../storage";

import { type Express, type Response } from "express";
import { baseRequestOptions } from "../server";

export function mountTwitterRoutes(app: Express) {
  app.get("/fromTwitter", async (req, res) => {
    try {
      const url = new URL(
        String(req.query.url || "")
          .replace(/^"/gi, "")
          .replace(/"$/gi, ""),
      );
      const services = String(req.query.services).split(",");
      const id = url.pathname.split("/").pop();

      return handleTweet({
        tweetId: String(id),
        res,
        postToMastodon: services.includes("mastodon"),
        postToBluesky: services.includes("bsky"),
        postToCohost: services.includes("cohost"),
      });
    } catch (e) {
      console.error(e);
      return res.sendStatus(400);
    }
  });

  async function handleTweet(options: {
    tweetId: string;
    res: Response;
    postToMastodon: boolean;
    postToBluesky: boolean;
    postToCohost: boolean;
  }) {
    const { tweetId, res, postToMastodon, postToBluesky, postToCohost } =
      options;
    if (!postToMastodon && !postToBluesky && !postToCohost) {
      return res
        .status(400)
        .send(
          "No services selected! You need to pass `services=mastodon,bsky,cohost`",
        );
    }
    try {
      let fxStatus = (await (
        await request(
          `https://api.fxtwitter.com/status/${tweetId}`,
          baseRequestOptions,
        )
      ).body.json()) as { tweet: APITweet };

      if (
        fxStatus.tweet.author.screen_name?.toLowerCase() !==
        process.env.SCREEN_NAME
      ) {
        return res.status(403).send(`You can't post someone else's tweet!`);
      }

      fxStatus.tweet.text = await expandUrlsInTweetText(fxStatus.tweet.text);

      const mediaFiles = await downloadMedia(fxStatus.tweet);

      const postingPromises = compact([
        postToMastodon &&
          async function () {
            console.log("Posting to Mastodon...");
            const toot = await postTweetToMastodon(fxStatus.tweet, mediaFiles);
            const tootId = toot.id;
            saveStatus(tweetId, tootId, Services.Mastodon);
            console.log("Toot!");
          },
        postToBluesky &&
          async function () {
            console.log("Posting to bsky...");
            const skeet = await postTweetToBluesky(fxStatus.tweet, mediaFiles);
            const skeetId = skeet.uri;
            saveStatus(tweetId, skeetId, Services.Bluesky);
            console.log("Skeet!");
          },
        postToCohost &&
          async function () {
            console.log("Posting to cohost...");
            const chost = await postTweetToCohost(fxStatus.tweet, mediaFiles);
            saveStatus(tweetId, chost, Services.Cohost);
            console.log("Chost!");
          },
      ]);

      await Promise.all(postingPromises.map((p) => p()));

      mediaFiles.forEach((file) => {
        fs.unlinkSync(file.filename);
      });

      return res.sendStatus(200);
    } catch (e) {
      console.error(e);
      return res.sendStatus(404);
    }
  }
}
