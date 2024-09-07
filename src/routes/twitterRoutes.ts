import { compact } from "lodash";
import fs from "node:fs";
import { request } from "undici";
import { postTweetToBluesky } from "../helpers/bsky";
import { postTweetToCohost } from "../helpers/cohost";
import { postTweetToMastodon } from "../helpers/mastodon";
import { downloadTwitterMedia } from "../helpers/twitter";
import { expandUrlsInTweetText } from "../redirects";
import { savePost } from "../storage";

import { type Express, type Response } from "express";
import { baseRequestOptions } from "../server";
import { parseQuery } from "./routeHelpers";

export function mountTwitterRoutes(app: Express) {
  app.get("/fromTwitter", async (req, res) => {
    try {
      const { url, services } = parseQuery(req);
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

      const mediaFiles = await downloadTwitterMedia(fxStatus.tweet);

      const postingPromises = compact([
        postToMastodon &&
          async function () {
            console.log("Posting to Mastodon...");
            const toot = await postTweetToMastodon(fxStatus.tweet, mediaFiles);
            const tootId = toot.id;
            savePost.fromTwitter.toMastodon(tweetId, tootId);
            console.log("Toot!");
          },
        postToBluesky &&
          async function () {
            console.log("Posting to bsky...");
            const blueskyPost = await postTweetToBluesky(
              fxStatus.tweet,
              mediaFiles,
            );
            const blueskyPostId = blueskyPost.uri;
            savePost.fromTwitter.toBluesky(tweetId, blueskyPostId);
            console.log("Post!");
          },
        postToCohost &&
          async function () {
            console.log("Posting to cohost...");
            const chost = await postTweetToCohost(fxStatus.tweet, mediaFiles);
            if (chost) {
              savePost.fromTwitter.toCohost(tweetId, chost);
              console.log("Chost!");
            }
          },
      ]);

      await Promise.all(postingPromises.map((p) => p()));

      mediaFiles.forEach((file) => {
        fs.unlinkSync(file.filename);
      });

      return res.sendStatus(200);
    } catch (e) {
      console.error(e);
      return res.sendStatus(500);
    }
  }
}
