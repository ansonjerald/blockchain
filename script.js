/* ============ Configuration ============ */
/* Put your Firebase config here or set to null to skip cloud upload */
const FIREBASE_CONFIG = null;
/* Example:
const FIREBASE_CONFIG = {
  apiKey: "xxx",
  authDomain: "xxx.firebaseapp.com",
  projectId: "xxx",
  storageBucket: "xxx.appspot.com",
  messagingSenderId: "xxx",
  appId: "xxx"
};
*/

/* ======================================= */

/* Basic DOM refs */
const videoEl = document.getElementById('videoPreview');
const sosBtn = document.getElementById('sosButton');
const previewBtn = document.getElementById('previewBtn');
const stopPreviewBtn = document.getElementById('stopPreviewBtn');
const statusPill = document.getElementById('statusPill');
const recOverlay = document.getElementById('recordOverlay');
const recTimer = document.getElementById('recTimer');

const locText = document.getElementById('locText');
const videoUrlEl = document.getElementById('videoUrl');
const micText = document.getElementById('micText');

const mapEl = document.getElementById('map');
const shareLocationBtn = document.getElementById('shareLocation');
const centerBtn = document.getElementById('centerBtn');

const triggerModeSel = document.getElementById('triggerMode');
const multiRow = document.getElementById('multiRow');
const longRow = document.getElementById('longRow');
const voiceRow = document.getElementById('voiceRow');
const multiCount = document.getElementById('multiCount');
const longMs = document.getElementById('longMs');
const voiceKeyword = document.getElementById('voiceKeyword');
const saveSettings = document.getElementById('saveSettings');
const simulateGuardianBtn = document.getElementById('simulateGuardian');
const guardianListEl = document.getElementById('guardianList');

const silentModeCheck = document.getElementById('silentMode');
const autoUploadCheck = document.getElementById('autoUpload');
const downloadLast = document.getElementById('downloadLast');
const clearLogs = document.getElementById('clearLogs');

const toast = document.getElementById('toast');

/* App state */
let mediaStream = null;
let mediaRecorder = null;
let recordedBlobs = [];
let recordingStart = null;
let recTimerInterval = null;
let lastRecordingBlob = null;
let lastRecordingUrl = null;

let currentPosition = { lat: 12.9716, lng: 77.5946 }; // fallback
let map, userMarker;
let guardians = []; // simulated guardians array

let triggerState = {
  mode: 'single',
  multiN: 3,
  longMs: 1500,
  voiceKeyword: 'help me',
  autoUpload: true,
  silent: false
};

/* Firebase init(Optional) */
let firebaseApp=null, storage=null, firestore=null;
if (FIREBASE_CONFIG) {
  firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
  storage = firebase.storage();
  firestore = firebase.firestore();
  console.log('Firebase initialized');
} else {
  console.log('Firebase disabled (FIREBASE_CONFIG is null)');
}

/* ============ Utilities ============ */
function showToast(msg, ms = 3000) {
  toast.hidden = false;
  toast.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> toast.hidden = true, ms);
}

/* ============ Media (camera/mic) ============ */
async function startPreview() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
    videoEl.srcObject = mediaStream;
    micText.textContent = 'Active';
    statusPill.textContent = 'Previewing';
  } catch (e) {
    console.error(e);
    showToast('Camera/Mic permission denied');
    micText.textContent = 'Permission denied';
    statusPill.textContent = 'Idle';
  }
}

function stopPreview() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  videoEl.srcObject = null;
  statusPill.textContent = 'Idle';
  micText.textContent = '—';
}

/* ============ Recording ============ */
function startRecording() {
  recordedBlobs = [];
  const options = { mimeType: 'video/webm;codecs=vp9,opus' };
  try {
    mediaRecorder = new MediaRecorder(mediaStream, options);
  } catch (e) {
    console.warn('MediaRecorder error', e);
    mediaRecorder = new MediaRecorder(mediaStream);
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedBlobs.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    clearInterval(recTimerInterval);
    recOverlay.hidden = true;
    const blob = new Blob(recordedBlobs, { type: 'video/webm' });
    lastRecordingBlob = blob;
    lastRecordingUrl = URL.createObjectURL(blob);
    showToast('Recording saved');

    // Auto upload if enabled
    if (triggerState.autoUpload && FIREBASE_CONFIG && storage) {
      await uploadRecording(blob);
    } else if (triggerState.autoUpload && !FIREBASE_CONFIG) {
      showToast('Auto-upload skipped (no Firebase config)');
    }
  };

  mediaRecorder.start(1000);
  recordingStart = Date.now();
  recOverlay.hidden = false;
  recTimer.textContent = '00:00';
  recTimerInterval = setInterval(() => {
    const diff = Math.floor((Date.now() - recordingStart) / 1000);
    recTimer.textContent = new Date(diff * 1000).toISOString().substr(14, 5);
  }, 500);
  statusPill.textContent = 'Recording';
  showToast('Recording started');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    statusPill.textContent = 'Idle';
  }
}

