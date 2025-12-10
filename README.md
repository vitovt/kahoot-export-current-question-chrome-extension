# Kahoot Question Exporter

A lightweight Chrome extension that captures the current Kahoot question and answers, formats them as Markdown, and copies the result to your clipboard automatically.

## What it does

- Scrapes the question title and answer options from the open Kahoot question view.
- Builds Markdown in the shape:
  ```
  ### Question text
  ?
  - Answer A
  - Answer B
  - Answer C
  - Answer D
    
  ```
- Copies the Markdown to your clipboard and shows it in the popup for reference.

## Usage

1. Open a Kahoot question page in your browser.
2. Click the extension icon. The popup runs immediately; if it finds the question and answers, it copies the Markdown to the clipboard.
3. Paste the Markdown into your notes.
4. If the question does not load on the first try, press **Copy current question** in the popup to retry.

## Installation (development mode)

1. Clone or download this repository.
2. In Chrome, open `chrome://extensions`.
3. Toggle **Developer mode** on.
4. Click **Load unpacked** and select the `kahoot-export-current-question-chrome-extension` directory.

## Notes

- The extension only needs `activeTab` and `scripting` permissions to read the current page content when you click the icon.
- The popup runs its scrape only when opened or when you press the button; it does not run in the background.
