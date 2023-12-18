import "@total-typescript/ts-reset";
import * as dotenv from "dotenv";
import express, { Response } from "express";
import { compact } from "lodash";
import fs from "node:fs";
import { request } from "undici";
import { blueskyAgent, getPostByUrl, postTweetToBluesky } from "./bsky";
import { setupCleanup } from "./cleanup";
import { postTweetToCohost } from "./cohost";
import {
  blueskyToForker,
  mastodonToForker,
  twitterToForker,
} from "./forkerTypes";
import { postTweetToMastodon } from "./mastodon";
import { downloadMedia } from "./media";
import { expandUrlsInTweetText } from "./redirects";
import { Services, restoreFromDisk, saveStatus, writeToDisk } from "./storage";
import { APITweet } from "./types/fxTwitter";
import { isDev } from "./envHelpers";
import { createRestAPIClient } from "masto";
dotenv.config();
const app = express();
const port = process.env.PORT || 8080;

restoreFromDisk();

const baseRequestOptions = {
  headers: {
    "User-Agent": "Tweet-Forker/1.0 (+https://github.com/eramdam/tweet-forker)",
  },
};

app.all("*", async (req, res, next) => {
  const secret = req.query.secret || "";
  if (secret !== process.env.SECRET && !isDev) {
    return res.sendStatus(403);
  }

  return next();
});

app.get("/", (_req, res) => {
  return res.sendStatus(200);
});

app.get("/u", async (req, res) => {
  try {
    const url = new URL(
      String(req.query.url || "")
        .replace(/^"/gi, "")
        .replace(/"$/gi, ""),
    );
    const services = String(req.query.services).split(",");
    const id = url.pathname.split("/").pop();

    return handleStatus({
      tweetId: String(id),
      res,
      mastodon: services.includes("mastodon"),
      bsky: services.includes("bsky"),
      cohost: services.includes("cohost"),
    });
  } catch (e) {
    console.error(e);
    return res.sendStatus(400);
  }
});

async function handleStatus(options: {
  tweetId: string;
  res: Response;
  mastodon: boolean;
  bsky: boolean;
  cohost: boolean;
}) {
  const { tweetId, res, mastodon, bsky, cohost } = options;
  if (!mastodon && !bsky && !cohost) {
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
      mastodon &&
        async function () {
          console.log("Posting to Mastodon...");
          const toot = await postTweetToMastodon(fxStatus.tweet, mediaFiles);
          const tootId = toot.id;
          saveStatus(tweetId, tootId, Services.Mastodon);
          console.log("Toot!");
        },
      bsky &&
        async function () {
          console.log("Posting to bsky...");
          const skeet = await postTweetToBluesky(fxStatus.tweet, mediaFiles);
          const skeetId = skeet.uri;
          saveStatus(tweetId, skeetId, Services.Bluesky);
          console.log("Skeet!");
        },
      cohost &&
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

app.get("/test", async (req, res) => {
  return res.send(await handleUrl(String(req.query.url)));
});

async function handleUrl(requestUrl: string) {
  const url = new URL(
    String(requestUrl || "")
      .replace(/^"/gi, "")
      .replace(/"$/gi, ""),
  );

  if (url.hostname === "twitter.com" || url.hostname === "x.com") {
    const id = url.pathname.split("/").pop();
    let fxStatus = (await (
      await request(`https://api.fxtwitter.com/status/${id}`)
    ).body.json()) as { tweet: APITweet };

    return twitterToForker(fxStatus.tweet);
  } else if (url.hostname === "bsky.app") {
    await blueskyAgent.login({
      identifier: process.env.BSKY_ID || "",
      password: process.env.BSKY_PASSWORD || "",
    });
    const bskyPost = await getPostByUrl(url.toString());

    return blueskyToForker(bskyPost);
  } else if (url.origin === process.env.MASTODON_URL) {
    const masto = createRestAPIClient({
      url: process.env.MASTODON_URL || "",
      accessToken: process.env.MASTODON_ACCESS_TOKEN,
    });

    const post = await masto.v1.statuses
      .$select(url.pathname.split("/").pop()!)
      .fetch();

    return mastodonToForker(post);
  }

  return undefined;
}

app.all("*", (req, res) => {
  res.sendStatus(404);
});

setupCleanup(() => {
  writeToDisk();
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
