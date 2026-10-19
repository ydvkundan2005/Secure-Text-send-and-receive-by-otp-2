(() => {
  'use strict';

  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyCOUouIbobBZvpubFuIf2Rb84k-4qkKmjU',
    authDomain: 'textsendreceive.firebaseapp.com',
    databaseURL: 'https://textsendreceive-default-rtdb.firebaseio.com',
    projectId: 'textsendreceive',
    storageBucket: 'textsendreceive.appspot.com',
    messagingSenderId: '180810658410',
    appId: '1:180810658410:web:e056ed0b811b8c604e5013'
  };

  const MAX_TEXT_LENGTH = 8000;
  const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
  const AUDIO_LIMIT_SECONDS = 120;
  const VIDEO_LIMIT_SECONDS = 45;
  const MESSAGE_TTL_MS = 24 * 60 * 60 * 1000;
  const CLAIM_TTL_MS = 2 * 60 * 1000;

  const el = (id) => document.getElementById(id);
  const state = {
    mode: 'text', recorder: null, stream: null, chunks: [], mediaBlob: null,
    mediaMime: '', mediaExt: 'webm', previewUrl: '', receivedUrl: '',
    timerId: null, seconds: 0, sending: false, receiving: false,
    authAvailable: false, firebaseReady: false
  };

  const tabs = [...document.querySelectorAll('[data-tab]')];
  const typeOptions = [...document.querySelectorAll('[data-mode]')];

  function showFeedback(target, message, type) {
    target.textContent = message;
    target.dataset.state = type || 'info';
    target.hidden = !message;
  }

  function setConnection(message, status) {
    const node = el('connection-status');
    node.querySelector('span').textContent = message;
    node.dataset.state = status || 'info';
  }

  function setBusy(button, busy, label, text) {
    button.disabled = busy;
    const span = el(label);
    if (!span.dataset.initialLabel) span.dataset.initialLabel = span.textContent;
    span.textContent = busy ? (text || 'Working…') : span.dataset.initialLabel;
  }

  function activateTab(name) {
    const isSend = name === 'send';
    tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    el('panel-send').hidden = !isSend;
    el('panel-receive').hidden = isSend;
    el('code-result').hidden = true;
    el('received-card').hidden = true;
    el('send-feedback').hidden = true;
    el('receive-feedback').hidden = true;
    if (window.matchMedia('(max-width:720px)').matches) {
      el(isSend ? 'panel-send' : 'panel-receive').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => activateTab(tab.dataset.tab)));
  tabs.forEach((tab, index) => tab.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    activateTab(next.dataset.tab);
  }));

  function setMode(mode) {
    if (state.recorder && state.recorder.state === 'recording') stopRecording();
    clearPreview();
    state.mode = mode;
    typeOptions.forEach((button) => {
      const selected = button.dataset.mode === mode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    el('text-composer').hidden = mode !== 'text';
    el('media-composer').hidden = mode === 'text';
    el('send-button-label').textContent = mode === 'text' ? 'Create one-time code' : 'Share recorded note';
    el('recorder-art').hidden = false;
    el('live-video').hidden = true;
    el('audio-preview').hidden = true;
    el('video-preview').hidden = true;
    el('discard-recording').hidden = true;
    el('record-button').hidden = false;
    el('record-button-label').textContent = 'Start recording';
    el('recording-time').innerHTML = '00:00 <span>/ ' + formatTime(mode === 'audio' ? AUDIO_LIMIT_SECONDS : VIDEO_LIMIT_SECONDS) + '</span>';
    el('recorder-message').textContent = mode === 'audio' ? 'A quiet moment, captured.' : 'A short video, just for them.';
    el('recorder-hint').textContent = mode === 'audio' ? 'Your browser will ask for microphone permission.' : 'Your browser will ask for camera and microphone permission.';
    el('send-feedback').hidden = true;
  }
  typeOptions.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));

  el('message-text').addEventListener('input', () => {
    el('character-count').textContent = el('message-text').value.length.toLocaleString() + ' / ' + MAX_TEXT_LENGTH.toLocaleString();
  });

  el('receive-code').addEventListener('input', (event) => {
    event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
  });
  el('receive-code').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') el('receive-button').click();
  });

  function randomCode() {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return String(1000 + (bytes[0] % 9000));
  }

  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
  }

  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return mins + ':' + secs;
  }

  function fileExtension(mime) {
    if (mime.includes('mp4')) return 'mp4';
    if (mime.includes('ogg')) return 'ogg';
    if (mime.includes('mpeg')) return 'mp3';
    return 'webm';
  }

  function supportedMime(mode) {
    const choices = mode === 'audio'
      ? ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']
      : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm'];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    return choices.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
  }

  function stopStream() {
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }
    const live = el('live-video');
    live.srcObject = null;
    live.hidden = true;
  }

  function clearPreview() {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = '';
    state.mediaBlob = null;
    state.mediaMime = '';
    state.mediaExt = 'webm';
    el('audio-preview').pause();
    el('audio-preview').removeAttribute('src');
    el('video-preview').pause();
    el('video-preview').removeAttribute('src');
    el('audio-preview').load();
    el('video-preview').load();
    el('audio-preview').hidden = true;
    el('video-preview').hidden = true;
    el('discard-recording').hidden = true;
    el('recorder-art').hidden = false;
    el('recorder-message').hidden = false;
    el('record-button').hidden = false;
    el('record-button-label').textContent = 'Start recording';
    el('record-button').dataset.recording = 'false';
    el('recording-time').textContent = '00:00';
  }

  function cleanRecordingUI() {
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = null;
    stopStream();
    el('record-button').disabled = false;
    el('record-button').dataset.recording = 'false';
    el('record-button-label').textContent = 'Record again';
    el('discard-recording').hidden = !state.mediaBlob;
    el('recorder-art').hidden = Boolean(state.mediaBlob);
    el('recorder-message').hidden = Boolean(state.mediaBlob);
    el('recording-time').innerHTML = formatTime(state.seconds) + ' <span>/ ' + formatTime(state.mode === 'audio' ? AUDIO_LIMIT_SECONDS : VIDEO_LIMIT_SECONDS) + '</span>';
  }

  async function startRecording() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      showFeedback(el('send-feedback'), 'This browser cannot record media here. Open the site over HTTPS and try a recent version of Safari, Chrome, or Firefox.', 'error');
      return;
    }
    clearPreview();
    state.seconds = 0;
    state.chunks = [];
    const isVideo = state.mode === 'video';
    try {
      state.stream = await navigator.mediaDevices.getUserMedia(isVideo
        ? { video: { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 540 } }, audio: true }
        : { audio: { echoCancellation: true, noiseSuppression: true } });

      const liveVideo = el('live-video');
      if (isVideo) {
        liveVideo.srcObject = state.stream;
        liveVideo.hidden = false;
        el('recorder-art').hidden = true;
        el('recorder-message').hidden = true;
        await liveVideo.play().catch(() => {});
      }

      const mime = supportedMime(state.mode);
      state.recorder = new MediaRecorder(state.stream, mime ? { mimeType: mime } : undefined);
      state.mediaMime = state.recorder.mimeType || mime || (isVideo ? 'video/webm' : 'audio/webm');
      state.recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) state.chunks.push(event.data);
      };
      state.recorder.onerror = () => {
        showFeedback(el('send-feedback'), 'Recording stopped unexpectedly. Please try again.', 'error');
        stopRecording();
      };
      state.recorder.onstop = () => {
        if (state.chunks.length) {
          state.mediaBlob = new Blob(state.chunks, { type: state.mediaMime });
          state.mediaExt = fileExtension(state.mediaBlob.type || state.mediaMime);
          if (state.mediaBlob.size > MAX_MEDIA_BYTES) {
            clearPreview();
            showFeedback(el('send-feedback'), 'This recording is larger than 20 MB. Please record a shorter note.', 'error');
          } else if (state.mediaBlob.size === 0) {
            clearPreview();
            showFeedback(el('send-feedback'), 'The recording was empty. Please try again.', 'error');
          } else {
            state.previewUrl = URL.createObjectURL(state.mediaBlob);
            el('recorder-art').hidden = true;
            el('recorder-message').hidden = true;
            const player = isVideo ? el('video-preview') : el('audio-preview');
            player.src = state.previewUrl;
            player.hidden = false;
            if (isVideo) player.load();
          }
        }
        cleanRecordingUI();
      };
      state.recorder.start(1000);
      el('record-button').dataset.recording = 'true';
      el('record-button-label').textContent = 'Stop recording';
      el('discard-recording').hidden = true;
      el('recorder-hint').textContent = 'Recording on this device. Stop when you are ready.';
      state.timerId = window.setInterval(() => {
        state.seconds += 1;
        const limit = isVideo ? VIDEO_LIMIT_SECONDS : AUDIO_LIMIT_SECONDS;
        el('recording-time').innerHTML = formatTime(state.seconds) + ' <span>/ ' + formatTime(limit) + '</span>';
        if (state.seconds >= limit || (state.mediaBlob && state.mediaBlob.size > MAX_MEDIA_BYTES)) stopRecording();
      }, 1000);
    } catch (error) {
      stopStream();
      showFeedback(el('send-feedback'), friendlyError(error, 'Could not access your microphone or camera.'), 'error');
    }
  }

  function stopRecording() {
    if (state.timerId) window.clearInterval(state.timerId);
    state.timerId = null;
    if (state.recorder && state.recorder.state !== 'inactive') {
      try { state.recorder.stop(); } catch (_) { cleanRecordingUI(); }
    } else {
      cleanRecordingUI();
    }
  }

  el('record-button').addEventListener('click', () => {
    if (state.recorder && state.recorder.state === 'recording') stopRecording();
    else startRecording();
  });
  el('discard-recording').addEventListener('click', () => {
    stopStream();
    clearPreview();
    state.seconds = 0;
    el('recording-time').innerHTML = '00:00 <span>/ ' + formatTime(state.mode === 'audio' ? AUDIO_LIMIT_SECONDS : VIDEO_LIMIT_SECONDS) + '</span>';
    el('recorder-hint').textContent = 'Recording discarded. You can make a new one.';
  });

  function friendlyError(error, fallback) {
    const code = error && (error.code || error.name);
    if (code === 'permission-denied' || code === 'storage/unauthorized' || code === 'PERMISSION_DENIED') {
      return 'Firebase denied this action. Check your Realtime Database and Storage security rules in the Firebase Console.';
    }
    if (code === 'storage/unknown' || code === 'storage/bucket-not-found' || code === 'storage/project-not-found') {
      return 'Firebase Storage may not be enabled for this project yet. Enable the existing project’s Storage bucket, then try again.';
    }
    if (code === 'storage/quota-exceeded') return 'The Firebase Storage quota has been reached.';
    if (code === 'storage/canceled') return 'The upload was cancelled.';
    if (code === 'auth/operation-not-allowed') return 'Anonymous sign-in is not enabled in Firebase Authentication. Enable it or adjust the database rules to match your existing setup.';
    if (code === 'NotAllowedError') return 'Camera or microphone permission was not granted.';
    if (code === 'NotFoundError') return 'A camera or microphone was not found on this device.';
    if (code === 'NotReadableError') return 'The camera or microphone is already being used by another app.';
    if (code === 'QuotaExceededError') return 'Browser storage or device resources are unavailable.';
    return fallback || (error && error.message) || 'Something went wrong. Please try again.';
  }

  async function initializeFirebase() {
    if (!window.firebase) {
      setConnection('Firebase unavailable', 'error');
      showFeedback(el('send-feedback'), 'Firebase did not load. Check your internet connection and reload the page.', 'error');
      el('send-button').disabled = true;
      el('receive-button').disabled = true;
      return;
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      state.db = firebase.database();
      state.storage = firebase.storage();
      state.firebaseReady = true;
      setConnection('Connecting to Firebase', 'info');
      try {
        await firebase.auth().signInAnonymously();
        state.authAvailable = true;
        setConnection('Connected', 'ready');
      } catch (authError) {
        // The original application used unauthenticated Firebase access. Keep that deployment
        // compatible while surfacing the configuration limitation in the app's security notes.
        console.warn('Anonymous Firebase sign-in was unavailable:', authError);
        setConnection('Service ready', 'ready');
      }
    } catch (error) {
      setConnection('Connection issue', 'error');
      showFeedback(el('send-feedback'), friendlyError(error, 'Could not initialize Firebase.'), 'error');
      showFeedback(el('receive-feedback'), friendlyError(error, 'Could not initialize Firebase.'), 'error');
      el('send-button').disabled = true;
      el('receive-button').disabled = true;
    }
  }

  async function reserveCode(draft) {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const code = randomCode();
      const ref = state.db.ref('messages/' + code);
      const result = await ref.transaction((existing) => existing === null ? draft : undefined, undefined, false);
      if (result.committed) return { code, ref };
    }
    throw new Error('Could not find an unused code. Please try again.');
  }

  async function uploadMediaForCode(code, blob, mode) {
    const path = 'message-media/' + code + '/' + randomId() + '.' + state.mediaExt;
    const ref = state.storage.ref(path);
    const task = ref.put(blob, {
      contentType: blob.type || (mode === 'video' ? 'video/webm' : 'audio/webm'),
      cacheControl: 'private, max-age=0, no-store',
      customMetadata: { messageType: mode, oneTime: 'true' }
    });
    await new Promise((resolve, reject) => {
      task.on('state_changed', (snapshot) => {
        const percent = Math.round((snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) * 100);
        el('send-button-label').textContent = 'Uploading ' + percent + '%';
      }, reject, resolve);
    });
    return { storagePath: path, contentType: blob.type || (mode === 'video' ? 'video/webm' : 'audio/webm'), sizeBytes: blob.size };
  }

  async function sendMessage() {
    if (!state.firebaseReady || state.sending) return;
    let text = '';
    let blob = null;
    const mode = state.mode;

    if (mode === 'text') {
      text = el('message-text').value.trim();
      if (!text) {
        showFeedback(el('send-feedback'), 'Write a message before creating a code.', 'error');
        el('message-text').focus();
        return;
      }
      if (text.length > MAX_TEXT_LENGTH) {
        showFeedback(el('send-feedback'), 'Messages can be up to 8,000 characters.', 'error');
        return;
      }
    } else {
      blob = state.mediaBlob;
      if (!blob) {
        showFeedback(el('send-feedback'), 'Record and preview your note before sharing it.', 'error');
        return;
      }
      if (blob.size > MAX_MEDIA_BYTES) {
        showFeedback(el('send-feedback'), 'Media notes must be 20 MB or smaller.', 'error');
        return;
      }
    }

    state.sending = true;
    setBusy(el('send-button'), true, 'send-button-label', 'Preparing…');
    el('code-result').hidden = true;
    showFeedback(el('send-feedback'), mode === 'text' ? 'Creating a one-time code…' : 'Preparing your note for upload…', 'info');
    let reservation = null;
    let storagePath = null;

    try {
      const now = Date.now();
      const draft = {
        schemaVersion: 2,
        type: mode,
        status: mode === 'text' ? 'ready' : 'uploading',
        createdAt: now,
        expiresAt: now + MESSAGE_TTL_MS
      };
      if (mode === 'text') draft.text = text;
      reservation = await reserveCode(draft);

      if (mode !== 'text') {
        const uploaded = await uploadMediaForCode(reservation.code, blob, mode);
        storagePath = uploaded.storagePath;
        await reservation.ref.update({
          status: 'ready',
          storagePath: uploaded.storagePath,
          contentType: uploaded.contentType,
          sizeBytes: uploaded.sizeBytes,
          durationSeconds: state.seconds
        });
      }

      el('created-code').textContent = reservation.code;
      el('code-result').hidden = false;
      el('code-result').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
      showFeedback(el('send-feedback'), 'Your message is ready. Share the code with your recipient.', 'success');
      if (mode === 'text') el('message-text').value = '';
      el('character-count').textContent = '0 / ' + MAX_TEXT_LENGTH.toLocaleString();
      clearPreview();
    } catch (error) {
      console.error('Send failed:', error);
      if (storagePath) state.storage.ref(storagePath).delete().catch(() => {});
      if (reservation && reservation.ref) reservation.ref.remove().catch(() => {});
      showFeedback(el('send-feedback'), friendlyError(error, 'The message could not be saved. Check Firebase permissions and try again.'), 'error');
    } finally {
      state.sending = false;
      setBusy(el('send-button'), false, 'send-button-label');
      el('send-button-label').textContent = state.mode === 'text' ? 'Create one-time code' : 'Share recorded note';
    }
  }
  el('send-button').addEventListener('click', sendMessage);

  async function claimMessage(ref) {
    const claimId = randomId();
    const now = Date.now();
    const result = await ref.transaction((current) => {
      if (!current) return;
      const status = current.status || 'ready'; // Support messages created by the original version.
      if (status === 'uploading') return;
      if (status === 'claimed' && now - Number(current.claimedAt || 0) < CLAIM_TTL_MS) return;
      if (status !== 'ready' && status !== 'claimed') return;
      return Object.assign({}, current, { status: 'claimed', claimId, claimedAt: now });
    }, undefined, false);
    if (!result.committed || !result.snapshot.exists() || result.snapshot.val().claimId !== claimId) return null;
    return result.snapshot.val();
  }

  async function loadMedia(message) {
    if (!message.storagePath) throw new Error('This media message has no storage file attached.');
    const fileRef = state.storage.ref(message.storagePath);
    const url = await fileRef.getDownloadURL();
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not download the recorded note.');
    const blob = await response.blob();
    if (!blob.size) throw new Error('The recorded note was empty.');
    const localUrl = URL.createObjectURL(blob);
    return { blob, localUrl, fileRef };
  }

  function clearReceivedContent() {
    if (state.receivedUrl) URL.revokeObjectURL(state.receivedUrl);
    state.receivedUrl = '';
    el('received-content').replaceChildren();
    el('copy-message').hidden = true;
    el('download-media').hidden = true;
    el('received-card').hidden = true;
  }

  function renderTextMessage(text) {
    const content = el('received-content');
    const paragraph = document.createElement('p');
    paragraph.className = 'received-text';
    paragraph.textContent = text;
    content.replaceChildren(paragraph);
    el('received-heading').textContent = 'A note for you.';
    el('received-type').textContent = 'TEXT';
    el('copy-message').hidden = false;
    el('download-media').hidden = true;
    el('copy-message').onclick = async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const temporary = document.createElement('textarea');
        temporary.value = text;
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        document.body.appendChild(temporary);
        temporary.select();
        const ok = document.execCommand('copy');
        temporary.remove();
        if (!ok) {
          showFeedback(el('receive-feedback'), 'Clipboard access was blocked. Select the message and copy it manually.', 'error');
          return;
        }
      }
      showFeedback(el('receive-feedback'), 'Text copied to clipboard.', 'success');
    };
  }

  function renderMediaMessage(message, media) {
    const content = el('received-content');
    const type = message.type === 'video' ? 'video' : 'audio';
    const player = document.createElement(type);
    player.controls = true;
    player.playsInline = true;
    player.preload = 'metadata';
    player.src = media.localUrl;
    player.setAttribute('aria-label', type === 'video' ? 'Received video note' : 'Received voice note');
    content.replaceChildren(player);
    el('received-heading').textContent = type === 'video' ? 'A video note for you.' : 'A voice note for you.';
    el('received-type').textContent = type === 'video' ? 'VIDEO NOTE' : 'VOICE NOTE';
    el('copy-message').hidden = true;
    el('download-media').hidden = false;
    el('download-media').onclick = () => {
      const anchor = document.createElement('a');
      anchor.href = media.localUrl;
      anchor.download = 'quiets-end-note.' + fileExtension(media.blob.type || message.contentType || type + '/webm');
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    };
    player.load();
  }

  async function removeCloudMessage(ref, message, media) {
    const jobs = [];
    if (message.storagePath) {
      jobs.push(state.storage.ref(message.storagePath).delete().catch((error) => {
        if (error.code !== 'storage/object-not-found') throw error;
      }));
    }
    jobs.push(ref.remove());
    const results = await Promise.allSettled(jobs);
    const failed = results.some((result) => result.status === 'rejected');
    if (media && media.localUrl) state.receivedUrl = media.localUrl;
    return !failed;
  }

  async function receiveMessage() {
    if (!state.firebaseReady || state.receiving) return;
    const code = el('receive-code').value.trim();
    if (!/^\d{4}$/.test(code)) {
      showFeedback(el('receive-feedback'), 'Enter all four digits of the code.', 'error');
      el('receive-code').focus();
      return;
    }

    state.receiving = true;
    setBusy(el('receive-button'), true, 'receive-button-label', 'Looking…');
    clearReceivedContent();
    showFeedback(el('receive-feedback'), 'Looking for your message…', 'info');
    let ref = state.db.ref('messages/' + code);
    let message = null;
    let media = null;

    try {
      message = await claimMessage(ref);
      if (!message) {
        const snapshot = await ref.get();
        if (!snapshot.exists()) throw new Error('No message is available for this code. It may have been received already or removed.');
        const current = snapshot.val();
        if (current.status === 'uploading') throw new Error('This note is still uploading. Wait a moment, then try again.');
        if (current.status === 'claimed') throw new Error('Someone is receiving this message right now. Please wait a minute and try again.');
        throw new Error('This message is unavailable. Check the code or ask the sender to create a new one.');
      }

      const createdAt = Number(message.createdAt || message.timestamp || 0);
      const expiresAt = Number(message.expiresAt || (createdAt ? createdAt + MESSAGE_TTL_MS : 0));
      if (expiresAt && Date.now() > expiresAt) {
        await ref.remove().catch(() => {});
        if (message.storagePath) await state.storage.ref(message.storagePath).delete().catch(() => {});
        throw new Error('This code has expired. Ask the sender to create a new message.');
      }

      if (message.type === 'audio' || message.type === 'video') {
        media = await loadMedia(message);
        renderMediaMessage(message, media);
      } else if (typeof message.text === 'string') {
        renderTextMessage(message.text);
      } else {
        throw new Error('The message format is not supported.');
      }

      el('received-card').hidden = false;
      const removed = await removeCloudMessage(ref, message, media);
      if (removed) {
        showFeedback(el('receive-feedback'), 'Message retrieved. Its cloud copy has been removed.', 'success');
      } else {
        showFeedback(el('receive-feedback'), 'The message is open, but cloud deletion could not be confirmed. Check your Firebase permissions.', 'error');
      }
      el('received-card').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    } catch (error) {
      console.error('Receive failed:', error);
      if (message && message.claimId) {
        ref.update({ status: 'ready', claimId: null, claimedAt: null }).catch(() => {});
      }
      if (media && media.localUrl && !state.receivedUrl) URL.revokeObjectURL(media.localUrl);
      showFeedback(el('receive-feedback'), friendlyError(error, 'Could not receive this message. Check your code and internet connection.'), 'error');
    } finally {
      state.receiving = false;
      setBusy(el('receive-button'), false, 'receive-button-label');
    }
  }
  el('receive-button').addEventListener('click', receiveMessage);

  el('copy-code').addEventListener('click', async () => {
    const code = el('created-code').textContent;
    try {
      await navigator.clipboard.writeText(code);
      showFeedback(el('send-feedback'), 'Code copied. Share it with your recipient.', 'success');
    } catch (_) {
      const input = document.createElement('textarea');
      input.value = code;
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const success = document.execCommand('copy');
      input.remove();
      showFeedback(el('send-feedback'), success ? 'Code copied. Share it with your recipient.' : 'Copy was blocked. Select the four-digit code and copy it manually.', success ? 'success' : 'error');
    }
  });

  window.addEventListener('pagehide', () => {
    stopStream();
    if (state.timerId) window.clearInterval(state.timerId);
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    if (state.receivedUrl) URL.revokeObjectURL(state.receivedUrl);
  });

  el('year').textContent = String(new Date().getFullYear());
  setMode('text');
  initializeFirebase();
})();
