"use client";
import {useState} from "react";
import {PeoplePicker} from "@/components/people/people-controls";
import {formatPeopleDate} from "@/lib/people/dates";
import styles from "@/components/people/people.module.css";
type Row={sourceId:string;name:string;date:string;rawHours:number;productionHours:number;payrollHours:number|null;employeeId:string|null;issues:string[]};
export function TimesheetPreflight({organisation,allowed}:{organisation:string;allowed:boolean}){
  const [project,setProject]=useState(""),[page,setPage]=useState(1),[rows,setRows]=useState<Row[]>([]),[total,setTotal]=useState(0),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function load(next=page){setBusy(true);setError("");try{const r=await fetch(`/api/integrations/xero/preflight?organisation=${organisation}&project=${project}&page=${next}`);const value=await r.json();if(!r.ok)throw new Error(value.message);setRows(value.rows);setTotal(value.total);setPage(next);}catch(e){setError(e instanceof Error?e.message:"Unable to load preflight.");}finally{setBusy(false);}}
  if(!allowed)return <p>You do not have timesheet preflight permission.</p>;
  return <div style={{display:"grid",gap:12}}><PeoplePicker organisation={organisation} area="projects" label="Project" selected={project} onChange={id=>{setProject(id);setPage(1);setRows([]);}}/>
    <button className="tt-button-secondary" disabled={!project||busy} onClick={()=>load()}>{busy?"Loading…":"Preview Docket Readiness"}</button>{error&&<p role="alert">{error}</p>}
    <div style={{overflowX:"auto"}}><table className={styles.table}><thead><tr><th>Person</th><th>Date</th><th>Raw MH</th><th>Production MH</th><th>Payroll Hours</th><th>Readiness</th></tr></thead><tbody>{rows.map(row=><tr key={row.sourceId}><td>{row.name}</td><td>{formatPeopleDate(row.date)}</td><td>{row.rawHours}</td><td>{row.productionHours}</td><td>Not classified</td><td>{row.issues.join(" · ")}</td></tr>)}</tbody></table></div>
    {rows.length>0&&<div><button className="tt-button-subtle" disabled={page===1||busy} onClick={()=>load(page-1)}>Previous</button> Docket page {page} <button className="tt-button-subtle" disabled={page*10>=total||busy} onClick={()=>load(page+1)}>Next</button></div>}
  </div>;
}
