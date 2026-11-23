# Team 7028 project dashboards

A project management workspace for FRC Team 7028. Manufacturing is implemented; Prototyping, Design, Assembly, and Programming show Under construction. The dashboard selector stays in the top-left header, including Shop mode. The Netlify host installs the dependencies listed in package.json.

## Run locally

Use Node.js 24 or newer (the local server uses `node:sqlite`):

```sh
node scripts/build-worker.mjs
node scripts/serve.mjs
```

Open http://127.0.0.1:7028. The local server creates an ignored `outputs/dev-workspace.sqlite` database and supplies a local development admin account. Production identity still comes from Sites. Validate with `node --test` and `npm run check`. Rebuild the Worker after changes to server code; browser assets are served directly during local development.

## Manufacturing workspace

The first navigation control selects the project; every project has a name and year. Admins can choose **New Project** at the bottom of the selector. Legacy projects without a year receive the current year and can be edited in Admin.

- **Parts:** sortable columns for part name/number, subsystem, stage, material, color, student, and due date. Admins add parts from the search toolbar and assign students from the roster.
- **Production:** project-wide Parts Made progress, compact Not Started / Cutting / Finishing / Done / Blocked cards, subsystem filtering, and a four-stage board. Summary denominators always use the whole project, even when the board is filtered.
- **COTS:** vendor cards open order lists (or prepare WCP carts). The card count is the total required quantity for the vendor; its bar measures quantity already covered by stock or orders. The table shows Required, In House (available stock plus received purchases), Ordered, Status, and Expected. Order and Receive actions retain cumulative purchasing history.
- **Admin:** student roster and account linking, project names/years, BOM destination, Onshape import, CSV export, backup/restore, and activity/recovery. Former More-menu actions live here. Choose Parts or COTS before exporting CSV.
- **Todo:** visible to non-admins in place of Admin, showing unfinished assignments across all projects. Admins link a student's exact sign-in email in the roster. Names alone never identify the signed-in account. Existing unlinked students keep their assignments and appear in Todo once linked.

The logged-in manager manages assigned students rather than claiming work as themselves. Only admins may change stages, including backwards transitions. The server enforces this for members and leads as well as the UI. Moving a part is the admin's sign-off; there is no separate approval or review queue. Old Preparing records migrate to Not Started, and Finished records migrate to Done. Counts, student assignments, and activity history are preserved; obsolete approval fields are removed from active records. Historical audit logs remain intact. The retired review endpoint returns HTTP 410.

Readiness checks remain in part details as preparation information. Admins confirm these, select an active student, and record good quantities before marking Done. An incomplete quantity needs an admin short-close reason. Blockers retain a reason, resolution owner, next action, and history. Good plus rework quantities cannot exceed required quantity plus any explicit spare target.

## Purchasing and storage

COTS editing contains Part Name, Vendor, Vendor Part Number, Product Link, Quantity Required, Quantity Ordered, Existing Stock, Storage Location 1, Storage Location 2, Subsystem, and Expected Delivery. Hidden legacy fields (receipts, pack size, reservations, notes and order reference) are preserved through edits. Existing Stock excludes received purchases. In House = stock minus reservations plus received purchases. To order = max(0, required minus In House minus inbound purchases). Order quantities count individual pieces; WCP cart quantities count vendor packs. Opening a cart never records an order. Use the inline Order and Receive actions to record actual purchasing events.

## Shared storage, roles, and recovery

The existing Site sharing policy and D1 `DB` binding are unchanged. Sites supplies authenticated identity. Runtime `ADMIN_EMAILS` lists admins; optional `VIEWER_EMAILS` lists read-only accounts. Legacy `LEAD_EMAILS` accounts have the same stage restrictions as members. Only admins manage catalogs, assignments, part metadata, and BOM destinations. Student roster emails link Todo assignments and do not grant Site access or app roles.

The backup envelope remains version 1, with additive schemaVersion 2 operations. Offline editing is unavailable. Pending saves are retained in browser storage, and conflicting edits require explicit resolution. Errors and pending saves stay visible; routine Saved and last-refresh text are hidden. Backups validate before applying, restore previews counts, and removed records remain recoverable in Admin. Audit includes the authenticated actor and before/after values. The workspace request limit remains 8 MB.

## Onshape integration

