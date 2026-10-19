(() => {
  'use strict';

  // Preserve the original Firebase project and messages/{code} data structure.
  // Firebase web configuration is public client config, not a server secret.
  const firebaseConfig = {
    apiKey: 'AIzaSyCOUouIbobBZvpubFuIf2Rb84k-4qkKmjU',
    authDomain: 'textsendreceive.firebaseapp.com',
    databaseURL: 'https://textsendreceive-default-rtdb.firebaseio.com',
    projectId: 'textsendreceive',
    storageBucket: 'textsendreceive.appspot.com',
    messagingSenderId: '180810658410',
    appId: '1:180810658410:web:e056ed0b811b8c604e5013'
  };

  const $ = (id) => document.getElementById(id);
  const sendArea = $('message-text');
  const sendButton = $('send-button');
  const receiveButton = $('receive-button');
  const codeInput = $('receive-code');
  const codeResult = $('code-result');
  const feedbackSend = $('send-feedback');
  const feedbackReceive = $('receive-feedback');
  const receivedCard = $('received-card');
  const receivedContent = $('received-content');
  let db = null;
  let busySend = false;
  let busyReceive = false;
  let lastReceivedText = '';

  function feedback(node, message, type = 'info') {
    node.textContent = message;
    node.dataset.state = type;
    node.hidden = !message;
  }

  function connection(message, status = 'info') {
    const node = $('connection-status');
    node.querySelector('span').textContent = message;
    node.dataset.state = status;
  }

  function setSendBusy(busy, label) {
    sendButton.disabled = busy;
    $('send-button-label').textContent = label;
  }

  function setReceiveBusy(busy, label) {
    receiveButton.disabled = busy;
    $('receive-button-label').textContent = label;
  }

  function generateCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function initializeFirebase() {
    if (!window.firebase || !firebase.database) {
      connection('Firebase unavailable', 'error');
      feedback(feedbackSend, 'Firebase did not load. Check your internet connection and reload.', 'error');
      feedback(feedbackReceive, 'Firebase did not load. Check your internet connection and reload.', 'error');
      sendButton.disabled = true;
      receiveButton.disabled = true;
      return;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      db = firebase.database();

      // Check actual Realtime Database access instead of showing a false "connected" status.
      db.ref('.info/connected').on('value', (snapshot) => {
        if (snapshot.val() === true) {
          connection('Firebase connected', 'ready');
        } else {
          connection('Connecting to Firebase', 'info');
        }
      }, (error) => {
        console.error('Firebase connection listener failed:', error);
        connection('Database access denied', 'error');
      });
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      connection('Firebase setup error', 'error');
      feedback(feedbackSend, 'Firebase could not initialize. Check the project configuration.', 'error');
      feedback(feedbackReceive, 'Firebase could not initialize. Check the project configuration.', 'error');
      sendButton.disabled = true;
      receiveButton.disabled = true;
    }
  }

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const isSend = button.dataset.tab === 'send';
      document.querySelectorAll('[data-tab]').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      $('panel-send').hidden = !isSend;
      $('panel-receive').hidden = isSend;
      feedbackSend(feedbackSend, '', 'info');
      feedback(feedbackReceive, '', 'info');
      if (window.matchMedia('(max-width:720px)').matches) {
        $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  sendArea.addEventListener('input', () => {
    $('character-count').textContent = sendArea.value.length.toLocaleString() + ' / 8,000';
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
  });
  codeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') receiveButton.click();
  });

  sendButton.addEventListener('click', async () => {
    if (!db || busySend) {
      if (!db) feedback(feedbackSend, 'Firebase is not ready. Wait a moment and try again.', 'error');
      return;
    }

    const text = sendArea.value.trim();
    if (!text) {
      feedback(feedbackSend, 'Please enter some text before sending.', 'error');
      sendArea.focus();
      return;
    }
    if (text.length > 8000) {
      feedback(feedbackSend, 'Your message is too long. Maximum length is 8,000 characters.', 'error');
      return;
    }

    busySend = true;
    setSendBusy(true, 'Saving message…');
    codeResult.hidden = true;
    feedback(feedbackSend, 'Connecting to your existing Firebase database…');

    try {
      // Keep the original system: check messages/{code}, then write {text, timestamp}.
      // Do not change to transactions, claims, auth requirements, or media storage.
      let saved = false;
      let code = '';
      for (let attempt = 0; attempt < 40; attempt += 1) {
        code = generateCode();
        const existing = await db.ref('messages/' + code).get();
        if (existing.exists()) continue;

        try {
          await db.ref('messages/' + code).set({
            text: text,
            timestamp: Date.now()
          });
          saved = true;
          break;
        } catch (error) {
          console.error('Firebase write failed:', error);
          throw error;
        }
      }

      if (!saved) throw new Error('Could not generate an unused code. Please try again.');

      $('created-code').textContent = code;
      codeResult.hidden = false;
      sendArea.value = '';
      $('character-count').textContent = '0 / 8,000';
      feedback(feedbackSend, 'Message saved successfully. Share this code with your recipient.', 'success');
      codeResult.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest'
      });
    } catch (error) {
      console.error('Unable to send text:', error);
      if (error && (error.code === 'PERMISSION_DENIED' || /permission_denied/i.test(error.message || ''))) {
        feedback(feedbackSend, 'Firebase rejected the write. Check Realtime Database Rules for messages/{code}.', 'error');
      } else {
        feedback(feedbackSend, 'Could not send the message. Check your internet connection and Firebase Realtime Database Rules, then try again.', 'error');
      }
    } finally {
      busySend = false;
      setSendBusy(false, 'Create one-time code');
    }
  });

  receiveButton.addEventListener('click', async () => {
    if (!db || busyReceive) {
      if (!db) feedback(feedbackReceive, 'Firebase is not ready. Wait a moment and try again.', 'error');
      return;
    }
    const code = codeInput.value.trim();
    if (!/^\d{4}$/.test(code)) {
      feedback(feedbackReceive, 'Please enter a valid four-digit code.', 'error');
      codeInput.focus();
      return;
    }

    busyReceive = true;
    setReceiveBusy(true, 'Looking for message…');
    receivedCard.hidden = true;
    feedback(feedbackReceive, 'Looking for your message…');

    try {
      const snapshot = await db.ref('messages/' + code).get();
      if (!snapshot.exists() || typeof snapshot.val().text !== 'string') {
        feedback(feedbackReceive, 'No text message was found for this code.', 'error');
        return;
      }

      lastReceivedText = snapshot.val().text;
      const paragraph = document.createElement('p');
      paragraph.className = 'received-text';
      paragraph.textContent = lastReceivedText;
      receivedContent.replaceChildren(paragraph);
      receivedCard.hidden = false;
      feedback(feedbackReceive, 'Message received successfully.', 'success');
      receivedCard.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest'
      });
      // Intentionally retain original behavior: receiving reads the message but does not delete it.
    } catch (error) {
      console.error('Unable to receive text:', error);
      if (error && (error.code === 'PERMISSION_DENIED' || /permission_denied/i.test(error.message || ''))) {
        feedback(feedbackReceive, 'Firebase rejected the read. Check Realtime Database Rules for messages/{code}.', 'error');
      } else {
        feedback(feedbackReceive, 'Could not retrieve the message. Check your connection and Firebase database rules.', 'error');
      }
    } finally {
      busyReceive = false;
      setReceiveBusy(false, 'Receive message');
    }
  });

  async function copyText(text, successMessage, feedbackNode) {
    if (!text) {
      feedback(feedbackNode, 'There is no text to copy yet.', 'error');
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const temporary = document.createElement('textarea');
        temporary.value = text;
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        temporary.setAttribute('readonly', '');
        document.body.appendChild(temporary);
        temporary.select();
        temporary.setSelectionRange(0, temporary.value.length);
        const copied = document.execCommand('copy');
        temporary.remove();
        if (!copied) throw new Error('Copy failed');
      }
      feedback(feedbackNode, successMessage, 'success');
    } catch (error) {
      console.error('Clipboard copy failed:', error);
      feedback(feedbackNode, 'Copy failed. Select the text and copy it manually.', 'error');
    }
  }

  $('copy-code').addEventListener('click', () => {
    copyText($('created-code').textContent.trim(), 'Code copied to clipboard.', feedbackSend);
  });
  $('copy-message').addEventListener('click', () => {
    copyText(lastReceivedText, 'Message copied to clipboard.', feedbackReceive);
  });

  initializeFirebase();
})();