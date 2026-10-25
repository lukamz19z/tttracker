/** Historical evidence/workspace labels are useful; raw database UUIDs are not names. */
export function qualityTowerDisplay(...values:unknown[]) {
  return values.map(value=>typeof value==="string"?value.trim():"").find(value=>value && value!=="Deleted tower" && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) || "Deleted tower";
}
