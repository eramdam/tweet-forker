import fs from "fs";
let cache = new Map<string, string>();

export enum Services {
  Mastodon = "mastodon",
  Bluesky = "bsky",
  Cohost = "cohost",
}

export function saveStatus(
  twitterId: string,
  foreignId: string,
  service: Services,
) {
  cache.set(`${twitterId}-${service}`, foreignId);
}

export function findTootFromTweetId(twitterId: string) {
  return cache.get(`${twitterId}-${Services.Mastodon}`);
}
export function findSkeetFromTweetId(twitterId: string) {
  return cache.get(`${twitterId}-${Services.Bluesky}`);
}
export function findChostFromTweetId(twitterId: string) {
  return cache.get(`${twitterId}-${Services.Cohost}`);
}

export function restoreFromDisk() {
  try {
    const raw = fs.readFileSync("./cache.json", { encoding: "utf-8" });
    cache = new Map<string, string>(JSON.parse(raw));
  } catch (e) {
    //
  }
}

export function writeToDisk() {
  console.log("writeToDisk", cache.size);
  fs.writeFileSync("./cache.json", JSON.stringify([...cache]));
}
