import { type Express, type Response } from "express";
import { parseQuery } from "./routeHelpers";
import {
  getStatusAndSourceFromMastodonUrl,
  MastodonStatusNotFoundError,
} from "../helpers/mastodon";
import { mastodon } from "masto";

export function mountMastodonRoutes(app: Express) {
  app.get("/fromMastodon", async (req, res) => {
    try {
      const { url, services } = parseQuery(req);

      const json = await getStatusAndSourceFromMastodonUrl(url.toString());
      console.log(json);

      return handleMastodonPost({
        res,
        ...json,
        postToTwitter: services.includes("twitter"),
        postToBluesky: services.includes("bsky"),
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
}) {}
