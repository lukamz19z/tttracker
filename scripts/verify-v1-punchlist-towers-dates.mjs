import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import * as XLSX from "xlsx";
const loaded={exports:{}};
new Function("module","exports",ts.transpileModule(fs.readFileSync("lib/quality/punchlist-import-values.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(loaded,loaded.exports);
const {towerKey,resolveProjectTower,sourceDateToDb,sourceDateDisplay,excelCalendarDate}=loaded.exports;
const current=[{id:"p1-92",name:"T92"},{id:"p1-93",name:"Tower 93"}];
const other={id:"p2-92",name:"Tower 92"};
for(const value of ["92","092","T92","T-92","T 92","Tower 92","Tower-92"]){assert.equal(towerKey(value),"92");assert.equal(resolveProjectTower(value,current).tower.id,"p1-92");assert.equal(resolveProjectTower(value,current,[other].find(t=>t.id===value)?.id).state,"matched");}
assert.equal(resolveProjectTower("92",[...current,other]).state,"ambiguous");
assert.equal(resolveProjectTower("unmapped",current).state,"not found");
assert.equal(resolveProjectTower("unmapped",current,"p1-92").tower.id,"p1-92");
assert.equal(resolveProjectTower("unmapped",current,"p2-92").state,"invalid selection");
for(const [human,db] of [["30/10/2026","2026-10-30"],["01/01/2027","2027-01-01"],["04/05/2026","2026-05-04"]]){assert.equal(sourceDateToDb(human),db);assert.equal(sourceDateDisplay(db),human);assert.equal(sourceDateToDb(db),null);assert.equal(sourceDateToDb(db,true),db);}
assert.equal(sourceDateToDb(""),"");assert.equal(sourceDateToDb("31/02/2026"),null);assert.equal(sourceDateToDb("05/04/2026"),"2026-04-05");
const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([["Source Date"],[new Date(2026,9,30)]]),"Punchlist");
const copy=XLSX.read(XLSX.write(book,{bookType:"xlsx",type:"array"}),{type:"array",cellDates:false});
const cell=copy.Sheets.Punchlist.A2;assert.equal(cell.t,"n");
assert.equal(excelCalendarDate(cell.v),"30/10/2026");assert.equal(sourceDateToDb(excelCalendarDate(cell.v)),"2026-10-30");
assert.equal(excelCalendarDate(0,true),"01/01/1904");
console.log("PASS current-project tower equivalents, genuine in-project ambiguity, manual reconciliation and rejected cross-project override; DD/MM/YYYY parsing/display, blank date, native XLSX date and calendar-day preservation.");

