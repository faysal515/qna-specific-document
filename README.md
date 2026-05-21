# Interactive Chat with narrow search

This repo is a minimal chat UI that shows that flow. Data source can be anything you like. Pdf, Docx or as complicated flow like ARIS.

## Demo

<video src="public/demo.mp4" controls width="720">
  <a href="public/demo.mp4">Watch the walkthrough</a>
</video>

---

## Story

A user asks something vague: *“How do I dispute a card charge?”*

1. The model calls **`searchProcesses`** — narrow the catalog, don’t chunk the entire corpus.
2. The UI shows a few **candidates**; the user picks one.
3. The model calls **`getProcessGraph`** — load steps and connectors for *that* process only.
4. The model answers from that graph. **Sources** list what was used; feedback attaches to grounded replies.

Ambiguous questions stop before a wrong-document answer. Clear scope means the LLM step is mostly **context feeding**, not retrieval roulette.

---

## Run locally

```bash
npm install
```

`.env` in the project root (Azure OpenAI):

```bash
AZURE_RESOURCE_NAME=...
AZURE_API_KEY=...
AZURE_OPENAI_DEPLOYMENT=...
```

Two terminals:

```bash
npm run dev          # UI → http://localhost:3000
npm run dev:server   # API → http://localhost:3001
```

Optional overrides: `NEXT_PUBLIC_CHAT_API_URL`, `NEXT_PUBLIC_CHAT_HISTORY_URL` (defaults point at `3001`).

Try: *“open an account”*, *“dispute a card transaction”*, *“close my account”* — vague ones should ask you to pick a process first.

---

## Where things live

| Piece | Path |
| --- | --- |
| Chat + candidates UI | `app/page.tsx`, `components/` |
| Stream + tools | `server/index.ts` |
| Catalog search + graph load | `server/db/aris.ts` |
| Mock catalog (swap for real) | `data/processes.json`, `data/steps.json` |

Deeper wire-up: [ARCHITECTURE.md](./ARCHITECTURE.md).
