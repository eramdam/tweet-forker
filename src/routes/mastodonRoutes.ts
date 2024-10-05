import { type Express, type Response } from "express";
import { compact } from "lodash";
import { mastodon } from "masto";
import fs from "node:fs";
import { postMastodonToBluesky } from "../helpers/bsky";
import {
  downloadMastodonMedia,
  getStatusAndSourceFromMastodonUrl,
  MastodonStatusNotFoundError,
} from "../helpers/mastodon";
import { postMastodonToTwitter } from "../helpers/twitter";
import { savePost } from "../storage";
import { parseQuery } from "./routeHelpers";

export function mountMastodonRoutes(app: Express) {
  app.get("/fromMastodon", async (req, res) => {
    try {
      const { url, services } = parseQuery(req);

      const json = await getStatusAndSourceFromMastodonUrl(url.toString());

      return handleMastodonPost({
        res,
        ...json,
        postToTwitter: services.includes("twitter"),
        postToBluesky: services.includes("bsky"),
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
}) {
  const { res, status, source, postToTwitter, postToBluesky } = options;

  try {
    const mediaFiles = await downloadMastodonMedia(status);

    const postingPromises = compact([
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
      postToTwitter &&
        async function () {
          const twitterPost = await postMastodonToTwitter(
            status,
            source,
            mediaFiles,
          );

          if (twitterPost) {
            savePost.fromMastodon.toTwitter(status.id, twitterPost.data.id);
            console.log("Twitter!");
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
