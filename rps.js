// ===========================
// Firebase SDK Imports
// ===========================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    collection,
    addDoc,
    query,
    orderBy,
    serverTimestamp
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===========================
// Global State
// ===========================
let currentUser = null;
let currentUserData = null;
let currentChatId = null;
let roomId = null;
let gameMode = null; // 'host' or 'join'
let playerNumber = null; // 1 or 2
let opponentData = null;
let currentRound = {
    player1Choice: null,
    player2Choice: null,
    result: null
};
let sessionStats = {
    wins: 0,
    losses: 0,
    draws: 0
};
let gameSessionActive = true; // Track if player is still in game
let opponentLeftListener = null; // Store listener reference for cleanup

// ===========================
// DOM Elements
// ===========================
const globalLoading = document.getElementById('global-loading');
const gameContainer = document.getElementById('game-container');
const backToChatBtn = document.getElementById('back-to-chat-btn');
const waitingScreen = document.getElementById('waiting-screen');
const gameBoard = document.getElementById('game-board');
const statusText = document.getElementById('status-text');
const choiceBtns = document.querySelectorAll('.choice-btn');
const resultDisplay = document.getElementById('result-display');
const yourChoice = document.getElementById('your-choice');
const opponentChoice = document.getElementById('opponent-choice');
const resultMessage = document.getElementById('result-message');
const playAgainBtn = document.getElementById('play-again-btn');
const winsCount = document.getElementById('wins-count');
const lossesCount = document.getElementById('losses-count');
const drawsCount = document.getElementById('draws-count');
const player1Avatar = document.getElementById('player-1-avatar');
const player1Name = document.getElementById('player-1-name');
const player1Score = document.getElementById('player-1-score');
const player2Avatar = document.getElementById('player-2-avatar');
const player2Name = document.getElementById('player-2-name');
const player2Score = document.getElementById('player-2-score');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');

// ===========================
// Utility Functions
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

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function applyAvatarToElement(element, userData) {
    if (!element || !userData) return;

    const initials = getInitials(userData.displayName || userData.email || '?');
    element.textContent = initials;

    if (userData.photoURL && userData.photoURL.startsWith('http')) {
        element.style.backgroundImage = `url(${userData.photoURL})`;
        element.classList.add('has-image');
    } else {
        element.style.backgroundImage = '';
        element.classList.remove('has-image');
    }
}

async function applyTheme() {
    try {
        // Get theme from chat metadata if available
        const themeDoc = await getDoc(doc(db, 'chats', currentChatId, 'metadata', 'theme'));
        if (themeDoc.exists()) {
            const theme = themeDoc.data();
            const root = document.documentElement;

            if (theme.sentBubbleColor) {
                root.style.setProperty('--message-own-bg', theme.sentBubbleColor);
            }
            if (theme.receivedBubbleColor) {
                root.style.setProperty('--message-opponent-bg', theme.receivedBubbleColor);
            }
            if (theme.primaryColor) {
                root.style.setProperty('--primary-color', theme.primaryColor);
            }
            if (theme.secondaryColor) {
                root.style.setProperty('--secondary-color', theme.secondaryColor);
            }

            console.log('Theme applied:', theme);
        }
    } catch (error) {
        console.log('No theme found or error applying theme:', error);
    }
}

// ===========================
// URL Parameter Parsing
// ===========================
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        roomId: params.get('roomId'),
        mode: params.get('mode'),
        chatId: params.get('chatId')
    };
}

// ===========================
// Game Logic
// ===========================
function determineWinner(choice1, choice2) {
    if (choice1 === choice2) return 'draw';

    if (choice1 === 'rock') {
        return choice2 === 'scissors' ? 'player1' : 'player2';
    } else if (choice1 === 'paper') {
        return choice2 === 'rock' ? 'player1' : 'player2';
    } else if (choice1 === 'scissors') {
        return choice2 === 'paper' ? 'player1' : 'player2';
    }
}

function getChoiceEmoji(choice) {
    const emojis = {
        rock: '🪨',
        paper: '📄',
        scissors: '✂️'
    };
    return emojis[choice] || choice;
}

function getChoiceLabel(choice) {
    return choice.charAt(0).toUpperCase() + choice.slice(1);
}

// ===========================
// UI Updates
// ===========================
function updatePlayerInfo() {
    if (playerNumber === 1) {
        applyAvatarToElement(player1Avatar, currentUserData);
        player1Name.textContent = currentUserData?.displayName || 'You';

        if (opponentData) {
            applyAvatarToElement(player2Avatar, opponentData);
            player2Name.textContent = opponentData.displayName || 'Opponent';
        }
    } else {
        applyAvatarToElement(player2Avatar, currentUserData);
        player2Name.textContent = currentUserData?.displayName || 'You';

        if (opponentData) {
            applyAvatarToElement(player1Avatar, opponentData);
            player1Name.textContent = opponentData.displayName || 'Opponent';
        }
    }
}

