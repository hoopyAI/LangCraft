# Notion Creator Web App

This is a web interface for the Notion Creator tool.

## Setup

1.  Navigate to the `web` directory:
    ```bash
    cd web
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment Variables:
    Copy the `.env` file from the project root to `web/.env.local`.
    ```bash
    cp ../.env .env.local
    ```
    Ensure the following variables are set in `.env.local`:
    - `AZURE_OPENAI_ENDPOINT`
    - `AZURE_OPENAI_API_KEY`
    - `AZURE_OPENAI_DEPLOYMENT_NAME`
    - `NOTION_TOKEN`
    - `NOTION_PAGE_ID`
    - `AZURE_SPEECH_KEY` (Optional)
    - `AZURE_SPEECH_REGION` (Optional)

## Running the App

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Features

- **Manual Input**: Paste French text directly.
- **File Upload**: Upload `.txt` files containing French articles.
- **Preview**: See the generated bilingual content, vocabulary cards, and grammar points before publishing.
- **PDF Download**: Download the generated content as a PDF.
- **Notion Export**: One-click publish to your configured Notion page.
