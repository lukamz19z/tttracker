import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notifyFinanceReviewers } from "@/lib/finance/workflow-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function env(name:string){const v=process.env[name]?.trim();if(!v)throw new Error(`Missing environment variable: ${name}`);return v;}
function serviceClient(){return createClient(env("NEXT_PUBLIC_SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});}
function clean(v:unknown){return String(v??"").trim();}
function money(v:unknown){return new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(v??0)||0);}
function esc(v:unknown){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
async function requireUser(request:Request){const auth=request.headers.get("authorization")??"";const token=auth.startsWith("Bearer ")?auth.slice(7).trim():"";if(!token)throw new Error("UNAUTHENTICATED");const service=serviceClient();const {data:{user},error}=await service.auth.getUser(token);if(error||!user)throw new Error("UNAUTHENTICATED");return{service,user};}

export async function POST(request:Request){
 try{
  const {service,user}=await requireUser(request);
  const body=await request.json() as {submissionId?:string};
  const submissionId=clean(body.submissionId);
  if(!submissionId)return NextResponse.json({error:"Expense Claim ID is required."},{status:400});

  const {data:claim,error:claimError}=await service.from("financial_submissions").select("id,submission_number,submission_type,status,revision,submitted_for_employee_id,created_by,submitted_by,project_id,description,total_amount").eq("id",submissionId).single();
  if(claimError||!claim)return NextResponse.json({error:"Expense Claim not found."},{status:404});
  if(claim.submission_type!=="expense_claim")return NextResponse.json({error:"This submission is not an Expense Claim."},{status:400});
  if(!["draft","changes_required"].includes(claim.status))return NextResponse.json({error:claim.status==="submitted"?"This Expense Claim is already awaiting approval.":"This Expense Claim cannot be submitted from its current status."},{status:409});

  const {data:employee}=claim.submitted_for_employee_id?await service.from("employees").select("id,user_id").eq("id",claim.submitted_for_employee_id).maybeSingle():{data:null};
  const owns=claim.created_by===user.id||claim.submitted_by===user.id||employee?.user_id===user.id;
  if(!owns){
    const {data:rule,error}=await service.from("financial_access_rules").select("id").eq("active",true).eq("principal_type","user").eq("user_id",user.id).or("applies_to.eq.all,applies_to.eq.expense_claim").or("can_review_edit.eq.true,can_approve.eq.true").limit(1).maybeSingle();
    if(error)throw new Error(error.message);
    if(!rule)return NextResponse.json({error:"You do not have access to submit this Expense Claim."},{status:403});
  }

  const {data:items,error:itemsError}=await service.from("financial_submission_items").select("id,category_id,expense_date,description,amount_inc_gst,sort_order").eq("submission_id",claim.id).order("sort_order");
  if(itemsError)throw new Error(itemsError.message);
  if(!items?.length)return NextResponse.json({error:"Add at least one expense item."},{status:400});
  if(items.some(i=>!i.expense_date||!clean(i.description)||Number(i.amount_inc_gst??0)<=0))return NextResponse.json({error:"Complete the date, description and amount for every expense item."},{status:400});

  const {data:receipts,error:receiptError}=await service.from("financial_attachments").select("item_id").eq("submission_id",claim.id).eq("attachment_type","receipt");
  if(receiptError)throw new Error(receiptError.message);
  const receiptIds=new Set((receipts??[]).map(r=>clean(r.item_id)));
  if(items.some(i=>!receiptIds.has(clean(i.id))))return NextResponse.json({error:"Upload a receipt for every expense item before submitting for approval."},{status:400});

  const {data:reviewerRows,error:reviewerError}=await service.from("financial_access_rules").select("user_id").eq("active",true).eq("principal_type","user").not("user_id","is",null).or("applies_to.eq.all,applies_to.eq.expense_claim").or("can_review_edit.eq.true,can_approve.eq.true");
  if(reviewerError)throw new Error(reviewerError.message);
  const reviewerIds=new Set((reviewerRows??[]).map(r=>clean(r.user_id)).filter(Boolean));
  if(!reviewerIds.size)return NextResponse.json({error:"No Expense Claim reviewers are configured in Finance Settings."},{status:400});

  const oldRevision=Math.max(0,Number(claim.revision??0)||0);
  const revision=claim.status==="changes_required"?oldRevision+1:Math.max(oldRevision,1);
  const now=new Date().toISOString();
  const {data:updated,error:updateError}=await service.from("financial_submissions").update({status:"submitted",submitted_by:user.id,submitted_at:now,revision,changes_required_reason:null,changes_requested_at:null}).eq("id",claim.id).in("status",["draft","changes_required"]).select("id,total_amount").maybeSingle();
  if(updateError)throw new Error(updateError.message);
  if(!updated)return NextResponse.json({error:"The claim changed before submission. Refresh and try again."},{status:409});

  const {error:approvalError}=await service.from("financial_approvals").insert({submission_id:claim.id,revision,status:"pending",created_at:now});
  if(approvalError)throw new Error(approvalError.message);
  const {error:eventError}=await service.from("financial_submission_events").insert({submission_id:claim.id,revision,event_type:claim.status==="changes_required"?"resubmitted":"submitted",performed_by:user.id,comments:null,metadata:{source:"finance_workflow",previous_status:claim.status,channel:"web_or_mobile"}});
  if(eventError)throw new Error(eventError.message);

  const {data:project}=claim.project_id?await service.from("projects").select("name,project_number").eq("id",claim.project_id).maybeSingle():{data:null};
  const notification=await notifyFinanceReviewers({service,submissionType:"expense_claim",submissionId:claim.id,submissionNumber:claim.submission_number,projectId:claim.project_id??null,title:`Expense Claim ${claim.submission_number}`,message:`${money(updated.total_amount)} is waiting for review.`,emailHeading:"Expense Claim approval required",emailBodyHtml:`<p>An Expense Claim has been submitted and is ready for review.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;border-collapse:collapse;"><tr><td style="padding:8px 0;color:#64748b;width:150px;">Claim</td><td style="padding:8px 0;font-weight:600;">${esc(claim.submission_number)}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Project</td><td style="padding:8px 0;font-weight:600;">${esc(project?.name||project?.project_number||"Company / General")}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Description</td><td style="padding:8px 0;font-weight:600;">${esc(claim.description||"Expense Claim")}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Amount</td><td style="padding:8px 0;font-weight:600;">${esc(money(updated.total_amount))}</td></tr><tr><td style="padding:8px 0;color:#64748b;">Revision</td><td style="padding:8px 0;font-weight:600;">R${String(revision).padStart(2,"0")}</td></tr></table>`});

  return NextResponse.json({success:true,status:"submitted",revision,reviewers:notification.reviewers,channels:notification.channels,warning:notification.warning});
 }catch(error){const message=error instanceof Error?error.message:"The Expense Claim could not be submitted.";if(message==="UNAUTHENTICATED")return NextResponse.json({error:"You must be signed in."},{status:401});console.error("EXPENSE CLAIM SUBMIT ERROR:",error);return NextResponse.json({error:message},{status:500});}
}
