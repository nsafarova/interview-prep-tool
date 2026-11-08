# Interview Prep Dashboard

A simple app for organizing company research before an interview. Type in a company name, then keep notes on four things:

1. Products
2. Competitors
3. Recent news
4. Questions to ask in the interview

Each company also gets an interview date and a Done checkbox, so your saved list shows what is coming up.

## Why it exists

Interview prep notes end up scattered across tabs, docs, and screenshots. This puts everything for one company on a single screen, so you can review it in five minutes the night before.

## Features

- Add and remove companies
- Four note cards per company
- Interview date and status in the sidebar
- AI research: one click collects website, LinkedIn page, what the company does, products, competitors, and latest news using web search
- Optional accounts with email and password, and notes that sync across devices
- Notes saved in your browser when accounts are off
- Export and import as a JSON backup

## Run it

No install needed. Download the repo and open `index.html` in a browser.

To host it free with GitHub Pages: Settings, Pages, deploy from the `main` branch root.

## Accounts and sync (optional)

Sign in and sign up run on Supabase, so each person's notes sync across devices. Leave `config.js` empty and the app works without accounts, saving notes in the browser only.

1. Create a free project at supabase.com.
2. In the SQL editor, run everything in `supabase/schema.sql`. It creates one table and locks each row to its owner.
3. In Project Settings, then API, copy the Project URL and the anon public key into `config.js`. The anon key is safe to publish because row level security protects the data. Never put the service role key anywhere in this repo.
4. In Authentication, then URL Configuration, set the Site URL to your deployed address so confirmation emails link back to the app.
5. Commit and push. Vercel redeploys.

Notes made before signing up are carried into the new account the first time you sign in. Your Anthropic API key stays on each device and is never synced.

## Connect your own Claude (no API key)

Signed in users can let their own Claude research companies and save the results into their dashboard. It uses their own Claude plan, free or paid, so there is no key to paste and no cost to the app owner. Claude free accounts can add one custom connector.

1. Sign in, click Connect Claude, and create a connector link.
2. In Claude, open Customize, then Connectors, then Add custom connector, and paste the link.
3. Ask Claude: "Research Brightwave for my interview and save it to my dashboard."

The connector is a small server function in `api/mcp/[token].js` with three tools: `list_companies`, `get_company`, and `save_research`. The page refreshes by itself to show what Claude saved.

Security notes:
- The link contains a long random secret. Treat it like a password. Anyone with it can read and change that user's dashboard. Making a new link or clicking Disconnect stops the old one.
- Only a hash of the secret is stored in the database, and the server holds no secret keys.
- Vercel request logs include the link path, so only share log access with people you trust.
- A fuller version would use OAuth sign in instead of a secret link. That is on the roadmap.

## AI research setup

1. Click Settings in the sidebar and paste your own Anthropic API key (get one at console.anthropic.com).
2. Add a company, then click Research with AI.
3. Review the results and edit anything that looks off. AI can be wrong, so always verify.

The key is stored only in your browser and sent only to Anthropic. Because the key lives in the browser, use a personal key with a spend limit, and do not use this on a shared computer.

## Privacy

Everything stays in your browser's local storage. Nothing is sent anywhere except the company name to Anthropic when you click Research with AI. Use Export to back up your notes, since clearing browser data will erase them.

## Roadmap ideas

- Source links next to each AI finding
- Refresh news with one click
- Tags and filters by interview stage
- Calendar reminders for interview dates
- Shareable read only view
- Password reset page
- OAuth sign in for the Claude connector instead of a secret link

## License

Apache 2.0
