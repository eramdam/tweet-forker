import fs from "fs";
let cache = new Map<string, string>();

export enum Services {
  Twitter = "twitter",
  Mastodon = "mastodon",
  Bluesky = "bsky",
  Cohost = "cohost",
}

function savePostBase(
  source: Services,
  id: string,
  foreignId: string,
  foreignService: Omit<Services, typeof source>,
) {
  cache.set(`${source}-${id}-${foreignService}`, foreignId);
  console.log(`${source}-${id}-${foreignService}`, foreignId);
}

export const savePost = {
  fromTwitter: {
    toCohost: (id: string, foreignId: string) => {
      savePostBase(Services.Twitter, id, foreignId, Services.Cohost);
    },
    toBluesky: (id: string, foreignId: string) => {
      savePostBase(Services.Twitter, id, foreignId, Services.Bluesky);
    },
    toMastodon: (id: string, foreignId: string) => {
      savePostBase(Services.Twitter, id, foreignId, Services.Mastodon);
    },
  },
  fromMastodon: {
    toCohost: (id: string, foreignId: string) => {
      savePostBase(Services.Mastodon, id, foreignId, Services.Cohost);
    },
    toBluesky: (id: string, foreignId: string) => {
      savePostBase(Services.Mastodon, id, foreignId, Services.Bluesky);
    },
    toTwitter: (id: string, foreignId: string) => {
      savePostBase(Services.Mastodon, id, foreignId, Services.Twitter);
    },
  },
};

function findPostFromSource(
  source: Services,
  sourceId: string,
  foreignService: Omit<Services, typeof source>,
) {
  return cache.get(`${Services.Mastodon}-${sourceId}-${foreignService}`);
}

export const findPost = {
  fromTwitter: {
    toCohost: (id: string) => {
      return findPostFromSource(Services.Twitter, id, Services.Cohost);
    },
    toBluesky: (id: string) => {
      return findPostFromSource(Services.Twitter, id, Services.Bluesky);
    },
    toMastodon: (id: string) => {
      return findPostFromSource(Services.Twitter, id, Services.Mastodon);
    },
  },
  fromMastodon: {
    toCohost: (id: string) => {
      return findPostFromSource(Services.Mastodon, id, Services.Cohost);
    },
    toBluesky: (id: string) => {
      return findPostFromSource(Services.Mastodon, id, Services.Bluesky);
    },
    toTwitter: (id: string) => {
      return findPostFromSource(Services.Mastodon, id, Services.Twitter);
    },
  },
};

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
