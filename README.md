# QuietSend — One-time text sharing

QuietSend is a minimalist, responsive text-sharing website built with HTML, CSS, JavaScript, and the existing Firebase Realtime Database project.

## Features
- Send plain text up to 8,000 characters.
- Generate a unique four-digit retrieval code.
- Receive a message with its code and copy the text.
- Attempts to remove a retrieved message from Realtime Database.
- Responsive layout for phones, tablets, and desktops.
- Respects reduced-motion preferences and keeps the Google site-verification meta tag.

## Structure
- `index.html` — accessible page structure
- `assets/css/styles.css` — responsive visual design
- `assets/js/app.js` — text-only app and Firebase Realtime Database flow
- `.github/workflows/static.yml` — GitHub Pages deployment

## Firebase and security
The app uses the existing Firebase project and the `messages/{code}` Realtime Database path. Firebase web configuration values are public client identifiers, not secrets; they cannot be hidden in a static browser app. Secure the database with strict Firebase Security Rules and App Check. A four-digit code is not encryption. Client-side deletion is best-effort and should not be treated as guaranteed secure erasure.

## Deploy
GitHub Pages deploys the repository through the existing Actions workflow. No media recording, audio, video, or Firebase Storage functionality is included.
