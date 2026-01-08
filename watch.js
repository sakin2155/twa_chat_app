// ===========================
// Firebase Imports
// ===========================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    collection,
    onSnapshot,
    serverTimestamp,
    addDoc,
    query,
    orderBy,
    limit,
    getDocs
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

// ===========================
// Firebase Configuration
// ===========================
const firebaseConfig = {
    apiKey: "AIzaSyCjU48-MYfwQLDPc7C04lcyROT6s5cLH-8",
    authDomain: "chat-f5b70.firebaseapp.com",
    projectId: "chat-f5b70",
    storageBucket: "chat-f5b70.firebasestorage.app",
    messagingSenderId: "158106000000",
    appId: "1:158106000000:web:6cd2c27cdd676d306da465",
    measurementId: "G-6H096XKK6S"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===========================
// Global State
// ===========================
let currentUser = null;
let currentUserData = null;
let roomId = null;
let chatId = null;
let watchDocRef = null;
let participantDocRef = null;
let participantsUnsub = null;
let playbackUnsub = null;
let liveChatUnsub = null;
let heartbeatInterval = null;
let sessionCleanedUp = false;
let sessionActive = true;
let player = null;
let playerReady = false;
let ignorePlayerEvents = false;
let pendingVideoId = null;
let currentPartyData = null;
let watchMessageId = null;
let lastPlaybackEventId = null;
let toastTimer = null;
let leaveModalVisible = false;

const params = new URLSearchParams(window.location.search);
roomId = params.get('roomId');
chatId = params.get('chatId');
const joinMode = params.get('mode') || 'guest';

// ===========================
// DOM Elements
// ===========================
const globalLoading = document.getElementById('global-loading');
const loadingText = globalLoading?.querySelector('.loading-text');
const watchContainer = document.getElementById('watch-container');
const backToChatBtn = document.getElementById('back-to-chat-btn');
const copyInviteBtn = document.getElementById('copy-invite-btn');
const endWatchBtn = document.getElementById('end-watch-btn');
const syncStatusEl = document.getElementById('sync-status');
const playToggleBtn = document.getElementById('play-toggle-btn');
const syncNowBtn = document.getElementById('sync-now-btn');
const participantsListEl = document.getElementById('participants-list');
const participantCountEl = document.getElementById('participant-count');
const activityLogEl = document.getElementById('activity-log');
const toastEl = document.getElementById('toast');
const sessionEndedEl = document.getElementById('session-ended');
const sessionEndedMessage = document.getElementById('session-ended-message');
const sessionBackBtn = document.getElementById('session-back-btn');
const loginModal = document.getElementById('login-modal');
const goToLoginBtn = document.getElementById('go-to-login-btn');
const headerTitle = document.getElementById('watch-video-title');
const hostLine = document.getElementById('watch-host-line');
const chatMessagesEl = document.getElementById('watch-chat-messages');
const chatEmptyState = document.getElementById('watch-chat-empty');
const chatForm = document.getElementById('watch-chat-form');
const chatInput = document.getElementById('watch-chat-input');
const chatSendBtn = document.getElementById('watch-chat-send-btn');
const leaveModal = document.getElementById('participant-leave-modal');
const leaveModalMessage = document.getElementById('participant-leave-message');
const leaveModalList = document.getElementById('participant-leave-list');
const leaveSessionBtn = document.getElementById('leave-session-btn');
const leaveModalTitle = document.getElementById('participant-leave-title');

// ===========================
// UI Helpers
// ===========================
function showLoading(message = 'Loading…') {
    if (loadingText) {
        loadingText.textContent = message;
    }
    globalLoading?.classList.remove('hidden');
}

function hideLoading() {
    globalLoading?.classList.add('hidden');
}

function showToast(message, duration = 2500) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
        toastEl.classList.add('hidden');
    }, duration);
}

function showSessionEnded(message) {
    sessionActive = false;
    if (sessionEndedMessage) {
        sessionEndedMessage.textContent = message;
    }
    hideParticipantLeaveModal();
    sessionEndedEl?.classList.remove('hidden');
}

