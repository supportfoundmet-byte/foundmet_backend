import ImageKit from "@imagekit/nodejs";
import { logWarn } from "./logger.js";

let client = null;

function getClient() {
  if (client) return client;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) return null;
  client = new ImageKit({ privateKey });
  return client;
}

async function uploadFile(buffer) {
  const imagekit = getClient();
  if (!imagekit) {
    logWarn("imagekit_unconfigured");
    return null;
  }
  return imagekit.files.upload({
    file: buffer.toString("base64"),
    fileName: `foundmet-${Date.now()}.png`,
    folder: "foundmet",
  });
}

export default uploadFile;
