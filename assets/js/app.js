(() => {
  'use strict';

  // Firebase web configuration identifies the project; it is not a server secret.
  // Protect the database with Firebase Security Rules and App Check.
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCOUouIbobBZvpubFuIf2Rb84k-4qkKmjU',
    authDomain: 'textsendreceive.firebaseapp.com',
    databaseURL: 'https://textsendreceive-default-rtdb.firebaseio.com',
    projectId: 'textsendreceive',
    messagingSenderId: '180810658410',
    appId: '1:180810658410:web:e056ed0b811b8c604e5013'
  };

  const MAX_TEXT_LENGTH = 8000;
  const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
  const CLAIM_TTL_MS = 2 * 60 * 1000;
  const $ = (id) => document.getElementById(id);
  const state = { db: null, ready: false, sending: false, receiving: false, receivedText: '' };

  const showFeedback = (id, message, type = 'info') => {
    const node = $(id);
    node.textContent = message;
    node.dataset.state = type;
    node.hidden = !message;
  };
  const setConnection = (message, status = 'info') => {
    const node = $('connection-status');
    node.querySelector('span').textContent = message;
    node.dataset.state = status;
  };
  const setBusy = (buttonId, labelId, busy, busyText, idleText) => {
    $(buttonId).disabled = busy;
    $(labelId).textContent = busy ? busyText : idleText;
  };
  const randomCode = () => String(Math.floor(1000 + Math.random() * 9000));
  const randomId = () => {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  };

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const send = button.dataset.tab === 'send';
      document.querySelectorAll('[data-tab]').forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      $('panel-send').hidden = !send;
      $('panel-receive').hidden = send;
      $('send-feedback').hidden = true;
      $('receive-feedback').hidden = true;
      if (window.matchMedia('(max-width:720px)').matches) {
        $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  $('message-text').addEventListener('input', () => {
    $('character-count').textContent = $('message-text').value.length.toLocaleString() + ' / ' + MAX_TEXT_LENGTH.toLocaleString();
  });
  $('receive-code').addEventListener('input', () => {
    $('receive-code').value = $('receive-code').value.replace(/\D/g, '').slice(0, 4);
    $('receive-feedback').hidden = true;
  });
  $('receive-code').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('receive-button').click();
  });

  async function initializeFirebase() {
    if (!window.firebase) {
      setConnection('Firebase unavailable', 'error');
      showFeedback('send-feedback', 'Firebase could not load. Check your connection and reload.', 'error');
      $('send-button').disabled = true;
      $('receive-button').disabled = true;
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      state.db = firebase.database();
      try {
        await firebase.auth().signInAnonymously();
      } catch (error) {
        // Keep compatibility with the existing Realtime Database setup.
        console.warn('Anonymous authentication unavailable; checking database access.', error);
      }
      state.ready = true;
      setConnection('Firebase connected', 'ready');
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      setConnection('Connection issue', 'error');
      showFeedback('send-feedback', 'Could not connect to Firebase. Check project settings and database rules.', 'error');
      showFeedback('receive-feedback', 'Could not connect to Firebase. Check project settings and database rules.', 'error');
      $('send-button').disabled = true;
      $('receive-button').disabled = true;
    }
  }

  async function reserveCode(message) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const code = randomCode();
      const ref = state.db.ref('messages/' + code);
      const result = await ref.transaction((existing) => existing === null ? message : undefined, undefined, false);
      if (result.committed) return { code, ref };
    }
    throw new Error('Could not find an unused code. Please try again.');
  }

  async function sendMessage() {
    if (!state.ready || state.sending) return;
    const text = $('message-text').value.trim();
    if (!text) {
      showFeedback('send-feedback', 'Write a message before creating a code.', 'error');
      $('message-text').focus();
      return;
    }
    if (text.length > MAX_TEXT_LENGTH) {
      showFeedback('send-feedback', 'Messages can be up to 8,000 characters.', 'error');
      return;
    }
    state.sending = true;
    setBusy('send-button', 'send-button-label', true, 'Creating code…', 'Create one-time code');
    $('code-result').hidden = true;
    showFeedback('send-feedback', 'Saving your message…');
    let reservation = null;
    try {
      const now = Date.now();
      // Keep the existing Realtime Database path and simple text message shape.
      reservation = await reserveCode({
        type: 'text',
        text,
        status: 'ready',
        createdAt: now,
        expiresAt: now + MESSAGE_TTL_MS
      });
      $('created-code').textContent = reservation.code;
      $('code-result').hidden = false;
      $('code-result').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest'
      });
      $('message-text').value = '';
      $('character-count').textContent = '0 / ' + MAX_TEXT_LENGTH.toLocaleString();
      showFeedback('send-feedback', 'Your message is ready. Share the four-digit code.', 'success');
    } catch (error) {
      console.error('Could not save message:', error);
      if (reservation?.ref) reservation.ref.remove().catch(() => {});
      showFeedback('send-feedback', 'The message could not be saved. Check Firebase Realtime Database rules and try again.', 'error');
    } finally {
      state.sending = false;
      setBusy('send-button', 'send-button-label', false, 'Creating code…', 'Create one-time code');
    }
  }
  $('send-button').addEventListener('click', sendMessage);

  async function claimMessage(ref) {
    const claimId = randomId();
    const now = Date.now();
    const result = await ref.transaction((current) => {
      if (!current) return;
      if (current.type && current.type !== 'text') return;
      if (current.status === 'claimed' && now - Number(current.claimedAt || 0) < CLAIM_TTL_MS) return;
      if (current.status && current.status !== 'ready' && current.status !== 'claimed') return;
      if (current.expiresAt && Number(current.expiresAt) < now) return null;
      return Object.assign({}, current, { type: 'text', status: 'claimed', claimId, claimedAt: now });
    }, undefined, false);
    if (!result.committed || !result.snapshot.exists()) return null;
    const message = result.snapshot.val();
    return message.claimId === claimId ? message : null;
  }

  async function receiveMessage() {
    if (!state.ready || state.receiving) return;
    const code = $('receive-code').value.trim();
    if (!/^\d{4}$/.test(code)) {
      showFeedback('receive-feedback', 'Enter the four-digit code you received.', 'error');
      $('receive-code').focus();
      return;
    }
    state.receiving = true;
    setBusy('receive-button', 'receive-button-label', true, 'Checking code…', 'Receive message');
    $('received-card').hidden = true;
    showFeedback('receive-feedback', 'Looking for your message…');
    const ref = state.db.ref('messages/' + code);
    try {
      const message = await claimMessage(ref);
      if (!message || typeof message.text !== 'string') {
        showFeedback('receive-feedback', 'No available text was found for that code. It may have expired or already been received.', 'error');
        return;
      }
      state.receivedText = message.text;
      const paragraph = document.createElement('p');
      paragraph.className = 'received-text';
      paragraph.textContent = message.text;
      $('received-content').replaceChildren(paragraph);
      $('received-card').hidden = false;
      $('received-card').scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'nearest'
      });
      try {
        const latest = (await ref.once('value')).val();
        if (latest && latest.claimId === message.claimId) await ref.remove();
        showFeedback('receive-feedback', 'Message retrieved. The app has removed the database record.', 'success');
      } catch (deleteError) {
        console.error('Message displayed but deletion failed:', deleteError);
        showFeedback('receive-feedback', 'Message retrieved, but Firebase did not confirm deletion. Check your database rules.', 'error');
      }
      $('receive-code').value = '';
    } catch (error) {
      console.error('Could not receive message:', error);
      showFeedback('receive-feedback', 'Could not retrieve this message. Check Firebase Realtime Database rules and connection.', 'error');
    } finally {
      state.receiving = false;
      setBusy('receive-button', 'receive-button-label', false, 'Checking code…', 'Receive message');
    }
  }
  $('receive-button').addEventListener('click', receiveMessage);

  $('copy-code').addEventListener('click', async () => {
    const code = $('created-code').textContent;
    try {
      await navigator.clipboard.writeText(code);
      showFeedback('send-feedback', 'Code copied to clipboard.', 'success');
    } catch (_) {
      showFeedback('send-feedback', 'Copy is unavailable here. Select the code and copy it manually.', 'error');
    }
  });
  $('copy-message').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(state.receivedText);
      showFeedback('receive-feedback', 'Message copied to clipboard.', 'success');
    } catch (_) {
      showFeedback('receive-feedback', 'Copy is unavailable here. Select the message and copy it manually.', 'error');
    }
  });

  initializeFirebase();
})();