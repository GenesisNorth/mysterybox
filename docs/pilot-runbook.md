# Pilot runbook: running Gratitude Stories day to day

For the person who packs, ships and supports boxes during the pilot. Everything happens in the staff console at **`https://<your domain>/admin`**. Sign in with your personal access token (keep it in your password manager; never share it).

## Every morning (15 minutes)

1. **Help** tab: answer every open request, oldest first (see "Help requests" below). Mark each one resolved when done.
2. **Reminders** tab (administrators): send any text-message reminders that are due, and any email marked "Automatic sending failed". For each: **Prepare message**, send that exact text from the team phone or email, then **Mark as sent**.
3. **Boxes** tab: check the counts. "To pack" boxes should leave within one working day.

## Starting a new trail (a starter box)

1. **Boxes → Start a new trail** (administrators). This creates the first box of a new trail.
2. When the starter has paid, open the box and press **Mark as paid**.
3. **Participants** (administrators): enter the giver and recipient. Only tick the giver's "appear on the trail" box if they agreed. The recipient chooses for themselves later.
4. **Delivery details**: the address, contact name and phone the courier will use.
5. Continue with "Packing and shipping" below.

Boxes passed forward by recipients arrive already **Paid**, with the giver's message and the delivery details filled in from checkout.

## Packing and shipping

Open the box and follow the highlighted **Next** panel:

1. **Bind a card.** Take a printed card from stock, check its code (e.g. `GS-CARD-7E13A292BF`), and select that code. A box cannot be marked packed without a card.
2. **Pack.** Enter your name, tick all three checks (items complete, note inside if you print notes, the right card inside) and add any exceptions in the notes.
3. **Courier handoff.** Enter the courier and the waybill number.
4. **Delivery proof.** When the courier confirms, enter who delivered it and the proof reference (POD number or photo reference). The recipient can now open the box by scanning the card.

Never open the recipient's box page yourself by scanning a card: the first phone to tap "Yes, I have it" becomes the box's owner.

## Help requests

| Request | What to do |
| --- | --- |
| **My box hasn't arrived** | Check the box's status and courier record. Contact the courier with the waybill number. Reply to the person if they left a contact. |
| **Damaged or something is wrong** | Ask for a photo through their contact. Arrange a replacement or refund with an administrator. |
| **Lost my card or changed phones** | First **confirm it is really the recipient**, e.g. call the delivery phone number on the box. Then an administrator opens the box and uses **Issue recovery link**, and sends that link to them. It works once, for 48 hours, and signs out any other phone. They then scan the card again. If the card itself is lost after delivery, escalate to an administrator. |
| **Something else** | Read the message and reply through the contact they left. |

A help request never shows you who gave the box or the recipient's details; open the box (Participants / Delivery details) if you need them for support.

## Cards

- Print cards in batches from **Cards → Issue and print**. The printable sheet is shown **once**: print it or save it as PDF straight away. Refreshing that page would issue another batch.
- Store printed cards somewhere safe: anyone holding an unbound card cannot do anything with it, but a card bound to a box opens that box.
- Damaged or lost unbound cards: **Void** them on the Cards page.
- A card lost from a packed-but-not-shipped box: an administrator uses **Replace a lost or damaged card** on the box (only while the box is Paid).

## Cancelling or refunding

Administrators only: open the box → **Cancel or refund this box**. The recipient will see the box as no longer active. This cannot be undone. Money refunds are handled outside the console for now.

## "Please delete my details"

Administrators only, once the box is delivered, cancelled or refunded: open the box → **Erase someone's personal details** → choose the recipient or the giver. Their name and contact details are removed; the trail keeps its shape and shows them as "A friend". Payment records are kept. Note the request date and who asked, outside the system, in your privacy log.

## Staff accounts

Administrators: **Staff** tab. Create a personal account for each team member (Operations for fulfilment, Administrator only for people who need contact details). The token is shown once; hand it over privately. When someone leaves, **Revoke** their access the same day. If a token may have leaked, issue a **New token**.

## Never

- Share a card's QR code, a reminder link or a recovery link with anyone other than its intended person.
- Send anyone's phone, email or address to another participant, or put names in public posts without consent.
- Change boxes or trails directly in the database. If something looks wrong, stop and ask an administrator.

## If something is broken

1. Open `https://<your domain>/ready`. `"status":"ready"` means the site and database are up.
2. If it is not ready, or pages fail to load, contact the technical owner: **[name, phone]**.
3. When reporting a problem, include the time and what you clicked. Do not send screenshots of recipients' pages or contact details.

## Pilot contacts

| Role | Name | Phone |
| --- | --- | --- |
| Fulfilment lead | | |
| Administrator | | |
| Technical owner | | |
| Courier account | | |
