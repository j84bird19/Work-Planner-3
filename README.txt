Ahtelleeay V50 Stabilized Hyperreal Binder Engine

Updates:
- Rebuilt the visual layer cleanly instead of stacking old CSS revisions.
- Stabilized mobile binder/file-folder layout so all 5 vertical section tabs fit on screen.
- Added luxury physical folder styling inspired by the reference image.
- Active section now drives the full folder frame/background color.
- Preserved existing app architecture and locked business logic.
- Added state math normalization before save/flush to reduce tracker drift.
- Fixed quick-add existing supply path cleanup.
- Updated PWA cache/assets to V50.

Deployment rule:
Upload ONLY these extracted files into the stabilization branch root. Replace matching files. Delete old versioned files if they remain.


V50.1 Vertical Tab Lock Pass:
- Only vertical section tab layout was changed.
- All 5 side section tabs fill the binder height equally.
- Tabs overlap slightly like physical file folders.
- Section titles use gold lettering for readability.
- App logic, math, save/sync, scratch pad, reminders, time card, and PWA behavior were not intentionally changed.
