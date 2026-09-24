# GitHub Pages edition: Star Wars 500% Job Progress Tracker

This edition runs from GitHub Pages. It reads and writes the existing private Google Sheet with **Google sign-in + the Google Sheets API**. Each visitor uses their own Google account. Google grants access according to the spreadsheet's sharing permissions; the website does not contain a private API key, a client secret, or a service-account credential.

## What the page can edit

Open a card and click **Edit**. The editor can update:

| Field | Sheet column |
| --- | --- |
| Selected Yes/No | C |
| Priority / status | D |
| Price | E |
| Price agreed | F |
| Paid | G |
| Note | H |

The page never edits project names, image links, the image source sheet, or totals. It edits only the fields you change on a card and preserves the other cell formatting. A save checks the row name and edited fields against the latest sheet contents before sending the update; if somebody changes that row while the editor is open, refresh and try again. Avoid sorting the source spreadsheet while someone is saving a card.

In Progress projects appear first. First, Second, Mid and other priorities each have sections; Completed projects have their own gallery. Images and model links come from `Sheet4` columns B and D. Total cost sums all numeric prices. Remaining balance sums prices whose Paid field says `No`. Due now sums unpaid prices only when Priority says `Completed`. The page refreshes once per minute while visible and after each save.

Published with GitHub Pages.