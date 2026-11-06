# QuietSend — One-time text sharing with the simple 4 Digits otp

QuietSend is a small browser-based text-sharing application built with HTML, CSS, JavaScript and Firebase Realtime Database.

A sender stores a text message and shares a short retrieval code with the intended recipient. The recipient enters the code to retrieve and copy the message.

## Features

- Send plain text up to 8,000 characters.
- Generate a four-digit retrieval code.
- Retrieve a message by entering its code.
- Attempt to remove a message after retrieval.
- Responsive interface for phones, tablets and desktops.
- Reduced-motion preference support.
- Static deployment through the included GitHub Pages workflow.

## Implementation

| Path | Responsibility |
|---|---|
| `index.html` | Page structure |
| `assets/css/styles.css` | Responsive styles |
| `assets/js/app.js` | Input handling, code generation and Firebase reads/writes |
| `.github/workflows/static.yml` | Static-site deployment |

The application uses the Firebase Realtime Database path `messages/{code}` and stores the message text with a timestamp.

## Run and deploy

The repository is a static browser application.

1. Clone the repository.
2. Review the Firebase client configuration in `assets/js/app.js`.
3. Configure the Firebase project and its database rules for the intended use.
4. Serve the repository with a local static server or deploy it with GitHub Pages.

Example local server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Security limitations

QuietSend is a demonstration of short-code-based text sharing. It should **not** be used to exchange confidential, personal, financial or otherwise sensitive information.

- A four-digit retrieval code is a locator, not encryption or strong authentication.
- The current code uses `Math.random()` for code generation; it is not a cryptographically secure random-number generator.
- The current check-then-write flow is not an atomic reservation, so concurrent requests can race.
- The repository does not include Firebase Realtime Database Security Rules. Access must be restricted and tested in the Firebase project before public use.
- The client attempts to remove a message after retrieval. Client-side deletion is best-effort and is not guaranteed secure erasure.
- Do not assume messages expire automatically; the current application writes a timestamp but does not establish a verified server-side retention policy.
- Rate limiting, abuse prevention and automated security tests are not included in this repository.

## Testing status

A dedicated automated test suite is not currently included. Validate message creation, code collisions, concurrent sends, unauthorized reads, failed writes, retrieval and deletion using a separate Firebase test project before relying on the application.

## Scope

QuietSend is a lightweight learning project for browser UI development and Firebase Realtime Database integration. It is not an encrypted messaging service.