function formatTime(date) {
    if (!(date instanceof Date)) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(unsafe = '') {
    return unsafe
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getInitials(name = '') {
    if (!name) return '?';
    return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase();
}

function renderParticipants(participants) {
    if (!participantsListEl) return;
    participantsListEl.innerHTML = '';
    participantCountEl.textContent = participants.length;

    const sorted = participants.slice().sort((a, b) => {
        if (a.role === 'host') return -1;
        if (b.role === 'host') return 1;
        return (a.displayName || '').localeCompare(b.displayName || '');
    });

    sorted.forEach((participant) => {
        const item = document.createElement('div');
        item.className = 'participant-item';

        const avatar = document.createElement('div');
        avatar.className = 'participant-avatar';
        if (participant.photoURL) {
            avatar.style.backgroundImage = `url('${participant.photoURL}')`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.color = 'transparent';
        } else {
            avatar.textContent = getInitials(participant.displayName || participant.email || '?');
        }

        const info = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'participant-name';
        nameEl.textContent = participant.displayName || participant.email || 'Guest';

        const roleEl = document.createElement('div');
        roleEl.className = 'participant-role';
        const lastSeenDate = participant.lastSeen?.toDate ? participant.lastSeen.toDate() : null;
        const lastSeenText = lastSeenDate ? ` • ${formatTime(lastSeenDate)}` : '';
        roleEl.textContent = `${participant.role === 'host' ? 'Host' : 'Viewer'}${lastSeenText}`;

        info.appendChild(nameEl);
        info.appendChild(roleEl);
        item.appendChild(avatar);
        item.appendChild(info);

        participantsListEl.appendChild(item);
    });
}

function addActivityEntry(message) {
    if (!activityLogEl) return;
    const entry = document.createElement('div');
    entry.className = 'activity-entry';
    entry.textContent = message;
    activityLogEl.prepend(entry);

    // Limit to 25 entries
    const entries = activityLogEl.querySelectorAll('.activity-entry');
    if (entries.length > 25) {
        entries[entries.length - 1].remove();
    }
}

function isChatNearBottom() {
    if (!chatMessagesEl) return true;
    const distanceFromBottom = chatMessagesEl.scrollHeight - (chatMessagesEl.scrollTop + chatMessagesEl.clientHeight);
    return distanceFromBottom <= 60;
}

function scrollChatToBottom() {
    if (!chatMessagesEl) return;
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
}

function createChatMessageElement(message) {
    const isOwn = message.senderId === currentUser?.uid;
    const wrapper = document.createElement('div');
    wrapper.className = `chat-message${isOwn ? ' own' : ''}`;

    const header = document.createElement('div');
    header.className = 'chat-message-header';

    const sender = document.createElement('span');
    sender.className = 'chat-sender';
    sender.textContent = isOwn ? 'You' : (message.senderName || 'Participant');

    const time = document.createElement('span');
    const timestampDate = message.timestamp?.toDate ? message.timestamp.toDate() : (message.timestamp instanceof Date ? message.timestamp : new Date());
    time.textContent = formatTime(timestampDate);

    header.appendChild(sender);
    header.appendChild(time);

    const body = document.createElement('div');
    body.className = 'chat-message-body';
    const safeText = escapeHtml(message.text || '');
    body.innerHTML = safeText.replace(/\n/g, '<br>');

    wrapper.appendChild(header);
    wrapper.appendChild(body);
    return wrapper;
}

function renderChatMessages(messages) {
    if (!chatMessagesEl) return;
    const shouldStick = isChatNearBottom();
    chatMessagesEl.innerHTML = '';
    messages.forEach((message) => {
        chatMessagesEl.appendChild(createChatMessageElement(message));
    });

    if (messages.length === 0) {
        chatEmptyState?.classList.remove('hidden');
    } else {
        chatEmptyState?.classList.add('hidden');
    }

    if (shouldStick) {
        scrollChatToBottom();
    }
}

function renderLeaveParticipantsList(participants) {
    if (!leaveModalList) return;
    leaveModalList.innerHTML = '';

    if (!participants.length) {
        const empty = document.createElement('div');
        empty.className = 'leave-participant-row';
        empty.textContent = 'No one else is connected.';
        leaveModalList.appendChild(empty);
        return;
    }

    participants.forEach((participant) => {
        const row = document.createElement('div');
        row.className = 'leave-participant-row';

        const name = document.createElement('div');
        name.className = 'leave-participant-name';
        name.textContent = participant.displayName || participant.email || 'Guest';

        const role = document.createElement('div');
        role.className = 'leave-participant-role';
        role.textContent = participant.role === 'host' ? 'Host' : 'Viewer';

        row.appendChild(name);
        row.appendChild(role);
        leaveModalList.appendChild(row);
    });
}

function showParticipantLeaveModal(triggerName, participants) {
    if (!leaveModal) return;
    if (leaveModalTitle) {
        leaveModalTitle.textContent = `${triggerName || 'A participant'} left the session`;
    }
    if (leaveModalMessage) {
        leaveModalMessage.textContent = 'You can leave as well or wait for the host to return.';
    }
    renderLeaveParticipantsList(participants);
    leaveModal.classList.remove('hidden');
    leaveModalVisible = true;
}

function hideParticipantLeaveModal() {
    if (!leaveModal) return;
    leaveModal.classList.add('hidden');
    leaveModalVisible = false;
}

async function markWatchMessageEnded() {
    if (!watchMessageId || !chatId) return;
    try {
        await updateDoc(doc(db, 'chats', chatId, 'messages', watchMessageId), {
            partyEnded: true
        });
    } catch (error) {
        console.warn('Unable to update watch party message:', error);
    }
}

function updatePartyMeta(data) {
    if (!data) return;
    headerTitle.textContent = data.videoTitle || 'Watch Party';
    hostLine.textContent = `Hosted by ${data.hostName || 'friend'}`;
    if (syncStatusEl) {
        const actionName = data.lastActionName || 'Someone';
        const status = data.isPlaying ? 'playing' : 'paused';
        syncStatusEl.textContent = `${actionName} ${status} • ${Math.round(data.currentTime || 0)}s`;
    }

    if (data.hostId === currentUser?.uid) {
        endWatchBtn?.classList.remove('hidden');
    } else {
        endWatchBtn?.classList.add('hidden');
    }
}

// ===========================
// Player Setup
// ===========================
function setupPlayer(videoId) {
    if (!videoId) return;
    pendingVideoId = videoId;

    const createPlayerInstance = () => {
        player = new YT.Player('youtube-player', {
            videoId: pendingVideoId,
            playerVars: {
                autoplay: 0,
                controls: 1,
                rel: 0,
                modestbranding: 1,
                playsinline: 1
            },
            events: {
                onReady: handlePlayerReady,
                onStateChange: handlePlayerStateChange
            }
        });
    };

    if (window.YT && window.YT.Player) {
        createPlayerInstance();
    } else {
        window.onYouTubeIframeAPIReady = () => {
            createPlayerInstance();
        };
    }
}

function handlePlayerReady() {
    playerReady = true;
    if (currentPartyData) {
        syncPlayerToState(currentPartyData, true);
    }
}

function handlePlayerStateChange(event) {
    if (!playerReady || !sessionActive || ignorePlayerEvents) return;

    if (event.data === YT.PlayerState.PLAYING) {
        updatePlaybackState(true);
    } else if (event.data === YT.PlayerState.PAUSED) {
        updatePlaybackState(false);
    }
}

function syncPlayerToState(data, forceSeek = false) {
    if (!playerReady || !player || !data) return;

    const desiredTime = Number(data.currentTime) || 0;
    const isPlaying = !!data.isPlaying;
    const currentTime = player.getCurrentTime ? player.getCurrentTime() : 0;
    const timeDiff = Math.abs(currentTime - desiredTime);
    const shouldSeek = forceSeek || timeDiff > 0.8;

    ignorePlayerEvents = true;

    if (shouldSeek) {
        player.seekTo(desiredTime, true);
    }

    const playerState = player.getPlayerState();
    if (isPlaying && playerState !== YT.PlayerState.PLAYING) {
        player.playVideo();
    } else if (!isPlaying && playerState === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    }

    setTimeout(() => {
        ignorePlayerEvents = false;
    }, 400);
}

async function updatePlaybackState(isPlaying) {
    if (!watchDocRef || !player || !playerReady) return;
    try {
        await updateDoc(watchDocRef, {
            isPlaying,
            currentTime: Number(player.getCurrentTime()) || 0,
            lastActionBy: currentUser.uid,
            lastActionName: currentUserData?.displayName || 'Participant',
            updatedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Failed to sync playback state:', error);
    }
}

// ===========================
// Firestore Listeners
// ===========================
function startPlaybackListener() {
    if (!roomId) return;
    watchDocRef = doc(db, 'watchParties', roomId);
    playbackUnsub = onSnapshot(watchDocRef, async (snapshot) => {
        if (!snapshot.exists()) {
            showSessionEnded('Watch party was removed.');
            cleanupParticipant();
            return;
        }

        const data = snapshot.data();
        currentPartyData = data;
        watchMessageId = data.messageId || null;
        updatePartyMeta(data);

        if (data.updatedAt?.seconds && data.updatedAt.seconds !== lastPlaybackEventId) {
            lastPlaybackEventId = data.updatedAt.seconds;
            const action = data.isPlaying ? 'started playing' : 'paused';
            addActivityEntry(`${data.lastActionName || 'Participant'} ${action} the video`);
        }

        if (data.isActive === false) {
            showSessionEnded('The host ended this watch party.');
            if (watchMessageId && chatId) {
                try {
                    await updateDoc(doc(db, 'chats', chatId, 'messages', watchMessageId), { partyEnded: true });
                } catch (error) {
                    console.warn('Unable to update watch party message:', error);
                }
            }
            cleanupParticipant();
            return;
        }

        syncPlayerToState(data);
    });
}

function startParticipantsListener() {
    const participantsRef = collection(db, 'watchParties', roomId, 'participants');
    participantsUnsub = onSnapshot(participantsRef, (snapshot) => {
        const participants = snapshot.docs.map(doc => doc.data());
        renderParticipants(participants);
        if (leaveModalVisible) {
            renderLeaveParticipantsList(participants);
        }

        const hostPresent = participants.some((participant) => participant.role === 'host');
        if (!hostPresent && participants.length > 0 && !leaveModalVisible) {
            showParticipantLeaveModal('The host', participants);
        } else if (hostPresent && leaveModalVisible) {
            hideParticipantLeaveModal();
        }

        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            if (change.type === 'added' && data.uid !== currentUser?.uid) {
                showToast(`${data.displayName || 'A friend'} joined the watch party`);
                addActivityEntry(`${data.displayName || 'A friend'} joined`);
            }
            if (change.type === 'removed' && data.uid !== currentUser?.uid) {
                showToast(`${data.displayName || 'A friend'} left the watch party`);
                addActivityEntry(`${data.displayName || 'A friend'} left`);
                showParticipantLeaveModal(data.displayName || 'A participant', participants);
            }
        });
    });
}

function startLiveChatListener() {
    if (!roomId || !chatMessagesEl) return;
    const liveChatRef = collection(db, 'watchParties', roomId, 'liveChat');
    const messagesQuery = query(liveChatRef, orderBy('timestamp', 'asc'), limit(200));
    liveChatUnsub = onSnapshot(messagesQuery, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderChatMessages(messages);
    });
}

async function sendChatMessage() {
    if (!chatInput || !chatInput.value.trim() || !roomId || !currentUser) return;
    const rawValue = chatInput.value;
    const messageText = rawValue.trim();
    chatSendBtn?.setAttribute('disabled', 'true');
    chatInput.value = '';
    autoResizeChatInput();
    scrollChatToBottom();
    try {
        await addDoc(collection(db, 'watchParties', roomId, 'liveChat'), {
            text: messageText,
            senderId: currentUser.uid,
            senderName: currentUserData?.displayName || currentUser.email || 'Participant',
            timestamp: serverTimestamp()
        });
    } catch (error) {
        chatInput.value = rawValue;
        autoResizeChatInput();
        console.error('Failed to send chat message:', error);
        showToast('Message failed to send');
    } finally {
        chatSendBtn?.removeAttribute('disabled');
    }
}

function autoResizeChatInput() {
    if (!chatInput) return;
    chatInput.style.height = 'auto';
    const height = Math.min(chatInput.scrollHeight, 120);
    chatInput.style.height = `${height}px`;
}

// ===========================
// Session Management
// ===========================
async function registerParticipant() {
    if (!currentUser || !roomId) return;

    const participantData = {
        uid: currentUser.uid,
        displayName: currentUserData?.displayName || currentUser.email || 'You',
        photoURL: currentUserData?.photoURL || '',
        role: currentPartyData?.hostId === currentUser.uid ? 'host' : 'guest',
        joinedAt: serverTimestamp(),
        lastSeen: serverTimestamp()
    };

    participantDocRef = doc(db, 'watchParties', roomId, 'participants', currentUser.uid);
    await setDoc(participantDocRef, participantData, { merge: true });

    heartbeatInterval = setInterval(async () => {
        try {
            await updateDoc(participantDocRef, { lastSeen: serverTimestamp() });
        } catch (error) {
            console.warn('Failed to update participant heartbeat:', error);
        }
    }, 5000);
}

async function cleanupParticipant() {
    if (sessionCleanedUp) return;
    sessionCleanedUp = true;

    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }

    if (participantsUnsub) participantsUnsub();
    if (playbackUnsub) playbackUnsub();
    if (liveChatUnsub) liveChatUnsub();

    if (participantDocRef) {
        try {
            await deleteDoc(participantDocRef);
            await expireSessionIfEmpty();
        } catch (error) {
            console.warn('Unable to remove participant record:', error);
        }
    }
}

