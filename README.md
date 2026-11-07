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
- Notes saved in your browser, no account or server
- Export and import as a JSON backup

## Run it

No install needed. Download the repo and open `index.html` in a browser.

To host it free with GitHub Pages: Settings, Pages, deploy from the `main` branch root.

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

## License

MIT
