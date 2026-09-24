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

## Set up Google access

1. In Google Cloud Console, create or select a project you control. Enable **Google Sheets API** for it.
2. Configure **Google Auth Platform / OAuth consent** for your intended users. If the app is in Testing, add each tester's Google account. For a school-managed account, the Google Workspace administrator may need to allow this OAuth app and its spreadsheet scope.
3. Create an **OAuth client ID** of type **Web application**. Add the *origin* of your future GitHub Pages address to **Authorized JavaScript origins**: `https://YOUR-USERNAME.github.io` (do not add the repository path). For a custom domain, add its HTTPS origin too. The browser token flow does not need a redirect URI for this page.
4. Put the Web client ID in `config.js`, replacing `REPLACE_WITH_WEB_OAUTH_CLIENT_ID.apps.googleusercontent.com`. The spreadsheet ID is already set to your existing sheet. An OAuth **client ID is public**; do not paste a client secret into any repository file.
5. Share your original Google Sheet with each person who should use it. **Editor** access is needed to save changes; viewers can sign in and see cards but cannot save.

The app requests `https://www.googleapis.com/auth/spreadsheets` when the user clicks **Connect Google**. Google may require consent screen verification or limit testing depending on your Google Cloud and Workspace configuration. The page itself is public on GitHub Pages, but the project data remains available only to accounts authorized to read the Sheet.

## Publish on GitHub Pages

1. Put **`index.html`**, **`app.js`**, and **`config.js`** at the root of a GitHub repository. They are a complete static website; do not upload `Code.gs` from the older Apps Script version.
2. In the repository, open **Settings → Pages**. Set **Build and deployment → Deploy from a branch**, then choose your branch (`main`) and the root folder (`/`). Save.
3. Open the Pages URL shown under **Settings → Pages**, click **Connect Google**, choose an account with access to the source sheet, and try changing a test project's Priority or Note. Refresh the Sheet to confirm the edit, and verify the card moves to the right category.

If you publish under a different account or custom domain, update the authorized JavaScript origin in the Google OAuth client. A **403** usually means that account lacks sheet access, the Google Sheets API is disabled in the Cloud project, or the Workspace admin blocked this app. A popup/origin error usually means the OAuth JavaScript origin does not exactly match the site's origin.

Official references: [Google Identity Services browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model), [Google OAuth client setup](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid), [Sheets batch updates](https://developers.google.com/workspace/sheets/api/guides/batchupdate), [GitHub Pages setup](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