function showWaitingScreen() {
    waitingScreen.classList.remove('hidden');
    gameBoard.classList.add('hidden');
}

function hideWaitingScreen() {
    console.log('Hiding waiting screen, showing game board');
    waitingScreen.classList.add('hidden');
    gameBoard.classList.remove('hidden');
    resetRound();
}

function resetRound() {
    currentRound = {
        player1Choice: null,
        player2Choice: null,
        result: null
    };

    // Enable all choice buttons
    choiceBtns.forEach(btn => {
        btn.disabled = false;
    });

    resultDisplay.classList.add('hidden');
    statusText.textContent = 'Make your choice!';
}

function updateScoreDisplay() {
    winsCount.textContent = sessionStats.wins;
    lossesCount.textContent = sessionStats.losses;
    drawsCount.textContent = sessionStats.draws;
}

// ===========================
// Game Initialization
// ===========================
async function initializeGame() {
    const params = getUrlParams();
    roomId = params.roomId;
    gameMode = params.mode;
    currentChatId = params.chatId;

    console.log('Initializing RPS game with roomId:', roomId, 'mode:', gameMode, 'chatId:', currentChatId);

    if (!roomId || !gameMode) {
        console.error('Invalid game parameters');
        return;
    }

    // Apply theme if chatId is available
    if (currentChatId) {
        await applyTheme();
    }

    if (gameMode === 'host') {
        console.log('Host mode - registering as player 1');
        playerNumber = 1;
        showWaitingScreen();

        // Register player 1 in Firestore
        try {
            const player1Data = {
                uid: currentUser.uid,
                displayName: currentUserData?.displayName || 'Player 1',
                photoURL: currentUserData?.photoURL || '',
                joinedAt: serverTimestamp()
            };
            console.log('Registering player 1 with data:', player1Data);
            await setDoc(doc(db, 'rps_games', roomId, 'players', 'player1'), player1Data);
            console.log('Player 1 registered successfully');
        } catch (error) {
            console.error('Error registering player 1:', error);
        }

        // Listen for player 2 joining
        listenForPlayer2Join();
    } else if (gameMode === 'join') {
        console.log('Join mode - registering as player 2');
        playerNumber = 2;
        showWaitingScreen();

        // Register player 2 in Firestore
        try {
            const player2Data = {
                uid: currentUser.uid,
                displayName: currentUserData?.displayName || 'Player 2',
                photoURL: currentUserData?.photoURL || '',
                joinedAt: serverTimestamp()
            };
            console.log('Registering player 2 with data:', player2Data);
            await setDoc(doc(db, 'rps_games', roomId, 'players', 'player2'), player2Data);
            console.log('Player 2 registered successfully');
        } catch (error) {
            console.error('Error registering player 2:', error);
        }

        // Listen for player 1 presence
        listenForPlayer1Presence();
    }

    updatePlayerInfo();
    listenForRoundUpdates();
    listenForChatMessages();
    listenForOpponentLeft();
}

// ===========================
// Opponent Detection
// ===========================
function listenForPlayer2Join() {
    console.log('Player 1 listening for player 2 join...');
    const unsubscribe = onSnapshot(doc(db, 'rps_games', roomId, 'players', 'player2'), (docSnap) => {
        console.log('Player 2 listener triggered. Exists:', docSnap.exists());
        if (docSnap.exists()) {
            const player2Data = docSnap.data();
            console.log('Player 2 data from Firestore:', player2Data);
            opponentData = {
                uid: player2Data.uid,
                displayName: player2Data.displayName,
                photoURL: player2Data.photoURL,
                email: player2Data.email || ''
            };
            console.log('Player 2 joined, opponent data set:', opponentData);
            updatePlayerInfo();
            hideWaitingScreen();
        } else {
            console.log('Player 2 document does not exist yet');
        }
    }, (error) => {
        console.error('Error listening for player 2:', error);
    });
}

function listenForPlayer1Presence() {
    console.log('Player 2 listening for player 1 presence...');
    const unsubscribe = onSnapshot(doc(db, 'rps_games', roomId, 'players', 'player1'), (docSnap) => {
        console.log('Player 1 listener triggered. Exists:', docSnap.exists());
        if (docSnap.exists()) {
            const player1Data = docSnap.data();
            console.log('Player 1 data from Firestore:', player1Data);
            opponentData = {
                uid: player1Data.uid,
                displayName: player1Data.displayName,
                photoURL: player1Data.photoURL,
                email: player1Data.email || ''
            };
            console.log('Player 1 found, opponent data set:', opponentData);
            updatePlayerInfo();
            hideWaitingScreen();
        } else {
            console.log('Player 1 document does not exist yet');
        }
    }, (error) => {
        console.error('Error listening for player 1:', error);
    });
}

