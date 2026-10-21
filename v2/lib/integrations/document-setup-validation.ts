import { contextTokens,renderPath,type DocumentContext } from "./resolver";
// Configuration validation uses example values, never Microsoft or record data.
export function documentTemplateError(context:DocumentContext,folder:string,filename:string) {
  if(!contextTokens[context])return "Choose a document type.";
  if(!folder.trim()&&context!=="general")return "Add a folder structure before saving.";
  for(const [index,level] of folder.split("/").entries()) {
    if(!folder&&context==="general")break;
    if(!level.trim())return `Folder Level ${index+1} is empty.`;
    const tokens=[...level.matchAll(/\{([^{}]+)\}/g)];
    if(/[{}]/.test(level.replace(/\{[^{}]+\}/g,"")))return `Folder Level ${index+1} contains a malformed field.`;
    try {renderPath(level,context,Object.fromEntries(tokens.map(t=>[t[1],"Example"])));}
    catch {return `Folder Level ${index+1} contains an unsupported field or invalid text.`;}
  }
  if(!filename.trim())return "Enter a filename template. A suggested template is provided when creating setup.";
  if(/[{}]/.test(filename.replace(/\{[^{}]+\}/g,"")))return "The filename contains a malformed field.";
  try {renderPath(filename,context,Object.fromEntries([...filename.matchAll(/\{([^{}]+)\}/g)].map(t=>[t[1],"Example"])),true);}
  catch {return "The filename contains an unsupported field or invalid text.";}
  return null;
}
