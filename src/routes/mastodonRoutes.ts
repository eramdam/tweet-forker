import fs from "node:fs";
import { type Express, type Response } from "express";
import { parseQuery } from "./routeHelpers";
import {
  downloadMastodonMedia,
  getStatusAndSourceFromMastodonUrl,
  MastodonStatusNotFoundError,
} from "../helpers/mastodon";
import { mastodon } from "masto";
import { postMastodonToCohost } from "../helpers/cohost";
import { savePost } from "../storage";
import { compact } from "lodash";
import { postMastodonToBluesky } from "../helpers/bsky";

export function mountMastodonRoutes(app: Express) {
  app.get("/fromMastodon", async (req, res) => {
    try {
      const { url, services } = parseQuery(req);

      const json = await getStatusAndSourceFromMastodonUrl(url.toString());

      return handleMastodonPost({
        res,
        ...json,
        postToTwitter: services.includes("twitter"),
        postToBluesky: services.includes("bsky") || true,
        postToCohost: services.includes("cohost"),
      });
    } catch (e) {
      console.error(e);

      if (e instanceof MastodonStatusNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(400);
    }
  });
}

async function handleMastodonPost(options: {
  res: Response;
  status: mastodon.v1.Status;
  source: mastodon.v1.StatusSource;
  postToTwitter: boolean;
  postToBluesky: boolean;
  postToCohost: boolean;
}) {
  const { res, status, source, postToTwitter, postToBluesky, postToCohost } =
    options;

  const mediaFiles = await downloadMastodonMedia(status);

  const postingPromises = compact([
    postToCohost &&
      async function () {
        const chost = await postMastodonToCohost(status, source, mediaFiles);
        if (chost) {
          savePost.fromMastodon.toCohost(status.id, chost);
          console.log("Chost!");
        }
      },
    postToBluesky &&
      async function () {
        const blueskyPost = await postMastodonToBluesky(
          status,
          source,
          mediaFiles,
        );
        if (blueskyPost) {
          savePost.fromMastodon.toBluesky(status.id, blueskyPost.uri);
          console.log("Bluesky!");
        }
      },
  ]);

  await Promise.all(postingPromises.map((p) => p()));

  mediaFiles.forEach((file) => {
    fs.unlinkSync(file.filename);
  });

  return res.sendStatus(200);
}