// ===========================
// Round Management
// ===========================
async function submitChoice(choice) {
    console.log(`Player ${playerNumber} chose: ${choice}`);

    // Disable all buttons
    choiceBtns.forEach(btn => btn.disabled = true);
    statusText.textContent = 'Waiting for opponent...';

    // Submit choice to Firestore
    try {
        const choiceKey = playerNumber === 1 ? 'player1Choice' : 'player2Choice';
        await setDoc(doc(db, 'rps_games', roomId, 'rounds', 'current'), {
            [choiceKey]: choice,
            [`player${playerNumber}SubmittedAt`]: serverTimestamp()
        }, { merge: true });
        console.log(`Choice submitted: ${choice}`);
    } catch (error) {
        console.error('Error submitting choice:', error);
    }
}

function listenForRoundUpdates() {
    console.log('Setting up listener for round updates...');
    const unsubscribe = onSnapshot(doc(db, 'rps_games', roomId, 'rounds', 'current'), (docSnap) => {
        if (docSnap.exists()) {
            const roundData = docSnap.data();
            console.log('Round data updated:', roundData);

            const player1Choice = roundData.player1Choice;
            const player2Choice = roundData.player2Choice;

            // Both players have made their choice
            if (player1Choice && player2Choice) {
                const result = determineWinner(player1Choice, player2Choice);
                displayResult(player1Choice, player2Choice, result);
            } else if (player1Choice === null && player2Choice === null) {
                // Round has been reset
                console.log('Round reset detected from Firestore');
                resetRound();
            }
        }
    }, (error) => {
        console.error('Error listening for round updates:', error);
    });
}

function displayResult(player1Choice, player2Choice, result) {
    console.log('Displaying result:', result);

    resultDisplay.classList.remove('hidden');

    // Show choices
    yourChoice.textContent = playerNumber === 1 ? getChoiceLabel(player1Choice) : getChoiceLabel(player2Choice);
    opponentChoice.textContent = playerNumber === 1 ? getChoiceLabel(player2Choice) : getChoiceLabel(player1Choice);

    // Determine result for current player
    let resultText = '';
    let resultClass = '';

    if (result === 'draw') {
        resultText = "It's a Draw!";
        resultClass = 'draw';
        sessionStats.draws++;
    } else if ((playerNumber === 1 && result === 'player1') || (playerNumber === 2 && result === 'player2')) {
        resultText = 'You Won! 🎉';
        resultClass = 'win';
        sessionStats.wins++;
    } else {
        resultText = 'You Lost! 😢';
        resultClass = 'loss';
        sessionStats.losses++;
    }

    resultMessage.textContent = resultText;
    resultMessage.className = `result-message ${resultClass}`;

    updateScoreDisplay();
    statusText.textContent = resultText;
}

async function playAgain() {
    console.log('Starting new round...');

    // Clear current round data for both players
    try {
        await setDoc(doc(db, 'rps_games', roomId, 'rounds', 'current'), {
            player1Choice: null,
            player2Choice: null,
            player1SubmittedAt: null,
            player2SubmittedAt: null
        }, { merge: true });
        console.log('Round cleared, ready for next game');
    } catch (error) {
        console.error('Error clearing round:', error);
    }

    resetRound();
}

// ===========================
// Chat Functions
// ===========================
let displayedChatMessages = new Set();

