export function findingReadiness(item:{status:string;rectification_comment?:string|null;issue_type_id?:string|null;other_issue_text?:string|null},before:number,after:number) {
  const photosComplete=before>0 && after>0;
  const ready=photosComplete && Boolean(item.issue_type_id || item.other_issue_text?.trim());
  return {photosComplete,ready,workflow:["Rectified","Verified"].includes(item.status)?item.status:ready?"Ready to Rectify":item.status};
}
