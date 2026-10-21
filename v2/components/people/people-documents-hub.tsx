"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, FileText, FolderTree, GraduationCap, Share2 } from "lucide-react";
import { responseData } from "./people-controls";
import { tokenLabel } from "@/components/integrations/document-template-builder";
import styles from "./people.module.css";

type Rule = { id: string; context: string; name: string; location_id?: string; folder_template: string; filename_template: string; child_folders: string[]; is_active: boolean };
type Location = { id: string; site_id: string; name: string; is_active: boolean };
type Data = { configured: boolean; connection?: { status?: string; microsoft_tenant_verified_at?: string } | null; sites: Array<{ id: string; is_active: boolean; verified_at?: string; permission_status: string }>; locations: Location[]; rules: Rule[] };
type State = { data: Data | null; unavailable: boolean };

export function PeopleDocumentsHub({ organisation, permissions }: { organisation: string; permissions: Record<string, boolean> }) {
  const [state, setState] = useState<State>({ data: null, unavailable: false });
  const canViewStorage = permissions["integrations.sharepoint.view"] === true || permissions["integrations.sharepoint.manage"] === true;
  const canManageStorage = permissions["integrations.sharepoint.manage"] === true;
  const canManagePeople = permissions["people.configure"] === true;
  const canManageTraining = permissions["training.configure"] === true;
  const query = `organisation=${encodeURIComponent(organisation)}`;
  const peopleSetup = `/workspace/settings/integrations/sharepoint?${query}&context=people`;
  const onboardingSetup = `/workspace/settings/integrations/sharepoint?${query}&context=onboarding`;

  useEffect(() => {
    if (!canViewStorage) return;
    let active = true;
    fetch(`/api/integrations/sharepoint/workspace?${query}`, { cache: "no-store" })
      .then(responseData)
      .then((data) => { if (active) setState({ data: data as Data, unavailable: false }); })
      .catch(() => { if (active) setState({ data: null, unavailable: true }); });
    return () => { active = false; };
  }, [canViewStorage, query]);

  const ruleFor = (context: string) => state.data?.rules.find((rule) => rule.context === context && rule.is_active);
  const ruleStatus = (rule: Rule | undefined, field: "folder_template" | "filename_template") => {
    if (!canViewStorage || state.unavailable) return { label: "Status unavailable", detail: "Storage status could not be loaded." };
    if (!rule) return { label: "Not Configured", detail: "No active document setup is configured." };
    return rule[field]?.trim()
      ? { label: "Configured", detail: "An active naming rule is configured." }
      : { label: "Needs Attention", detail: `No ${field === "folder_template" ? "folder structure" : "file naming rule"} is configured.` };
  };
  const peopleRule = ruleFor("people");
  const photoRule = ruleFor("profile_photos");
  const trainingRule = ruleFor("training");
  const onboardingRule = ruleFor("onboarding");
  const folderPattern = peopleRule ? [peopleRule.folder_template, ...(peopleRule.child_folders ?? [])].filter(Boolean).map((part) => part.replace(/\{([^{}]+)\}/g, (_match, token: string) => tokenLabel(token))).join("  /  ") : "No People folder pattern configured.";
  const peopleFilePattern = peopleRule?.filename_template?.replace(/\{([^{}]+)\}/g, (_match, token: string) => tokenLabel(token));
  const activeVerifiedSites = state.data?.sites.filter((site) => site.is_active && site.verified_at && site.permission_status === "verified") ?? [];
  const activeLocations = state.data?.locations.filter((location) => location.is_active && activeVerifiedSites.some((site) => site.id === location.site_id)) ?? [];
  const storageStatus = !canViewStorage ? "Access Required" : state.unavailable ? "Status unavailable" : !state.data?.configured ? "Not Configured" : state.data.connection?.status !== "connected" || !state.data.connection?.microsoft_tenant_verified_at || activeLocations.length === 0 ? "Needs Attention" : "Connected";
  const storageDetail = !canViewStorage ? "SharePoint access is managed by an integration administrator." : state.unavailable ? "SharePoint status could not be loaded. Other People settings remain available." : storageStatus === "Connected" ? "SharePoint is connected for configured People document destinations." : storageStatus === "Needs Attention" ? "The connection or site authorisation needs attention." : "Connect SharePoint and configure a document destination to store People files.";

  return <section className={styles.peopleDocumentsHub}>
    <header><h2>People Documents</h2><p>Manage how workforce and onboarding documents are named, organised and stored.</p></header>
    {state.unavailable && <p className={styles.peopleDocumentsWarning} role="status">SharePoint status could not be loaded. Naming and template links are still available.</p>}
    <div className={styles.peopleDocumentRows}>
      {(canManagePeople || canViewStorage) && <DocumentRow icon={<FileText size={17} aria-hidden />} title="Profile Photos" description="Person headshots and ID photos ? SharePoint" status={!canViewStorage || state.unavailable ? "Status unavailable" : photoRule?.location_id && photoRule.filename_template ? "Configured" : "Needs Setup"} detail={photoRule ? `Destination: ${state.data?.locations.find(l=>l.id===photoRule.location_id)?.name??"Needs Setup"} ? Naming: ${photoRule.filename_template.replace(/\{([^{}]+)\}/g,(_match,token:string)=>tokenLabel(token))}` : "Choose a People document destination, folder structure and filename rule."} action={canManageStorage ? {label:"Configure",href:`/workspace/settings/integrations/sharepoint?${query}&context=profile_photos`} : undefined} />}

      {(canManagePeople || canManageStorage) && <DocumentRow icon={<FolderTree size={17} aria-hidden />} title="People Folder Structure" description="Employee and Person folders" status={ruleStatus(peopleRule, "folder_template").label} detail={peopleRule ? folderPattern : ruleStatus(peopleRule, "folder_template").detail} action={canManageStorage ? { label: "Manage Folder Structure", href: peopleSetup } : undefined} />}
      {(canManagePeople || canManageStorage) && <DocumentRow icon={<FileText size={17} aria-hidden />} title="General People Documents" description="Employment and workforce document naming" status={ruleStatus(peopleRule, "filename_template").label} detail={peopleFilePattern ? `Current pattern: ${peopleFilePattern}` : ruleStatus(peopleRule, "filename_template").detail} action={canManageStorage ? { label: "Configure Naming", href: peopleSetup } : undefined} />}
      {(canManageTraining || canViewStorage) && <DocumentRow icon={<GraduationCap size={17} aria-hidden />} title="Training Documents" description="Training evidence names, Category and Training Type overrides" status={ruleStatus(trainingRule, "filename_template").label} detail={trainingRule?.filename_template ? "Naming stays in the canonical Training Configuration." : ruleStatus(trainingRule, "filename_template").detail} action={canManageTraining ? { label: "Manage Training File Naming", href: `/workspace/people/training/configuration?${query}&section=file_naming` } : undefined} />}
      {(canManagePeople || canManageStorage) && <DocumentRow icon={<ClipboardCheck size={17} aria-hidden />} title="Onboarding Documents" description="Onboarding uploads and generated document rules" status={ruleStatus(onboardingRule, "filename_template").label} detail={onboardingRule?.filename_template ? "Onboarding document rules are configured." : ruleStatus(onboardingRule, "filename_template").detail} actions={[
        ...(canManagePeople ? [{ label: "Manage Onboarding Templates", href: `/workspace/settings/people/onboarding/templates?${query}` }] : []),
        ...(canManageStorage ? [{ label: "Configure Document Rules", href: onboardingSetup }] : []),
      ]} />}
      {(canViewStorage || canManageStorage) && <DocumentRow icon={<Share2 size={17} aria-hidden />} title="SharePoint Storage" description="Sites, libraries and document destinations" status={storageStatus} detail={storageDetail} action={canManageStorage ? { label: "Manage SharePoint Storage", href: `/workspace/settings/integrations/sharepoint?${query}&context=people` } : undefined} />}
    </div>
  </section>;
}

function DocumentRow({ icon, title, description, status, detail, action, actions }: { icon: React.ReactNode; title: string; description: string; status: string; detail: string; action?: { label: string; href: string }; actions?: Array<{ label: string; href: string }> }) {
  const links = [...(action ? [action] : []), ...(actions ?? [])];
  return <article className={styles.peopleDocumentRow}>
    <span className={styles.peopleDocumentIcon}>{icon}</span>
    <div className={styles.peopleDocumentCopy}><div className={styles.peopleDocumentTitle}><h3>{title}</h3><span data-status={status.toLowerCase().replaceAll(" ", "-")}>{status}</span></div><p>{description}</p><small>{detail}</small></div>
    <div className={styles.peopleDocumentActions}>{links.length ? links.map(link => <Link key={link.href} className="tt-button-secondary" href={link.href}>{link.label}</Link>) : <span className={styles.peopleDocumentViewOnly}>Configuration access required</span>}</div>
  </article>;
}