function displayChatMessage(data, docId, isOwn = false) {
    // Prevent duplicate messages
    if (displayedChatMessages.has(docId)) return;
    displayedChatMessages.add(docId);

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isOwn ? 'own' : 'opponent'}`;
    messageEl.textContent = data.message;
    messageEl.dataset.messageId = docId;

    if (chatMessages) {
        chatMessages.appendChild(messageEl);
        // Auto-scroll to bottom
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 0);
    }
}

async function sendChatMessage(text) {
    if (!text.trim()) {
        console.warn('Cannot send empty chat message');
        return;
    }

    if (!roomId) {
        console.error('Cannot send chat message: roomId is not set');
        return;
    }

    if (!currentUser) {
        console.error('Cannot send chat message: user not authenticated');
        return;
    }

    try {
        console.log('Sending chat message to room:', roomId);
        console.log('Message data:', {
            senderId: currentUser.uid,
            senderName: currentUserData?.displayName || 'Player',
            message: text.trim()
        });

        const docRef = await addDoc(collection(db, 'rps_games', roomId, 'chat'), {
            senderId: currentUser.uid,
            senderName: currentUserData?.displayName || 'Player',
            message: text.trim(),
            timestamp: serverTimestamp()
        });

        console.log('Chat message sent successfully with ID:', docRef.id);
    } catch (error) {
        console.error('Error sending chat message:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Full error:', error);

        // Provide specific error feedback
        if (error.code === 'permission-denied') {
            alert('Permission denied. Please ensure Firestore rules are updated.');
        } else if (error.code === 'not-found') {
            alert('Game room not found. Please check the room ID.');
        } else {
            alert('Failed to send message: ' + error.message);
        }
    }
}

function listenForChatMessages() {
    if (!roomId) {
        console.error('Cannot listen for chat messages: roomId is not set');
        return;
    }

    console.log('Setting up listener for chat messages in room:', roomId);
    const chatQuery = query(
        collection(db, 'rps_games', roomId, 'chat'),
        orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(chatQuery, (querySnap) => {
        console.log('Chat listener triggered, count:', querySnap.docs.length);

        querySnap.docs.forEach((doc) => {
            const data = doc.data();
            const isOwn = data.senderId === currentUser.uid;
            console.log('Processing chat message:', { id: doc.id, sender: data.senderName, isOwn });
            displayChatMessage(data, doc.id, isOwn);
        });
    }, (error) => {
        console.error('Error listening for chat messages:', error);
    });
}

// ===========================
// Session Management
// ===========================
async function leaveGame() {
    if (!gameSessionActive || !roomId) return;

    console.log('Player leaving RPS game room:', roomId);
    gameSessionActive = false;

    try {
        // Mark player as left in Firestore
        const playerKey = playerNumber === 1 ? 'player1' : 'player2';
        await setDoc(doc(db, 'rps_games', roomId, 'players', playerKey), {
            hasLeft: true,
            leftAt: serverTimestamp()
        }, { merge: true });

        console.log('RPS player marked as left in Firestore');
    } catch (error) {
        console.error('Error marking RPS player as left:', error);
    }
}

function listenForOpponentLeft() {
    if (!roomId || playerNumber === null) return;

    const opponentKey = playerNumber === 1 ? 'player2' : 'player1';
    console.log('Listening for RPS opponent left:', opponentKey);

    opponentLeftListener = onSnapshot(doc(db, 'rps_games', roomId, 'players', opponentKey), (docSnap) => {
        if (docSnap.exists()) {
            const playerData = docSnap.data();

            if (playerData.hasLeft && gameSessionActive) {
                console.log('RPS opponent has left the game');
                gameSessionActive = false;

                // Show notification
                const opponentName = opponentData?.displayName || 'Opponent';
                showOpponentLeftNotification(opponentName);
            }
        }
    }, (error) => {
        console.error('Error listening for RPS opponent left:', error);
    });
}

function showOpponentLeftNotification(opponentName) {
    // Create and show notification
    const notification = document.createElement('div');
    notification.className = 'opponent-left-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <p>😢 ${escapeHtml(opponentName)} left the game</p>
            <p class="sub-text">Returning to chat in 3 seconds...</p>
            <button id="close-notification-btn">Return Now</button>
        </div>
    `;

    document.body.appendChild(notification);

    // Style the notification
    notification.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 30px;
        border-radius: 12px;
        z-index: 10000;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    `;

    const closeBtn = notification.querySelector('#close-notification-btn');
    closeBtn.addEventListener('click', () => {
        notification.remove();
        window.location.href = 'index.html';
    });

    // Auto-redirect after 3 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.remove();
            window.location.href = 'index.html';
        }
    }, 3000);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ===========================
// Event Listeners
// ===========================
choiceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const choice = btn.dataset.choice;
        submitChoice(choice);
    });
});

playAgainBtn.addEventListener('click', playAgain);

backToChatBtn.addEventListener('click', async () => {
    await leaveGame();
    window.location.href = 'index.html';
});

// Handle page unload/close
window.addEventListener('beforeunload', async (e) => {
    if (gameSessionActive && roomId) {
        await leaveGame();
        e.preventDefault();
        e.returnValue = '';
    }
});

// Handle visibility change (tab switch)
document.addEventListener('visibilitychange', async () => {
    if (document.hidden && gameSessionActive && roomId) {
        await leaveGame();
    }
});

// Chat event listeners
sendChatBtn.addEventListener('click', async () => {
    const text = chatInput.value;
    if (text.trim()) {
        await sendChatMessage(text);
        chatInput.value = '';
        chatInput.focus();
    }
});

// Allow Enter for new lines, users must click send button
chatInput.addEventListener('keypress', async (e) => {
    // Just allow normal Enter behavior for new lines
    // Users must click send button to send message
});

// ===========================
// Authentication
// ===========================
onAuthStateChanged(auth, async (user) => {
    try {
        if (user) {
            currentUser = user;

            // Fetch user data from Firestore
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                currentUserData = userDoc.data();
            }

            // Hide loading and show game container
            gameContainer.classList.remove('hidden');

            // Initialize the game
            await initializeGame();
        } else {
            // Redirect to login
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Auth error:', error);
    } finally {
        hideLoading();
    }
});
