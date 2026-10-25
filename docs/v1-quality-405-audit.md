# V1 Quality evidence-context 405 audit — 25 October 2026

Live probes reproduced HTTP 405 with no Allow header for GET on both existing item URLs beneath `/api/mobile/quality/revisions/2052ffbd-ccd7-42e7-af5d-7583fe37be08/items/`:

| Server item | Canonical FLI | Client mutation |
| --- | --- | --- |
| `7bed83ee-5d30-4557-9668-6da08e1539dd` | FLI-001 | `revision-item-1792840632745-cs6d97gj` |
| `8b7d06eb-7de8-47bb-a43d-8e7b845bbc38` | FLI-002 | `revision-item-1792905650465-r2pf4h94` |

Both items already exist on the hosted database under the original RECT-01. They are Open. No business rows were changed during this audit. The device SQLite queue was not accessible, so the exact two queue records and whether a separate Pending FLI-003 exists locally cannot be confirmed from these server rows alone.

The sync uploadPhotos function requests GET item evidenceContext before uploading either Before or After. The current local item route exports GET and PATCH; the deployed route rejects GET. PATCH on a sentinel ID reaches the authentication handler rather than method rejection. This is a deployed route-contract mismatch, not justification to replace GET with PATCH for reading metadata. Deploy the current website source to expose its existing GET handler.

## Current local contract

| Path | Exported methods | Sync use |
| --- | --- | --- |
| `/api/mobile/quality/revisions` | POST (shared website handler) | parent create/resolve |
| `/api/mobile/quality/revisions/{revisionId}` | PATCH | parent update |
| `/api/mobile/quality/revisions/{revisionId}/items` | POST | finding create/resolve |
| `/api/mobile/quality/revisions/{revisionId}/items/{itemId}` | GET, PATCH | canonical evidence context; metadata/status update |
| `/api/quality/files/upload` | GET, POST | POST annotated plus original evidence |
| `/api/quality/files/{fileId}/content` | GET | annotated operational preview; explicit original audit variant |
| `/api/quality/files/revisions/{revisionId}/pdf` | GET, POST | POST generation |

Client diagnostics now include operation, method, relative path, parent/item IDs, mutation ID where available, stage, status, Allow, safe error preview and duration. Request headers, auth tokens and image bodies are not logged. Empty 405 errors now identify the method and path. Queue-operation logs associate retries with their client IDs.

Finalise checks durable queue entries, pending workspace findings/updates, missing parent ID, active sync and sync failures before queuing finalisation. It explains `Sync pending changes before finalising.` Existing server dependency validation remains intact.

Raster annotation behaviour is preserved: originalUri is durable; annotatedUri points to a separate pixel-rendered file; local preview and thumbnails prefer annotation; canonical metadata regeneration starts from original; multipart file is annotated with originalFile separate; normal server content/PDF prefer annotated evidence. Regression scripts verified immediate preview, real identifier regeneration, unchanged originals and PDF embedded images. Device visual acceptance and actual live queue recovery still require website deployment followed by Retry on the existing workspace.

Validation: root TypeScript/build passed; mobile TypeScript passed; four changed mobile files passed ESLint; queue-recovery and evidence-raster regression scripts passed; diff whitespace check passed. No migration, native dependency or native rebuild is required. Deploy website first, then mobile OTA/Metro changes. No commit or push performed.
