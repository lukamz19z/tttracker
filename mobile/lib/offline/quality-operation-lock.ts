// Serialise server-affecting Quality sync and whole-RECT deletion in this process.
// Durable deletion markers handle restarts and stale queue snapshots.
let tail:Promise<unknown>=Promise.resolve();
export function withQualityOperation<T>(operation:()=>Promise<T>):Promise<T> {
  const task=tail.catch(()=>undefined).then(operation);
  tail=task;
  return task;
}
