import { jsPDF } from "jspdf";

export type InvoiceAllocationPdfRow = {
  category?: string | null;
  description?: string | null;
  allocation?: string | null;
  amountExGst?: number | null;
  gstAmount?: number | null;
  amountIncGst?: number | null;
};

type Branding = {
  logoDataUrl?: string | null;
  companyName?: string | null;
};

export type ApprovedInvoicePdfData = {
  submissionNumber: string;
  revision: number;
  supplierName: string;
  supplierAbn?: string | null;
  supplierEmail?: string | null;
  supplierContactName?: string | null;
  supplierInvoiceNumber: string;
  invoiceDate?: string | null;
  receivedDate?: string | null;
  dueDate?: string | null;
  paymentTermsDays?: number | null;
  purchaseOrderNumber?: string | null;
  subcontractNumber?: string | null;
  workOrderReference?: string | null;
  description?: string | null;
  notes?: string | null;
  projectLabel?: string | null;
  submittedBy?: string | null;
  submittedAt?: string | null;
  approvedBy: string;
  approvedByEmail?: string | null;
  approvedAt: string;
  subtotalExGst: number;
  gstAmount: number;
  totalAmount: number;
  originalInvoiceNames: string[];
  allocations: InvoiceAllocationPdfRow[];
  branding?: Branding | null;
};

const NAVY:[number,number,number]=[15,23,42];
const SLATE:[number,number,number]=[71,85,105];
const LIGHT:[number,number,number]=[241,245,249];
const LINE:[number,number,number]=[203,213,225];
const GREEN:[number,number,number]=[4,120,87];

function money(value:number){return new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD",minimumFractionDigits:2}).format(value||0);}
function clean(value:unknown){return String(value??"").trim();}
function dateLabel(value?:string|null){if(!value)return"—";const d=/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(`${value}T00:00:00Z`):new Date(value);if(Number.isNaN(d.getTime()))return value;return new Intl.DateTimeFormat("en-AU",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(d);}

export function generateApprovedInvoicePdf(data:ApprovedInvoicePdfData){
  const doc=new jsPDF({unit:"mm",format:"a4",compress:true});
  const W=210,H=297,M=14,CW=W-M*2; let y=16;
  const setText=(c:[number,number,number])=>doc.setTextColor(...c);
  const setFill=(c:[number,number,number])=>doc.setFillColor(...c);
  const setDraw=(c:[number,number,number])=>doc.setDrawColor(...c);
  function next(required=14){if(y+required<=H-18)return;doc.addPage();y=18;doc.setFont("helvetica","bold");doc.setFontSize(9);setText(NAVY);doc.text(data.submissionNumber,M,10);}
  function section(title:string){next(12);y+=2;setFill(LIGHT);doc.roundedRect(M,y,CW,8,1.5,1.5,"F");doc.setFont("helvetica","bold");doc.setFontSize(9);setText(NAVY);doc.text(title.toUpperCase(),M+3,y+5.3);y+=12;}
  function line(label:string,value:string){next(8);doc.setFont("helvetica","normal");doc.setFontSize(8.5);setText(SLATE);doc.text(label,M,y);doc.setFont("helvetica","bold");setText(NAVY);const lines=doc.splitTextToSize(value||"—",CW-48);doc.text(lines,M+48,y);y+=Math.max(6,lines.length*4.4);}

  if(data.branding?.logoDataUrl?.startsWith("data:image/")){try{const f=data.branding.logoDataUrl.startsWith("data:image/jpeg")?"JPEG":"PNG";doc.addImage(data.branding.logoDataUrl,f,M,8,25,14,undefined,"FAST");}catch{}}
  doc.setFont("helvetica","bold");doc.setFontSize(16);setText(NAVY);doc.text("APPROVED SUPPLIER INVOICE",45,14);
  doc.setFontSize(9);setText(SLATE);doc.text(clean(data.branding?.companyName)||"BC Contracting",45,20);
  setText(GREEN);doc.text(`${data.submissionNumber} · R${String(data.revision).padStart(2,"0")}`,45,25);y=34;

  section("Supplier & Invoice");
  line("Supplier",data.supplierName);line("Supplier ABN",clean(data.supplierAbn)||"—");line("Supplier contact",clean(data.supplierContactName)||"—");line("Supplier email",clean(data.supplierEmail)||"—");line("Supplier invoice",data.supplierInvoiceNumber);line("Invoice date",dateLabel(data.invoiceDate));line("Received date",dateLabel(data.receivedDate));line("Due date",dateLabel(data.dueDate));line("Payment terms",data.paymentTermsDays!=null?`${data.paymentTermsDays} days`:"—");
  section("References");
  line("Project",clean(data.projectLabel)||"Company / General");line("Purchase order",clean(data.purchaseOrderNumber)||"—");line("Subcontract",clean(data.subcontractNumber)||"—");line("Work order / ref",clean(data.workOrderReference)||"—");line("Description",clean(data.description)||"—");if(clean(data.notes))line("Notes",clean(data.notes));
  section("Financial Summary");line("Amount ex GST",money(data.subtotalExGst));line("GST",money(data.gstAmount));line("Total incl GST",money(data.totalAmount));
  section("Cost Allocations");
  data.allocations.forEach((a,i)=>{const title=clean(a.description)||`Allocation ${i+1}`;const detail=`${clean(a.category)||"Uncategorised"} · ${clean(a.allocation)||"Company / General"}`;const lines=doc.splitTextToSize(title,104);const rh=Math.max(16,lines.length*4.2+10);next(rh+3);setDraw(LINE);doc.roundedRect(M,y,CW,rh,1.5,1.5,"S");doc.setFont("helvetica","bold");doc.setFontSize(8.5);setText(NAVY);doc.text(lines,M+3,y+5);doc.setFont("helvetica","normal");doc.setFontSize(7.5);setText(SLATE);doc.text(detail,M+3,y+rh-3.5);doc.setFont("helvetica","bold");doc.setFontSize(9);setText(NAVY);doc.text(money(Number(a.amountIncGst??0)),W-M-3,y+5,{align:"right"});y+=rh+3;});
  section("Original Invoice");if(data.originalInvoiceNames.length){for(const name of data.originalInvoiceNames){next(6);doc.setFont("helvetica","normal");doc.setFontSize(8.5);setText(NAVY);doc.text(`• ${name}`,M+2,y);y+=5;}}else{line("Document","No original Invoice metadata available.");}
  section("Approval");line("Status","APPROVED");line("Submitted by",clean(data.submittedBy)||"—");line("Submitted",dateLabel(data.submittedAt));line("Approved by",data.approvedBy);line("Approver email",clean(data.approvedByEmail)||"—");line("Approved",dateLabel(data.approvedAt));

  const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);setDraw(LINE);doc.line(M,282,W-M,282);doc.setFont("helvetica","normal");doc.setFontSize(7);setText(SLATE);doc.text("TTTracker · Controlled Finance record · Uncontrolled when printed",M,287);doc.text(`Page ${p} of ${pages}`,W-M,287,{align:"right"});}
  return new Uint8Array(doc.output("arraybuffer"));
}
