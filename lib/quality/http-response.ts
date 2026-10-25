export async function qualityJsonResponse<T>(response:Response,service="Quality service"):Promise<T> {
  const type=response.headers.get("content-type") || "";
  const text=await response.text();
  if(!type.includes("application/json")) {
    if(process.env.NODE_ENV!=="production") console.warn(service,{status:response.status,contentType:type,endpoint:response.url.split("?")[0]});
    throw new Error(`${service} returned HTTP ${response.status} instead of JSON.`);
  }
  let payload:T;
  try {payload=JSON.parse(text) as T;}
  catch {throw new Error(`${service} returned invalid JSON (HTTP ${response.status}).`);}
  if(!response.ok) throw new Error((payload && typeof payload==="object" && "error" in payload)?String(payload.error):`${service} failed (HTTP ${response.status}).`);
  return payload;
}
