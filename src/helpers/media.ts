import ffmpeg, { FfprobeData } from "fluent-ffmpeg";
import path from "path";
import util from "node:util";
import fs from "node:fs/promises";

export function makeMediaFilepath(url: string) {
  return path.resolve("media/", path.basename(url));
}

export async function getVideoDimensions(filepath: string) {
  const metadata = await util.promisify(ffmpeg.ffprobe)(filepath);
  const videoMetadata = (metadata as FfprobeData).streams.find(
    (v) => v.codec_type === "video",
  );

  if (!videoMetadata) {
    return undefined;
  }

  return {
    width: videoMetadata.width || videoMetadata.coded_width || 1,
    height: videoMetadata.height || videoMetadata.coded_height || 1,
  };
}

export async function getVideoSize(filepath: string) {
  return (await fs.stat(filepath)).size;
}
