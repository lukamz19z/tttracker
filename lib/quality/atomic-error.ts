export function atomicQualityError(error:{code?:string;message:string}) {
  const status=error.code==="P0002"?404:error.code==="42501"?403:["22023","22P02","23514"].includes(error.code || "")?400:["P0001","23505"].includes(error.code || "")?409:503;
  return {status,message:status===503?"Quality service could not complete this operation. Please retry.":error.code==="23505"?"Quality identifiers conflict. The record has not been duplicated.":error.message};
}
