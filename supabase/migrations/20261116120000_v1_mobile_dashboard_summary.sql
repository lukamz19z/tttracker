create or replace function public.mobile_project_dashboard_summary(p_project_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with authz as (
  select exists (
           select 1 from public.project_access pa
           where pa.user_id = p_user_id and pa.project_id = p_project_id
         ) as has_project_access,
         (public.user_has_access(p_user_id, 'mobile.projects') or
          public.user_has_access(p_user_id, 'mobile.tower_progress')) as can_view_snapshot
), metric_access as (
  select public.user_has_access(p_user_id, 'mobile.deliveries') as can_deliveries,
         public.user_has_access(p_user_id, 'mobile.defects') as can_defects,
         public.user_has_access(p_user_id, 'mobile.daily_dockets') as can_dockets
), project_towers as (
  select t.id, greatest(0, least(100, coalesce(t.progress, 0)::numeric)) as base_progress
  from public.towers t
  where t.project_id = p_project_id
), docket_progress as (
  select d.tower_id,
         greatest(0, least(100,
           coalesce(d.assembly_percent, 0) * 0.5 + coalesce(d.erection_percent, 0) * 0.5
         )) as progress
  from public.tower_daily_dockets d
  where d.project_id = p_project_id
    and d.deleted_at is null
), tower_values as (
  select t.id, greatest(t.base_progress, coalesce(max(dp.progress), 0)) as progress
  from project_towers t
  left join docket_progress dp on dp.tower_id = t.id
  group by t.id, t.base_progress
), docket_stats as (
  select max(d.docket_date) as latest_docket_date
  from public.tower_daily_dockets d
  where d.project_id = p_project_id and d.deleted_at is null
), defect_stats as (
  select count(*)::integer as open_defects
  from public.tower_defects d
  where d.project_id = p_project_id
    and lower(trim(coalesce(d.status, ''))) not in ('closed', 'complete', 'completed')
), required_stats as (
  select coalesce(sum(b.qty_required), 0)::numeric as total_required
  from public.tower_required_bundles b
  join project_towers t on t.id = b.tower_id
), delivered_stats as (
  select coalesce(sum(i.qty_delivered), 0)::numeric as total_delivered
  from public.tower_bundle_delivery_items i
  join public.tower_bundle_deliveries d on d.id = i.delivery_id
  join project_towers t on t.id = d.tower_id
), tower_stats as (
  select count(*)::integer as total_towers,
         count(*) filter (where progress >= 100)::integer as completed_towers,
         count(*) filter (where progress > 0 and progress < 100)::integer as towers_in_progress,
         count(*) filter (where progress <= 0)::integer as not_started_towers,
         coalesce(avg(progress), 0)::numeric as overall_progress
  from tower_values
)
select case when authz.has_project_access and authz.can_view_snapshot then jsonb_build_object(
  'totalTowers', ts.total_towers,
  'completedTowers', ts.completed_towers,
  'towersInProgress', ts.towers_in_progress,
  'notStartedTowers', ts.not_started_towers,
  'overallProgress', ts.overall_progress,
  'deliveryProgress', case when ma.can_deliveries and ts.total_towers > 0 and rs.total_required > 0
    then greatest(0, least(100, ds.total_delivered / rs.total_required * 100))
    when ma.can_deliveries and ts.total_towers > 0 then 0
    else null end,
  'openDefects', case when ma.can_defects and ts.total_towers > 0 then fs.open_defects else null end,
  'latestDocketDate', case when ma.can_dockets then to_char(dks.latest_docket_date, 'YYYY-MM-DD') else null end
)
else null end
from tower_stats ts
cross join required_stats rs
cross join delivered_stats ds
cross join defect_stats fs
cross join docket_stats dks
cross join metric_access ma
cross join authz;
$$;

revoke all on function public.mobile_project_dashboard_summary(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mobile_project_dashboard_summary(uuid, uuid) to service_role;

create or replace function public.mobile_approval_counts(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with review_projects as (
  select distinct project_id
  from public.project_docket_approval_users
  where user_id = p_user_id and receives_bc_review = true
), finance_access as (
  select coalesce(bool_or(applies_to in ('all', 'expense_claim') and (can_review_edit or can_approve)), false) as expenses,
         coalesce(bool_or(applies_to in ('all', 'invoice') and (can_review_edit or can_approve)), false) as invoices
  from public.financial_access_rules
  where principal_type = 'user' and user_id = p_user_id and active = true
), counts as (
  select
    (select count(*) from public.tower_daily_dockets d join review_projects p on p.project_id = d.project_id
      where d.approval_status in ('submitted_bc', 'client_changes_requested')) as daily_dockets,
    (select count(*) from public.financial_submissions s
      where s.submission_type = 'expense_claim' and s.status = 'submitted' and f.expenses) as expense_claims,
    (select count(*) from public.financial_submissions s
      where s.submission_type = 'invoice' and s.status = 'submitted' and f.invoices) as invoices
  from finance_access f
)
select jsonb_build_object(
  'dailyDockets', daily_dockets,
  'expenseClaims', expense_claims,
  'invoices', invoices
)
from counts;
$$;

revoke all on function public.mobile_approval_counts(uuid) from public, anon, authenticated;
grant execute on function public.mobile_approval_counts(uuid) to service_role;
