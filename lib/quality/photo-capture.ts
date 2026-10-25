import { captureTimeFromExif } from "./date-time";
/** Read only the timestamp tags from JPEG/PNG TIFF EXIF. No image bytes leave the device. */
export function imageCaptureTime(bytes:Uint8Array,timeZone?:unknown) {
  let start=-1;
  if(bytes[0]===0xff && bytes[1]===0xd8) {
    for(let p=2;p+4<bytes.length;) {
      if(bytes[p]!==0xff) break;
      const marker=bytes[p+1],length=(bytes[p+2]<<8)|bytes[p+3];
      if(marker===0xda || marker===0xd9 || length<2) break;
      if(marker===0xe1 && String.fromCharCode(...bytes.subarray(p+4,p+10))==='Exif\0\0') {start=p+10;break;}
      p+=length+2;
    }
  } else if(bytes[0]===137 && bytes[1]===80) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let p=8;p+12<=bytes.length;) {const length=view.getUint32(p);if(String.fromCharCode(...bytes.subarray(p+4,p+8))==='eXIf'){start=p+8;break;}p+=length+12;}
  }
  if(start<0 || start+8>bytes.length) return null;
  try {
    const view=new DataView(bytes.buffer,bytes.byteOffset+start,bytes.byteLength-start),little=view.getUint16(0)===0x4949;
    if(view.getUint16(2,little)!==42)return null;
    const tags:Record<string,unknown>={},visited=new Set<number>();
    const read=(offset:number)=>{if(visited.has(offset)||visited.size>3)return;visited.add(offset);const count=Math.min(view.getUint16(offset,little),256);
      for(let i=0;i<count;i++){const at=offset+2+i*12,tag=view.getUint16(at,little),type=view.getUint16(at+2,little),length=view.getUint32(at+4,little),value=view.getUint32(at+8,little);
        if(tag===0x8769)read(value);
        const name=({0x9003:'DateTimeOriginal',0x9004:'DateTimeDigitized',0x0132:'DateTime',0x9011:'OffsetTimeOriginal',0x9010:'OffsetTime'} as Record<number,string>)[tag];
        if(name && type===2 && length<128){const pos=length<=4?at+8:value;tags[name]=new TextDecoder().decode(new Uint8Array(view.buffer,view.byteOffset+pos,length)).split('\0')[0].trim();}
      }
    };read(view.getUint32(4,little));return captureTimeFromExif(tags,timeZone);
  } catch {return null;}
}
