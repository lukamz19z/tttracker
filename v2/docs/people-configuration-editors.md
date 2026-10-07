# People configuration editors

This pass changes presentation and client-side editor behaviour only. Existing canonical configuration, RPC authorization, tenant boundaries, review semantics and Confidential collection gate remain authoritative. No migration is required.

## Shared editing pattern

`ConfigurationSurface` uses a native modal dialog in a document-body portal. The browser provides background inertness and keyboard focus containment. Closing restores focus, Escape/outside clicks/Cancel all use the same dirty-change guard, and an in-flight save cannot be dismissed. Portal isolation and stopped submit propagation keep nested Option creation from submitting the parent Training Type. Header/content/footer have independent layout; only content scrolls.

Presets: 460px centred small modal, 560px medium right drawer, 680px large right drawer. Mobile drawers occupy the viewport. Categories, Options and source Review Rules use small modals. Training Types, Document Rules and onboarding fields use medium drawers. Template editing uses a large drawer. There are no Back links inside these surfaces.

## Training

Basic / Category / Validity / Evidence / Review / File Rules use compact scrolling tabs. Expiry and evidence begin with Yes/No questions and hide inapplicable controls. Automatic validity requires a period; manual expiry and the existing three evidence formats remain canonical. Options are scoped to the selected category and saved with the type; an empty category can create its first Option in a nested small modal. Review explanations distinguish required review, no review and trusted confirmation without role-name checks.

File Rules previews configured central Document Rules. This is explicitly a preview, not a per-type rule assignment: the existing resolver selects rules by document category, training category and employment type. Access to this configuration remains capability-controlled. The redundant register-level Options editor was removed.

## Document Structure

Details / Applies To / Storage / Folder / Filename follow the document-routing decisions. Scope selectors expose All and Root explicitly while persisting existing empty-scope semantics. Document category uses known rule categories and a Define category choice; no separate catalogue was invented. SharePoint remains Not connected, its library input is hidden, and integration navigation is available. Rules can be designed without claiming they can sync.

Folder and filename templates are one-line inputs. Insert token groups supported tokens and inserts at the selection/cursor. Unsupported tokens/paths receive inline validation. Preview uses synthetic names and identifiers; display dates are DD/MM/YYYY and filename dates use the configured filesystem-safe format. Folder previews show the rule's relative folder template; the canonical resolver remains responsible for resolving complete parent chains and document revisions on upload.

## Onboarding

Field edits are local until Save Field. Cancel discards the field draft without changing the template. Advanced mapping and conditions are secondary. Controlled field types enforce classification minima, Private domains remain constrained, and Confidential fields display the existing collection-unavailable message. Save Field updates the template draft; Save Draft persists it and closes/refetches the register. Publishing remains blocked for Confidential fields.

## Verification and limitations

Component tests exercise presets, native-dialog opening/focus return, dirty guards, conditional controls, explicit All/Root semantics, token insertion, inline validation, nested-submit isolation, save/close/refetch, review defaults, synthetic previews and the Confidential gate. Existing database security/workflow regressions are also run.

The in-app browser connection failed with a tooling configuration error, so screenshot-based visual QA was not completed. Desktop/mobile sizing and interactions have component/CSS coverage but still require live visual confirmation. No AWS/KMS infrastructure, SharePoint connectivity, Xero sync, schema or server permission changes are part of this pass. No real confidential values were entered.

## Files changed in this pass

- `v2/components/people/configuration-surface.tsx`
- `v2/components/people/token-input.tsx`
- `v2/components/people/training-editor-content.tsx`
- `v2/components/people/people-controls.tsx`
- `v2/components/people/people-client.tsx`
- `v2/components/people/people-operations.tsx`
- `v2/components/people/training-catalogue.tsx`
- `v2/components/people/onboarding-admin.tsx`
- `v2/components/people/people.module.css`
- `supabase/verification/people_configuration_editors.test.mjs`
- `supabase/verification/people_ui.test.mjs`
- `v2/docs/people-configuration-editors.md`

Existing unrelated working-tree changes were preserved. V1, Materials, integrations, auth/security implementation, server APIs and migrations were not edited by this pass.