async function expireSessionIfEmpty() {
    if (!roomId) return;
    try {
        const participantsSnapshot = await getDocs(collection(db, 'watchParties', roomId, 'participants'));
        if (participantsSnapshot.empty && watchDocRef) {
            await updateDoc(watchDocRef, {
                isActive: false,
                endedAt: serverTimestamp(),
                endedBy: currentUser?.uid || 'system'
            });
            await markWatchMessageEnded();
        }
    } catch (error) {
        console.warn('Unable to expire empty session:', error);
    }
}

async function endWatchParty() {
    if (!watchDocRef || !currentPartyData) return;
    try {
        await updateDoc(watchDocRef, {
            isActive: false,
            endedBy: currentUser.uid,
            endedAt: serverTimestamp()
        });
        await markWatchMessageEnded();
        showSessionEnded('You ended this watch party.');
        await cleanupParticipant();
    } catch (error) {
        console.error('Failed to end watch party:', error);
    }
}

async function handleLeaveParty() {
    try {
        if (currentPartyData?.hostId === currentUser?.uid) {
            await endWatchParty();
        } else {
            await cleanupParticipant();
        }
    } finally {
        window.location.href = 'index.html';
    }
}

// ===========================
// Event Listeners
// ===========================
backToChatBtn?.addEventListener('click', () => {
    handleLeaveParty();
});