The explicitly configured assembly BOM is the only source of part discovery. Signed GET requests retain `generateIfAbsent=false`, `indented=false`, `includeExcluded=false`, and `includeTopLevelAssemblyRow=false`. No document scans, Part Studio discovery, BOM creation, or Onshape writes are performed.

Colors use BOM appearance/color data when present. Otherwise the server reads appearance metadata for only the exact manufactured leaf parts identified by that BOM, using each part's document, element, configuration, and workspace/version/microversion. Linked versions include the approved assembly document context. These color-only reads do not discover or import extra parts. They use the [Onshape part metadata API](https://onshape-public.github.io/docs/api-adv/metadata/), with bounded responses, four concurrent requests, deduplication per CAD appearance target, and the existing overall import timeout. Purchasing quantities and COTS imports remain unchanged.

Part colors are generalized into Black (`#000000`), White (`#ffffff`), Blue (`#001489`), or Yellow (`#ffd400`). Hue families accept shades such as gold, pale yellow, navy, and light blue; exact source matches are not required. Parts and Todo show a Color column, and compact Production cards place a dot next to the part name. White has a contrasting outline. Missing colors use an outlined placeholder until available; import warnings identify unavailable colors without clearing an existing color. Admins can select one of the four colors in part details. Onshape owns imported color unless the part's local CAD metadata override is enabled. Source hex values remain in private Onshape metadata; public views receive only the canonical team color.

Runtime secrets:

- `ONSHAPE_ACCESS_KEY` and `ONSHAPE_SECRET_KEY`: API credentials.
- `ONSHAPE_SOURCE_URLS`: JSON array of authorized assembly URLs, including document, workspace/version, and element IDs.
- `ONSHAPE_BASE_URL`: optional Onshape origin, default `https://cad.onshape.com`.

For local integration testing, copy `.env.example` to ignored `.env`, enter credentials, and start with `node --env-file=.env scripts/serve.mjs`. Never commit secrets.

Leaf parts with numbers beginning 7028 import into Parts. Each required manufactured unit gets its own quantity-one record. A BOM quantity of three creates `Rear Rail (A)`, `Rear Rail (B)`, and `Rear Rail (C)`; every instance keeps the original part number. Lettering continues with `(AA)` after `(Z)`. A source with quantity one keeps its original name until it becomes a multi-instance part. COTS remains aggregated by vendor/SKU with its full purchasing quantity.

Instances use the CAD source identity and a stable unit ordinal. Repeated imports reuse their IDs, student assignments, stages, and production counts. Quantity increases create additional unassigned instances without reopening completed units. Quantity reductions retain excess instances and flag them for review rather than deleting work; returning demand reuses those instances. Existing imported batches split on the next import, keeping the original record ID for instance A. Completed, spare, rework, and scrap totals are distributed without duplication, and existing workflow/history is preserved. This conversion is admin-only and does not create new approvals. Source changes still invalidate affected readiness checks. Expanded imports are limited to 10,000 manufactured instances.

Other numbered leaf parts and explicitly purchased/standard content import into COTS. Unidentified custom rows, excluded rows, and subassemblies are skipped. Repeated imports preserve purchasing progress. Distinct CAD identities sharing a number stay separate; manual collisions require explicit resolution. Missing source entries are flagged rather than deleted. Auto-import remains an explicit browser opt-in every five minutes while open and visible.

## Hosting

The retained `.openai/hosting.json` identifies the existing Site and D1 binding. `node scripts/build-worker.mjs` generates the Worker with embedded browser assets at `dist/server/index.js`; generated outputs are ignored by Git. Local development changes do not modify the live Site until deployed.

## Netlify preview and release

Netlify uses `netlify.toml` and `node scripts/build-netlify.mjs` to publish `netlify-public`, deploy the API Function, and connect Netlify Database and Identity. The plain Worker build is for Sites and local development; it is not a complete Netlify deployment. Keep the Netlify configuration, server adapter, package dependencies, and browser authentication files together when merging branches.

Use `preview` for development. Release to `main` only on an explicit user request. Preview and production use separate database branches and namespaces. Configure `ADMIN_EMAILS` and the approved read-only Onshape credentials in the matching Netlify deploy context. Production settings are not inherited from the preview branch. Public viewing remains available; verified approved accounts are required for changes. Google sign-in remains disabled. Never commit credentials.
