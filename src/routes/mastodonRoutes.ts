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
        postToCohost: services.includes("cohost") || true,
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

  if (postToCohost) {
    try {
      const chost = await postMastodonToCohost(status, source, mediaFiles);
      if (chost) {
        savePost.fromMastodon.toCohost(status.id, chost);
        console.log("Chost!");
      }
    } catch (e) {
      console.error(e);
    }
  }

  return res.sendStatus(200);
}
