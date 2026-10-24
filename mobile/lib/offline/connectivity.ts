// Synchronous transport guard controlled and hydrated by SyncContext.
let forced = false;
export const manuallyOffline = () => forced;
export function setManualOffline(value: boolean) { forced = value; }
