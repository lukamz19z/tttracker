export const xeroFeatures={
  employee_mapping:{label:"Employee Mapping",scopes:["payroll.employees.read"],implemented:true},
  project_mapping:{label:"Xero Project Mapping",scopes:["projects.read"],implemented:true},
  payroll_timesheets:{label:"Payroll Timesheet Preflight",scopes:[],implemented:false},
  contacts:{label:"Contacts",scopes:["accounting.contacts.read"],implemented:false},
  commercial:{label:"Commercial / Accounting",scopes:[],implemented:false},
} as const;
export type XeroFeature=keyof typeof xeroFeatures;
export function featureScopes(features:string[]){
  if(features.some(f=>!(f in xeroFeatures)||!xeroFeatures[f as XeroFeature].implemented))throw new Error("INTEGRATION_FEATURE_UNAVAILABLE");
  return [...new Set(["openid","offline_access",...features.flatMap(f=>xeroFeatures[f as XeroFeature].scopes)])];
}
export type TimesheetSource={personId:string;date:string;rawHours:number;payrollHours?:number;timeCategory?:string;approved:boolean;employeeId?:string;earningsId?:string};
export function timesheetPreflight(rows:TimesheetSource[]){
  return rows.map(row=>({personId:row.personId,date:row.date,rawHours:row.rawHours,payrollHours:row.payrollHours??null,employeeId:row.employeeId??null,earningsId:row.earningsId??null,issues:[...(!row.approved?["Source review required"]:[]),...(!row.employeeId?["Employee mapping missing"]:[]),...(!row.timeCategory||!row.earningsId?["Payroll category mapping missing"]:[]),...(row.payrollHours===undefined||!Number.isFinite(row.payrollHours)||row.payrollHours<0?["Payroll hours require explicit classification"]:[])],exportable:false}));
}
