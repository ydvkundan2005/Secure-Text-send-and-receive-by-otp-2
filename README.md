# QuietSend — One-time text, voice, and video notes

QuietSend is a static, responsive web app hosted on the repository's existing GitHub Pages site. It retains the existing Firebase Realtime Database project, Google site-verification metadata, and four-digit one-time-code workflow.

## Project structure

- index.html — semantic page structure and accessibility labels
- assets/css/styles.css — responsive black/charcoal UI
- assets/js/app.js — Firebase integration, one-time code flow, recording, upload, receive, and cleanup

## Supported flows

- Send a text message up to 8,000 characters.
- Record a voice note up to 2 minutes.
- Record a video note up to 45 seconds.
- Media uploads are limited to 20 MB.
- Share a four-digit code with the recipient.
- Receive and display/download media in the browser.
- After a successful receive, the app attempts to delete the message record and media object.
- Records are treated as expired after 24 hours when a recipient tries to retrieve them. This client-only implementation does not provide a server-side scheduled cleanup job for messages nobody retrieves.

## Firebase setup

The app currently points at the existing textsendreceive Firebase project. Text messages use Realtime Database. Voice/video notes additionally require Firebase Storage to be enabled for the configured bucket.

If media upload reports a missing bucket, enable Firebase Storage in the Firebase Console for the existing project. Check the Realtime Database and Storage Security Rules before publishing real/private content. The app attempts anonymous Firebase sign-in if Anonymous Authentication is enabled; it falls back to the legacy client-access behavior if that sign-in is unavailable so the previous text flow is not automatically disabled.

### Security is a Firebase configuration responsibility

- A four-digit code is not encryption and has only 9,000 possible values.
- Firebase web app apiKey values are public client identifiers, not server secrets. Moving one into another JavaScript file does not hide it from visitors. Never put service-account keys, private API secrets, or admin credentials in this static site.
- Protect database and storage data with restrictive Firebase Security Rules, enable Firebase App Check, and enable Anonymous Authentication (or use a trusted backend with rate limiting) before using this with sensitive messages.
- The current client-side one-time deletion is best-effort, not a guaranteed server-enforced single-use transaction. A recipient who does not retrieve a message will leave it in the database until it is retrieved or manually cleaned up.
- Do not describe this app as end-to-end encrypted; the messages are uploaded as ordinary text/media in this version.

A suggested secure deployment needs Firebase rules appropriate for the message schema, Storage rules, App Check setup, and ideally a trusted backend for code creation/consumption and expiry cleanup. This repository does not contain admin credentials and does not deploy Firebase backend configuration.

## Local preview

Serve the repository directory over localhost (recommended for camera/microphone permissions):

    python3 -m http.server 8000

Open http://localhost:8000 in a browser. Voice/video recording requires HTTPS in production (GitHub Pages supplies HTTPS) and microphone/camera permission.

## Existing hosting

The existing GitHub Pages workflow and Google site-verification meta tag are preserved. A push to main updates the existing published site rather than disabling its publishing configuration.
