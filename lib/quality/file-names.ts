export function qualityFilePart(value:unknown) {
  return String(value || "").trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,"-").replace(/\s+/g,"-").replace(/[. ]+$/g,"");
}
export function qualityEvidenceName(project:unknown,tower:unknown,reference:unknown,fli:unknown,phase:string,number:number) {
  return [...[project,tower,reference,fli].map(qualityFilePart).filter(Boolean),`${phase}-${String(number).padStart(2,"0")}`].join("_")+".jpg";
}
export function qualityPdfName(project:unknown,tower:unknown,reference:unknown,revision:number) {
  return [project,tower,reference,`R${String(revision).padStart(2,"0")}`].map(qualityFilePart).filter(Boolean).join("_")+".pdf";
}
