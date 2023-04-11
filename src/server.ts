import * as dotenv from "dotenv";
dotenv.config();
import { request } from "undici";
import express from "express";
import { postTweetToMastodon } from "./post";
const app = express();
const port = 8080;

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
    const id = url.pathname.split("/").pop();
    console.log({ id });

    return res.redirect(`/s/${id}`);
  } catch (e) {
    return res.sendStatus(400);
  }
});

app.get("/s/:tweetId", async (req, res) => {
  try {
    const fxStatus = (await (
      await request(`https://api.fxtwitter.com/status/${req.params.tweetId}`)
    ).body.json()) as { tweet: APITweet };

    if (
      fxStatus.tweet.author.screen_name?.toLowerCase() !==
      process.env.SCREEN_NAME
    ) {
      return res.sendStatus(403);
    }

    await postTweetToMastodon(fxStatus.tweet);

    return res.sendStatus(200);
  } catch (e) {
    return res.sendStatus(404);
  }
});

app.all("*", (req, res) => {
  res.sendStatus(404);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
