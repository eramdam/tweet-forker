import * as dotenv from "dotenv";
import express from "express";
import { setupCleanup } from "./cleanup";
import { mountTwitterRoutes } from "./routes/twitterRoutes";
import { restoreFromDisk, writeToDisk } from "./storage";
import { mountMastodonRoutes } from "./routes/mastodonRoutes";

dotenv.config();
const app = express();
const port = process.env.PORT || 8080;
const isDev = process.env.NODE_ENV !== "production";

restoreFromDisk();

export const baseRequestOptions = {
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

mountTwitterRoutes(app);
mountMastodonRoutes(app);

app.all("*", (req, res) => {
  res.sendStatus(404);
});

setupCleanup(() => {
  writeToDisk();
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
