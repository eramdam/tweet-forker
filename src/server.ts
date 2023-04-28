import * as dotenv from "dotenv";
dotenv.config();
import { request } from "undici";
import express, { Request, Response } from "express";
import { postTweetToMastodon } from "./mastodon";
import { setupCleanup } from "./cleanup";
import { Services, saveStatus, writeToDisk } from "./storage";
import { restoreFromDisk } from "./storage";
import { postTweetToBluesky } from "./bsky";
import { postTweetToCohost } from "./cohost";
const app = express();
const port = process.env.PORT || 8080;

restoreFromDisk();

app.all("*", async (req, res, next) => {
  const secret = req.query.secret || "";
  if (secret !== process.env.SECRET) {
    return res.sendStatus(403);
  }

  return next();
});

app.get("/", (_req, res) => {
  return res.sendStatus(200);
});

app.get("/u", async (req, res) => {
  try {
    const url = new URL(String(req.query.url || ""));
    const mastodon = req.query.mastodon ? req.query.mastodon === "true" : true;
    const bsky = req.query.bsky ? req.query.bsky === "true" : true;
    const cohost = req.query.cohost ? req.query.cohost === "true" : true;
    const id = url.pathname.split("/").pop();

    console.log({ cohost });
    return handleStatus({
      tweetId: String(id),
      res,
      mastodon,
      bsky,
      cohost,
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
  try {
    const fxStatus = (await (
      await request(`https://api.fxtwitter.com/status/${tweetId}`)
    ).body.json()) as { tweet: APITweet };

    if (
      fxStatus.tweet.author.screen_name?.toLowerCase() !==
      process.env.SCREEN_NAME
    ) {
      return res.sendStatus(403);
    }

    if (mastodon) {
      console.log("Posting to Mastodon...");
      const toot = await postTweetToMastodon(fxStatus.tweet);
      const tootId = toot.id;
      saveStatus(tweetId, tootId, Services.Mastodon);
      console.log("Toot!");
    }

    if (bsky) {
      console.log("Posting to bsky...");
      const skeet = await postTweetToBluesky(fxStatus.tweet);
      console.log(skeet);
      const skeetId = skeet.uri;
      saveStatus(tweetId, skeetId, Services.Bluesky);
      console.log("Skeet!");
    }

    if (cohost) {
      console.log("Posting to cohost...");
      const chost = await postTweetToCohost(fxStatus.tweet);
      console.log(chost);
      saveStatus(tweetId, chost, Services.Cohost);
      console.log("Chost!");
    }

    return res.sendStatus(200);
  } catch (e) {
    return res.sendStatus(404);
  }
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
