import path from "path";

export function makeMediaFilepath(url: string) {
  return path.resolve("media/", path.basename(url));
}