copyInviteBtn?.addEventListener('click', async () => {
    const url = `${window.location.origin}/watch.html?roomId=${roomId}&mode=guest&chatId=${chatId || ''}`;
    try {
        await navigator.clipboard.writeText(url);
        showToast('Invite link copied');
    } catch (error) {
        console.warn('Clipboard unavailable:', error);
        showToast('Copy failed. Share the URL manually.');
    }
});

endWatchBtn?.addEventListener('click', () => {
    endWatchParty();
});

playToggleBtn?.addEventListener('click', () => {
    if (!player || !playerReady) return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
});

syncNowBtn?.addEventListener('click', () => {
    if (currentPartyData) {
        syncPlayerToState(currentPartyData, true);
        showToast('Synced to host');
    }
});

sessionBackBtn?.addEventListener('click', () => {
    handleLeaveParty();
});

goToLoginBtn?.addEventListener('click', () => {
    window.location.href = 'index.html';
});

leaveSessionBtn?.addEventListener('click', () => {
    handleLeaveParty();
});

chatForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    sendChatMessage();
});

chatInput?.addEventListener('input', autoResizeChatInput);

chatInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage();
    }
});

window.addEventListener('beforeunload', () => {
    cleanupParticipant();
});

// ===========================
// Authentication & Init
// ===========================
async function loadCurrentUserProfile(uid) {
    try {
        const snapshot = await getDoc(doc(db, 'users', uid));
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
        }
    } catch (error) {
        console.warn('Failed to load user profile:', error);
    }
}

async function initializeWatchParty() {
    if (!roomId) {
        showSessionEnded('Missing watch party room.');
        return;
    }

    showLoading('Connecting to watch party…');
    const docSnap = await getDoc(doc(db, 'watchParties', roomId));
    if (!docSnap.exists()) {
        hideLoading();
        showSessionEnded('Watch party not found.');
        return;
    }

    currentPartyData = docSnap.data();
    watchMessageId = currentPartyData.messageId || null;
    updatePartyMeta(currentPartyData);
    setupPlayer(currentPartyData.videoId);

    await registerParticipant();
    startPlaybackListener();
    startParticipantsListener();
    startLiveChatListener();

    hideLoading();
    watchContainer?.classList.remove('hidden');
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        loginModal?.classList.remove('hidden');
        hideLoading();
        return;
    }
    loginModal?.classList.add('hidden');
    currentUser = user;
    await loadCurrentUserProfile(user.uid);
    initializeWatchParty();
});



