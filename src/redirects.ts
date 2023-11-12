import { compact } from "lodash";
import { request } from "undici";

async function findRedirectedUrl(
  url: string,
): Promise<[string, string] | undefined> {
  const res = await request(url, { method: "HEAD" });
  return res.headers["location"]
    ? [url, String(res.headers["location"])]
    : undefined;
}

export async function expandUrlsInTweetText(
  tweetText: string,
): Promise<string> {
  const matches = Array.from(
    tweetText.matchAll(/https:\/\/t.co\/[a-z0-9]{6,10}/gi),
  ).map((i) => i[0]);

  let newText = tweetText;
  const results = await Promise.all(
    matches.map((url) => findRedirectedUrl(url)),
  );

  compact(results).forEach((result) => {
    newText = newText.replace(result[0], result[1]);
  });

  compact(results).filter((r) => {
    if (r[1].includes("/photo/1")) {
      newText = newText.replaceAll(r[1], "").trim();
    }
  });
  return newText;
}
