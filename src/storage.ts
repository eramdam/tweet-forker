import fs from "fs";
let cache = new Map<string, string>();

export function saveStatus(twitterId: string, mastodonId: string) {
  cache.set(twitterId, mastodonId);
}

export function findStatus(twitterId: string) {
  return cache.get(twitterId);
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
