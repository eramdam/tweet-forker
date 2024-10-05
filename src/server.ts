import * as dotenv from "dotenv";
import fs from "node:fs";
import express from "express";
import { setupCleanup } from "./cleanup";
import { mountTwitterRoutes } from "./routes/twitterRoutes";
import { restoreFromDisk, savePost, writeToDisk } from "./storage";
import { mountMastodonRoutes } from "./routes/mastodonRoutes";

dotenv.config();
const app = express();
const port = process.env.PORT || 8080;
const isDev = process.env.NODE_ENV !== "production";

if (!fs.existsSync("media")) {
  console.log("Creating media folder");
  fs.mkdirSync("media");
}

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

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
