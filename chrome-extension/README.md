# Booklage Chrome Extension

Save any webpage to your Booklage collage with one click.

## Setup

1. Open `chrome://extensions/` in Chrome
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select this `chrome-extension` folder

## How it works

1. Click the Booklage icon in your toolbar
2. Preview the page info (title, thumbnail, URL)
3. Click "Booklageに保存"
4. The page opens Booklage's `/save` route with the data
5. Booklage saves it to IndexedDB and redirects to the board

## Icons

Replace the placeholder icons with actual Booklage icons:
- `icons/icon-16.png` (16x16)
- `icons/icon-48.png` (48x48)
- `icons/icon-128.png` (128x128)