/* ============ Upload to Firebase ============ */
async function uploadRecording(blob) {
  try {
    const fileName = `evidence_${Date.now()}.webm`;
    const ref = storage.ref().child('evidence').child(fileName);
    const task = await ref.put(blob);
    const url = await ref.getDownloadURL();

    // write metadata to firestore
    const meta = {
      video_url: url,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      location: currentPosition
    };
    await firestore.collection('evidence').add(meta);

    videoUrlEl.textContent = url;
    showToast('Uploaded to cloud');
    return url;
  } catch (e) {
    console.error('Upload failed', e);
    showToast('Upload failed');
  }
}

/* ============ Location & Map ============ */
function initMap() {
  map = new google.maps.Map(mapEl, {
    center: currentPosition,
    zoom: 15,
    disableDefaultUI: true,
    styles: [ /* subtle map style for dark UI */ ]
  });

  userMarker = new google.maps.Marker({ map, position: currentPosition, title: 'You' });
}

function updateUserMarker(lat, lng) {
  currentPosition = { lat, lng };
  if (!map) initMap();
  userMarker.setPosition(currentPosition);
  map.panTo(currentPosition);
  locText.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function centerMap() {
  if (map) map.panTo(currentPosition);
}

async function acquireLocation() {
  if (!navigator.geolocation) {
    showToast('Geolocation not supported');
    return;
  }
  navigator.geolocation.getCurrentPosition((pos) => {
    updateUserMarker(pos.coords.latitude, pos.coords.longitude);
  }, (err) => {
    console.warn('geo err', err);
    showToast('Location denied or unavailable');
  }, { enableHighAccuracy: true });
}

/* ============ Guardian simulation ============ */
function generateGuardiansNearby() {
  // Create 3 simulated guardians near user
  const arr = [];
  for (let i=0;i<3;i++){
    const lat = currentPosition.lat + (Math.random()-0.5)*0.008;
    const lng = currentPosition.lng + (Math.random()-0.5)*0.008;
    arr.push({ id: 'g'+i, name: `Guardian ${i+1}`, lat, lng, distance: Math.round(Math.random()*500+50) });
  }
  guardians = arr;
  renderGuardians();
}

function renderGuardians() {
  guardianListEl.innerHTML = '';
  if (!guardians.length) { guardianListEl.innerHTML = '<li class="muted">No guardians nearby</li>'; return; }
  guardians.forEach(g => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${g.name} • ${g.distance}m</span><button data-id="${g.id}">Navigate</button>`;
    guardianListEl.appendChild(li);
    li.querySelector('button').addEventListener('click', ()=> {
      showToast(`Navigator opened to ${g.name} (simulated)`);
      // in a real app we'd show route
    });
  });

  // put markers on map
  if (map) {
    guardians.forEach(g => {
      new google.maps.Marker({ map, position: { lat: g.lat, lng: g.lng }, title: g.name, icon: { path: google.maps.SymbolPath.CIRCLE, scale:6, fillColor:'#fff', fillOpacity:1, strokeWeight:0 }});
    });
  }
}

/* Simulate notifying guardians (push-like UI) */
function notifyGuardians() {
  // Visual simulation: toast + animated guardian highlight
  showToast('Guardians notified (simulated)');
  // also add a "guardian coming" animation or mark first guardian as responding
  if (guardians[0]) {
    showToast(`${guardians[0].name} is responding`);
  }
}

/* ============ Trigger system ============ */
let clickCount = 0;
let clickTimer = null;
let holdTimer = null;
let lastTapTime = 0;

/* Save settings UI */
function applySettingsUI() {
  triggerState.mode = triggerModeSel.value;
  triggerState.multiN = parseInt(multiCount.value || 3);
  triggerState.longMs = parseInt(longMs.value || 1500);
  triggerState.voiceKeyword = (voiceKeyword.value || 'help me').toLowerCase();
  triggerState.autoUpload = autoUploadCheck.checked;
  triggerState.silent = silentModeCheck.checked;
  showToast('Settings applied');
}

/* UI: show/hide extra rows */
triggerModeSel.addEventListener('change', e => {
  const v = e.target.value;
  multiRow.style.display = v==='multi' ? 'block':'none';
  longRow.style.display = v==='long' ? 'block':'none';
  voiceRow.style.display = v==='voice' ? 'block':'none';
});

saveSettings.addEventListener('click', applySettingsUI);

/* Voice recognition trigger (Web Speech API) */
let recognition=null;
function startVoiceRecognition() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('SpeechRecognition not supported in this browser');
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.onresult = (ev) => {
    for (let i=ev.resultIndex;i<ev.results.length;i++){
      const text = ev.results[i][0].transcript.trim().toLowerCase();
      console.log('voice heard:', text);
      if (text.includes(triggerState.voiceKeyword)) {
        showToast('Voice keyword detected');
        handleSosTrigger();
      }
    }
  };
  recognition.onerror = (e) => { console.warn('rec err', e); }
  recognition.onend = () => { console.log('rec ended, restarting'); recognition.start(); }
  recognition.start();
}

/* Handle actual SOS event (common runner) */
async function handleSosTrigger() {
  applySettingsUI();
  // silent mode
  const silent = triggerState.silent;
  if (!silent) {
    // audible beep
    try { new Audio().play(); } catch(e){/* ignore */ }
  }
  // ensure preview & media
  if (!mediaStream) await startPreview();
  // start recording
  startRecording();
  // start location capture
  acquireLocation();
  // generate guardians
  generateGuardiansNearby();
  // notify guardians (simulate)
  setTimeout(()=> notifyGuardians(), 1200);

  // stop recording after 30s (demo)
  setTimeout(()=> { stopRecording(); }, 30000);
}

/* Wiring the button according to trigger mode */
sosBtn.addEventListener('click', (e) => {
  const mode = triggerModeSel.value;
  if (mode === 'single') {
    handleSosTrigger();
    return;
  }
  if (mode === 'double') {
    const now = Date.now();
    if (now - lastTapTime < 450) {
      handleSosTrigger();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
      showToast('Tap again quickly to trigger');
    }
    return;
  }
  if (mode === 'multi') {
    clickCount++;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(()=> clickCount=0, 1200);
    if (clickCount >= triggerState.multiN) {
      clickCount = 0;
      handleSosTrigger();
    } else {
      showToast(`Pressed ${clickCount}/${triggerState.multiN}`);
    }
    return;
  }
  if (mode === 'long') {
    // start hold detection in mousedown / touchstart events; handled below
    showToast('Hold the button to trigger (press and hold)');
    // nothing on click
  }
  if (mode === 'voice') {
    showToast('Voice mode active. Say the keyword.');
    // start recognition if not started
    if (!recognition) startVoiceRecognition();
  }
});

/* Long-press detection (mouse + touch) */
sosBtn.addEventListener('mousedown', (e)=> {
  if (triggerModeSel.value !== 'long') return;
  holdTimer = setTimeout(()=> {
    handleSosTrigger();
  }, triggerState.longMs);
});
sosBtn.addEventListener('touchstart', (e)=> {
  if (triggerModeSel.value !== 'long') return;
  holdTimer = setTimeout(()=> {
    handleSosTrigger();
  }, triggerState.longMs);
});
['mouseup','mouseleave','touchend','touchcancel'].forEach(ev => {
  sosBtn.addEventListener(ev, ()=> {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
  });
});

/* Preview/stop controls */
previewBtn.addEventListener('click', startPreview);
stopPreviewBtn.addEventListener('click', stopPreview);

/* Map actions */
shareLocationBtn.addEventListener('click', ()=> {
  // In a real app you'd send to backend & notify guardians/police
  showToast('Location shared (simulated): ' + locText.textContent);
});
centerBtn.addEventListener('click', centerMap);

/* Simulate guardians & notify */
simulateGuardianBtn.addEventListener('click', ()=> {
  generateGuardiansNearby();
  showToast('Guardians simulated');
});

/* Download last recording */
downloadLast.addEventListener('click', ()=> {
  if (!lastRecordingBlob) { showToast('No recording yet'); return; }
  const a = document.createElement('a');
  a.href = lastRecordingUrl;
  a.download = 'evidence.webm';
  a.click();
});

/* Clear logs */
clearLogs.addEventListener('click', ()=> {
  locText.textContent = '—';
  videoUrlEl.textContent = 'Not uploaded';
  micText.textContent = '—';
  guardianListEl.innerHTML = '';
  showToast('Cleared');
});

/* Initial setup */
(function init() {
  // populate guard list initially
  renderGuardians();

  // apply default trigger UI behavior
  triggerModeSel.dispatchEvent(new Event('change'));

  // try to acquire location and init map
  if (window.google && google.maps) {
    acquireLocation(); // will update currentPosition
    setTimeout(() => {
      initMap();
      updateUserMarker(currentPosition.lat, currentPosition.lng);
    }, 800);
  } else {
    console.warn('Google Maps not loaded (missing API key?)');
    document.getElementById('map').innerHTML = '<div style="padding:14px;color:rgba(255,255,255,0.7)">Map unavailable — add Google Maps API key in index.html</div>';
  }

  // attach silent toggle to triggerState
  silentModeCheck.addEventListener('change', ()=> {
    triggerState.silent = silentModeCheck.checked;
  });

  // when settings saved, update internal state
  saveSettings.addEventListener('click', ()=> {
    triggerState.mode = triggerModeSel.value;
    triggerState.multiN = parseInt(multiCount.value || 3);
    triggerState.longMs = parseInt(longMs.value || 1500);
    triggerState.voiceKeyword = (voiceKeyword.value || 'help me').toLowerCase();
    triggerState.autoUpload = autoUploadCheck.checked;
    triggerState.silent = silentModeCheck.checked;
  });
})();
