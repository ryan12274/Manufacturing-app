# Team 7028 Manufacturing

A responsive manufacturing workspace for FRC Team 7028. No package installation or build step required.

## Run locally

Use Node.js 20 or newer:

```sh
node scripts/serve.mjs
```

Open http://127.0.0.1:7028. To validate, run `node --test`, `node --check dist/app.js`, and `node --check dist/model.js`.

## Features

- Create, edit, and delete part records with quantities, subsystems, materials, manufacturing processes, owners, deadlines, priorities, CAD links, and shop notes.
- Follow parts through Not started, Ready, In progress, Blocked, and Complete on the production board.
- Search and filter the register. Export the current filtered view as CSV.
- Track material stock, storage locations, units, and reorder thresholds.
- Download a JSON backup and restore a validated backup.
- Explore labeled sample data or use Start empty to clear the sample workspace.

## Shop mode

Select **Shop mode** to use a display-friendly production board. Bookmark the app with `?shop=1` to open directly in shop mode. The five status lanes show large part cards, assigned owners, quantities, manufacturing processes, deadlines, and blocker notes. Start work or mark a part complete with the large action buttons. Status menus allow other transitions. Materials switches to a large inventory view; Exit shop mode returns to the regular workspace.

Fullscreen and Keep awake are optional browser features. If unsupported, the app shows a message and remains usable. Wake lock is requested only after tapping Keep awake and released on leaving shop mode. On smaller displays the lanes wrap; long columns scroll by touch. At 1920-pixel width all five lanes appear side by side.

Shop mode uses the same browser-local workspace as the normal view. It does not sync with other team devices.

### Starting and assigning work

Parts are unassigned by default. Starting an unassigned part opens **Who are you?** with name buttons from existing records and a field for a new name. Selecting a name and confirming starts work and saves that worker. Cancel leaves the part unchanged. The same rule applies to status menus and changing status in the part editor.

The optional **Advance assignment (admin, optional)** field preassigns a worker. Starting that part keeps the advance assignment and skips the name picker. Existing owner assignments are preserved when older workspaces or backups are loaded. Worker selections are separate from advance assignments, so restarting self-selected work asks who is starting it again. CSV exports include both the worker (`owner`) and advance assignment (`assignedTo`).

This browser-local version does not authenticate users or enforce admin roles. The advance assignment field is an administrative workflow control; restricting it to actual admins requires accounts and permissions.

## Branding

The palette uses yellow `#FFD400`, black, white, and deep navy. Yellow is taken from [the official Team 7028 stylesheet](https://www.7028robotics.com/style.css); navy reflects [the official Binary Battalion logo](https://www.7028robotics.com/images/7028-logo.png).

## Data storage

Records are saved in localStorage in the current browser and website origin. This version does not provide accounts, shared team data, cloud synchronization, or file uploads. Separate devices and deployed/local versions have separate workspaces. Clearing browser data removes saved records. Use Backup regularly; CSV exports are for reporting and cannot be restored as a workspace. Concurrent editing in multiple tabs can overwrite changes.

Inventory is tracked manually. Completing a part does not deduct material automatically. Completed status applies to an entire part record and its quantity.

## Deployment

Serve `dist/` on any static host. `.openai/hosting.json` identifies the private Sites preview. A shared database and member permissions are the next step for team-wide deployment.
