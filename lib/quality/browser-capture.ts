import { imageCaptureTime } from "./photo-capture";
import { projectLocalCaptureTime, qualityTimeZone } from "./date-time";
const known=new WeakMap<File,string>();
export async function browserPhotoCaptureTime(file:File,timeZone?:unknown) {
  const saved=known.get(file);if(saved)return saved;
  const zone=qualityTimeZone(timeZone);
  let captured=imageCaptureTime(new Uint8Array(await file.arrayBuffer()),zone);
  if(!captured) {
    const answer=window.prompt(`Capture date/time for ${file.name} (${zone}). The photo has no readable capture metadata. Enter YYYY-MM-DD HH:mm; upload time will not be used.`);
    captured=answer?projectLocalCaptureTime(answer,zone):null;
  }
  if(!captured)throw new Error("Enter the photo's actual capture date/time before uploading evidence.");
  known.set(file,captured);return captured;
}
