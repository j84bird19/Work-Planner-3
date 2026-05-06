Bird Planner V27 CRUD + Flow Stability Patch

Current locked model preserved:
- Single-page planner/PWA with LocalStorage persistence.
- Supplies cost model remains Cost ÷ Amount of Item for That Cost = Cost Per Unit.
- Quantity Remaining still auto-calculates from inventory added minus invoice supply usage.
- Invoice supply usage still charges cost per unit × quantity used and syncs remaining inventory.

V27 audit fixes:
- Hardened Supplies List CRUD flow.
- Add Item reliably creates a draft item and opens the Item tab with a blank form.
- Saving a supply marks it as real, recalculates cost/unit and remaining quantity, then returns to Supplies List.
- Quick Add row supports item name + price and Enter-to-add.
- Quick Add prevents duplicate item names by opening the existing item instead of making a duplicate.
- Delete button remains on the far right of each list item and warns if the item is already used on an invoice.
- Fixed invoice supply quantity math so the full invoice editor uses the entered quantity, not a hardcoded 1.
- Removing invoice supply lines now recalculates supply remaining quantity.
- Added state/tab guards so broken saved tab states cannot crash rendering.
- Added safer supply numbering to avoid duplicate Item # values after deletes/drafts.
