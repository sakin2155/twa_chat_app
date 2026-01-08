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
    updateDoc,
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    getDocs,
    deleteDoc
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
let roomId = null;
let gameMode = null; // 'host' or 'join'
let playerSymbol = null; // 'X' or 'O'
let opponentSymbol = null;
let opponentData = null;
let gameState = ['', '', '', '', '', '', '', '', '']; // 3x3 board
let currentTurn = 'X'; // X always goes first
let gameActive = false;
let gameOver = false;
let socket = null;
let gameSessionActive = true; // Track if player is still in game
let opponentLeftListener = null; // Store listener reference for cleanup

// ===========================
// DOM Elements
// ===========================
const globalLoading = document.getElementById('global-loading');
const gameContainer = document.getElementById('game-container');
const loginModal = document.getElementById('login-modal');
const backToChatBtn = document.getElementById('back-to-chat-btn');
const backToChatFromModalBtn = document.getElementById('back-to-chat-from-modal-btn');
const goToLoginBtn = document.getElementById('go-to-login-btn');
const waitingScreen = document.getElementById('waiting-screen');
const gameBoard = document.getElementById('game-board');
const boardCells = document.querySelectorAll('.board-cell');
const turnIndicator = document.getElementById('turn-indicator');
const gameOverModal = document.getElementById('game-over-modal');
const gameOverMessage = document.getElementById('game-over-message');
const playAgainBtn = document.getElementById('play-again-btn');
const playerXAvatar = document.getElementById('player-x-avatar');
const playerXName = document.getElementById('player-x-name');
const playerXStatus = document.getElementById('player-x-status');
const playerOAvatar = document.getElementById('player-o-avatar');
const playerOName = document.getElementById('player-o-name');
const playerOStatus = document.getElementById('player-o-status');
const giveTurnBtn = document.getElementById('give-turn-btn');
const chatInput = document.getElementById('chat-input');
const sendChatBtn = document.getElementById('send-chat-btn');
const chatMessages = document.getElementById('chat-messages');

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

function generateRoomId() {
    return 'game_' + Math.random().toString(36).substr(2, 9);
}

// ===========================
// URL Parameter Parsing
// ===========================
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        roomId: params.get('roomId'),
        mode: params.get('mode')
    };
}

// ===========================
// WebSocket Connection
// ===========================
function initializeSocket() {
    // For production, use your actual server URL
    // For now, we'll use a simple approach with Firestore real-time listeners
    console.log('Socket initialization ready for real-time sync');
}

// ===========================
// Game Logic
// ===========================
const WINNING_COMBINATIONS = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

function checkWinner(board) {
    for (let combo of WINNING_COMBINATIONS) {
        const [a, b, c] = combo;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function isBoardFull(board) {
    return board.every(cell => cell !== '');
}

async function makeMove(index) {
    if (!gameActive || gameOver) return false;
    if (gameState[index] !== '') return false;
    
    // Check if it's the current player's turn
    if (playerSymbol !== currentTurn) {
        console.log('Not your turn!');
        return false;
    }

    // Make the move
    gameState[index] = playerSymbol;
    updateBoardUI();

    // Check for winner
    const winner = checkWinner(gameState);
    if (winner) {
        gameOver = true;
        gameActive = false;
        showGameOverModal(winner);
    }

    // Check for draw
    if (isBoardFull(gameState)) {
        gameOver = true;
        gameActive = false;
        showGameOverModal('draw');
    }

    // Switch turn
    currentTurn = currentTurn === 'X' ? 'O' : 'X';
    updateTurnIndicator();

    // Save move to Firestore for real-time sync
    try {
        await addDoc(collection(db, 'games', roomId, 'moves'), {
            index: index,
            symbol: playerSymbol,
            playerId: currentUser.uid,
            playerName: currentUserData?.displayName || 'Player',
            timestamp: new Date(),
            gameState: gameState,
            currentTurn: currentTurn,
            gameOver: gameOver,
            winner: winner || null
        });
        console.log('Move saved to Firestore');
    } catch (error) {
        console.error('Error saving move:', error);
    }

    return true;
}

function updateBoardUI() {
    boardCells.forEach((cell, index) => {
        cell.textContent = gameState[index];
        cell.classList.remove('x', 'o');
        if (gameState[index] === 'X') {
            cell.classList.add('x');
        } else if (gameState[index] === 'O') {
            cell.classList.add('o');
        }
    });
}

function updateTurnIndicator() {
    if (playerSymbol === currentTurn) {
        turnIndicator.textContent = 'Your Turn';
        turnIndicator.style.color = '#667eea';
        boardCells.forEach(cell => {
            if (cell.textContent === '') {
                cell.style.cursor = 'pointer';
            }
        });
    } else {
        turnIndicator.textContent = `${opponentData?.displayName || 'Opponent'}'s Turn`;
        turnIndicator.style.color = '#999';
        boardCells.forEach(cell => {
            cell.style.cursor = 'not-allowed';
        });
    }
}

async function resetBoard() {
    gameState = ['', '', '', '', '', '', '', '', ''];
    currentTurn = 'X';
    gameActive = true;
    gameOver = false;
    updateBoardUI();
    updateTurnIndicator();
    
    // Clear all moves from Firestore for new game
    try {
        const movesRef = collection(db, 'games', roomId, 'moves');
        const movesSnap = await getDocs(movesRef);
        
        for (const doc of movesSnap.docs) {
            await deleteDoc(doc.ref);
        }
        console.log('All moves cleared for new game');
    } catch (error) {
        console.error('Error clearing moves:', error);
    }
    
    // Save reset game state to Firestore
    await setDoc(doc(db, 'games', roomId), {
        gameState: gameState,
        currentTurn: currentTurn,
        gameOver: gameOver,
        winner: null,
        hostId: gameMode === 'host' ? currentUser.uid : null,
        updatedAt: new Date()
    }, { merge: true });
    
    console.log('Game reset and saved to Firestore');
}

function showGameOverModal(result) {
    if (result === 'draw') {
        gameOverMessage.textContent = '🤝 It\'s a Draw!';
    } else if (result === playerSymbol) {
        gameOverMessage.textContent = '🏆 You Won!';
    } else {
        gameOverMessage.textContent = `😢 ${opponentData?.displayName || 'Opponent'} Won!`;
    }
    gameOverModal.classList.remove('hidden');
    
    // Auto-restart after 5 seconds
    setTimeout(() => {
        if (!gameOverModal.classList.contains('hidden')) {
            resetBoard().then(() => {
                closeGameOverModal();
                console.log('Game auto-restarted');
            });
        }
    }, 5000);
}

function closeGameOverModal() {
    gameOverModal.classList.add('hidden');
}

// ===========================
// UI Updates
// ===========================
function updatePlayerInfo() {
    // Update current player info
    if (playerSymbol === 'X') {
        applyAvatarToElement(playerXAvatar, currentUserData);
        playerXName.textContent = currentUserData?.displayName || 'You';
        playerXStatus.textContent = 'Your Turn';
        
        if (opponentData) {
            applyAvatarToElement(playerOAvatar, opponentData);
            playerOName.textContent = opponentData.displayName || 'Opponent';
            playerOStatus.textContent = 'Waiting...';
        }
    } else {
        applyAvatarToElement(playerOAvatar, currentUserData);
        playerOName.textContent = currentUserData?.displayName || 'You';
        playerOStatus.textContent = 'Your Turn';
        
        if (opponentData) {
            applyAvatarToElement(playerXAvatar, opponentData);
            playerXName.textContent = opponentData.displayName || 'Opponent';
            playerXStatus.textContent = 'Waiting...';
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
    gameActive = true;
    updateTurnIndicator();
    console.log('Game board should now be visible');
}

// ===========================
// Game Initialization
// ===========================
async function initializeGame() {
    const params = getUrlParams();
    roomId = params.roomId;
    gameMode = params.mode;

    console.log('Initializing game with roomId:', roomId, 'mode:', gameMode);

    if (!roomId || !gameMode) {
        console.error('Invalid game parameters');
        return;
    }

    if (gameMode === 'host') {
        console.log('Host mode - registering as host');
        playerSymbol = 'X';
        opponentSymbol = 'O';
        showWaitingScreen();
        
        // Register host in Firestore
        try {
            const hostData = {
                uid: currentUser.uid,
                displayName: currentUserData?.displayName || 'Host',
                photoURL: currentUserData?.photoURL || '',
                joinedAt: new Date()
            };
            console.log('Registering host with data:', hostData);
            await setDoc(doc(db, 'games', roomId, 'players', 'host'), hostData);
            console.log('Host registered successfully');
        } catch (error) {
            console.error('Error registering host:', error);
        }
        
        // Listen for guest joining
        listenForGuestJoin();
    } else if (gameMode === 'join') {
        console.log('Join mode - registering as guest');
        playerSymbol = 'O';
        opponentSymbol = 'X';
        showWaitingScreen();
        
        // Register guest in Firestore
        try {
            const guestData = {
                uid: currentUser.uid,
                displayName: currentUserData?.displayName || 'Guest',
                photoURL: currentUserData?.photoURL || '',
                joinedAt: new Date()
            };
            console.log('Registering guest with data:', guestData);
            await setDoc(doc(db, 'games', roomId, 'players', 'guest'), guestData);
            console.log('Guest registered successfully');
        } catch (error) {
            console.error('Error registering guest:', error);
        }
        
        // Listen for host presence
        listenForHostPresence();
    }

    updatePlayerInfo();
    
    // Load existing game state if resuming
    await loadGameState();
    
    // Set up real-time move synchronization
    listenForMoves();
    
    // Set up game state change listener (for turn changes)
    listenForGameStateChanges();
    
    // Set up in-game chat
    listenForChatMessages();
    
    // Set up opponent-left detection
    listenForOpponentLeft();
    
    initializeSocket();
}

// ===========================
// Opponent Detection
// ===========================
function listenForGuestJoin() {
    // Host listens for guest joining
    console.log('Host setting up listener for guest join...');
    const unsubscribe = onSnapshot(doc(db, 'games', roomId, 'players', 'guest'), (docSnap) => {
        console.log('Guest listener triggered. Exists:', docSnap.exists());
        if (docSnap.exists()) {
            const guestData = docSnap.data();
            console.log('Guest data from Firestore:', guestData);
            opponentData = {
                uid: guestData.uid,
                displayName: guestData.displayName,
                photoURL: guestData.photoURL,
                email: guestData.email || ''
            };
            console.log('Guest joined, opponent data set:', opponentData);
            updatePlayerInfo();
            hideWaitingScreen();
        } else {
            console.log('Guest document does not exist yet');
        }
    }, (error) => {
        console.error('Error listening for guest:', error);
    });
}

function listenForHostPresence() {
    // Guest listens for host presence
    console.log('Guest setting up listener for host presence...');
    const unsubscribe = onSnapshot(doc(db, 'games', roomId, 'players', 'host'), (docSnap) => {
        console.log('Host listener triggered. Exists:', docSnap.exists());
        if (docSnap.exists()) {
            const hostData = docSnap.data();
            console.log('Host data from Firestore:', hostData);
            opponentData = {
                uid: hostData.uid,
                displayName: hostData.displayName,
                photoURL: hostData.photoURL,
                email: hostData.email || ''
            };
            console.log('Host found, opponent data set:', opponentData);
            updatePlayerInfo();
            hideWaitingScreen();
        } else {
            console.log('Host document does not exist yet');
        }
    }, (error) => {
        console.error('Error listening for host:', error);
    });
}

// ===========================
// Real-time Move Synchronization
// ===========================
function listenForMoves() {
    // Listen for all moves in the game
    console.log('Setting up listener for moves...');
    const movesQuery = query(
        collection(db, 'games', roomId, 'moves'),
        orderBy('timestamp', 'asc')
    );
    
    const unsubscribe = onSnapshot(movesQuery, (querySnap) => {
        console.log('Moves listener triggered, count:', querySnap.docs.length);
        
        // Rebuild game state from moves
        gameState = ['', '', '', '', '', '', '', '', ''];
        currentTurn = 'X';
        gameOver = false;
        let lastWinner = null;
        
        querySnap.docs.forEach((doc) => {
            const moveData = doc.data();
            console.log('Processing move:', moveData);
            
            // Apply move to board
            gameState[moveData.index] = moveData.symbol;
            
            // Update game state
            currentTurn = moveData.currentTurn;
            gameOver = moveData.gameOver;
            lastWinner = moveData.winner;
        });
        
        // Update UI with current game state
        updateBoardUI();
        updateTurnIndicator();
        
        // If game is over, show modal
        if (gameOver && lastWinner) {
            showGameOverModal(lastWinner);
        } else {
            // If game is not over (e.g. reset), ensure modal is closed
            closeGameOverModal();
        }
        
        console.log('Game state updated from Firestore');
    }, (error) => {
        console.error('Error listening for moves:', error);
    });
}

// Listen for game state changes (turn changes, etc.)
function listenForGameStateChanges() {
    console.log('Setting up listener for game state changes...');
    const unsubscribe = onSnapshot(doc(db, 'games', roomId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            console.log('Game state changed:', data);
            
            // Update turn if it changed
            if (data.currentTurn && data.currentTurn !== currentTurn) {
                console.log('Turn changed to:', data.currentTurn);
                currentTurn = data.currentTurn;
                updateTurnIndicator();
            }
        }
    }, (error) => {
        console.error('Error listening for game state changes:', error);
    });
}

// ===========================
// Game State Persistence
// ===========================
async function loadGameState() {
    // Load existing game state from Firestore
    try {
        console.log('Loading game state from Firestore...');
        const gameDoc = await getDoc(doc(db, 'games', roomId));
        
        if (gameDoc.exists()) {
            const data = gameDoc.data();
            console.log('Game state loaded:', data);
            
            gameState = data.gameState || ['', '', '', '', '', '', '', '', ''];
            currentTurn = data.currentTurn || 'X';
            gameOver = data.gameOver || false;
            gameActive = !gameOver;
            
            updateBoardUI();
            updateTurnIndicator();
            
            if (gameOver) {
                hideWaitingScreen();
                showGameOverModal(data.winner || 'draw');
            }
        }
    } catch (error) {
        console.error('Error loading game state:', error);
    }
}

async function saveGameState() {
    // Save game state to Firestore
    try {
        await setDoc(doc(db, 'games', roomId), {
            gameState: gameState,
            currentTurn: currentTurn,
            gameOver: gameOver,
            winner: checkWinner(gameState),
            hostId: gameMode === 'host' ? currentUser.uid : null,
            guestId: gameMode === 'join' ? currentUser.uid : null,
            createdAt: new Date(),
            updatedAt: new Date()
        }, { merge: true });
        console.log('Game state saved to Firestore');
    } catch (error) {
        console.error('Error saving game state:', error);
    }
}

// ===========================
// In-Game Chat Functions
// ===========================
async function sendChatMessage(text) {
    if (!text.trim()) return;
    
    try {
        await addDoc(collection(db, 'games', roomId, 'chat'), {
            senderId: currentUser.uid,
            senderName: currentUserData?.displayName || 'Player',
            message: text.trim(),
            timestamp: new Date()
        });
        console.log('Chat message sent');
    } catch (error) {
        console.error('Error sending chat message:', error);
    }
}

let displayedMessages = new Set();

// Create notification sound
function playNotificationSound() {
    try {
        // Create a simple beep sound using Web Audio API
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800; // Frequency in Hz
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        console.log('Audio notification not available:', error);
    }
}

function displayChatMessage(data, docId, isOwn = false) {
    // Prevent duplicate messages
    if (displayedMessages.has(docId)) return;
    displayedMessages.add(docId);
    
    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isOwn ? 'own' : 'opponent'}`;
    messageEl.textContent = data.message;
    messageEl.title = `${data.senderName} - ${new Date(data.timestamp?.toDate?.() || data.timestamp).toLocaleTimeString()}`;
    messageEl.dataset.messageId = docId;
    
    if (chatMessages) {
        chatMessages.appendChild(messageEl);
        // Auto-scroll to bottom
        setTimeout(() => {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 0);
        
        // Play sound for opponent messages only
        if (!isOwn) {
            playNotificationSound();
        }
    }
}

function listenForChatMessages() {
    console.log('Setting up listener for chat messages...');
    const chatQuery = query(
        collection(db, 'games', roomId, 'chat'),
        orderBy('timestamp', 'asc')
    );
    
    const unsubscribe = onSnapshot(chatQuery, (querySnap) => {
        console.log('Chat listener triggered, count:', querySnap.docs.length);
        
        querySnap.docs.forEach((doc) => {
            const data = doc.data();
            const isOwn = data.senderId === currentUser.uid;
            displayChatMessage(data, doc.id, isOwn);
        });
    }, (error) => {
        console.error('Error listening for chat messages:', error);
    });
}

// ===========================
// Turn Control Functions
// ===========================
async function giveTurnToOpponent() {
    if (gameMode !== 'host') {
        console.log('Only host can give turn');
        return;
    }
    
    try {
        // Switch the starting turn
        currentTurn = 'O';
        updateTurnIndicator();
        
        // Save the turn change to Firestore
        await setDoc(doc(db, 'games', roomId), {
            gameState: gameState,
            currentTurn: currentTurn,
            gameOver: gameOver,
            winner: checkWinner(gameState),
            hostId: currentUser.uid,
            updatedAt: new Date()
        }, { merge: true });
        
        console.log('Turn given to opponent, saved to Firestore');
        
        // Send system message
        await sendChatMessage(`🔄 ${currentUserData?.displayName || 'Host'} gave the first turn to opponent!`);
    } catch (error) {
        console.error('Error giving turn to opponent:', error);
    }
}

// ===========================
// Session Management
// ===========================
async function leaveGame() {
    if (!gameSessionActive || !roomId) return;
    
    console.log('Player leaving game room:', roomId);
    gameSessionActive = false;
    
    try {
        // Mark player as left in Firestore
        const playerKey = gameMode === 'host' ? 'host' : 'guest';
        await setDoc(doc(db, 'games', roomId, 'players', playerKey), {
            hasLeft: true,
            leftAt: serverTimestamp()
        }, { merge: true });
        
        console.log('Player marked as left in Firestore');
    } catch (error) {
        console.error('Error marking player as left:', error);
    }
}

function listenForOpponentLeft() {
    if (!roomId || !gameMode) return;
    
    const opponentKey = gameMode === 'host' ? 'guest' : 'host';
    console.log('Listening for opponent left:', opponentKey);
    
    opponentLeftListener = onSnapshot(doc(db, 'games', roomId, 'players', opponentKey), (docSnap) => {
        if (docSnap.exists()) {
            const playerData = docSnap.data();
            
            if (playerData.hasLeft && gameSessionActive) {
                console.log('Opponent has left the game');
                gameSessionActive = false;
                
                // Show notification
                const opponentName = opponentData?.displayName || 'Opponent';
                showOpponentLeftNotification(opponentName);
            }
        }
    }, (error) => {
        console.error('Error listening for opponent left:', error);
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
boardCells.forEach(cell => {
    cell.addEventListener('click', (e) => {
        const index = parseInt(e.target.dataset.index);
        makeMove(index);
    });
});

playAgainBtn.addEventListener('click', async () => {
    closeGameOverModal();
    await resetBoard();
});

backToChatBtn.addEventListener('click', async () => {
    await leaveGame();
    window.location.href = 'index.html';
});

backToChatFromModalBtn.addEventListener('click', async () => {
    await leaveGame();
    window.location.href = 'index.html';
});

goToLoginBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
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

chatInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = chatInput.value;
        if (text.trim()) {
            await sendChatMessage(text);
            chatInput.value = '';
        }
    }
});

// Give turn button
giveTurnBtn.addEventListener('click', async () => {
    await giveTurnToOpponent();
});

// Handle page unload/close
window.addEventListener('beforeunload', async (e) => {
    if (gameSessionActive && roomId) {
        await leaveGame();
        // Some browsers may show a confirmation dialog
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

            // Hide login modal and show game container
            loginModal.classList.add('hidden');
            gameContainer.classList.remove('hidden');

            // Initialize the game
            await initializeGame();
        } else {
            // Show login modal
            loginModal.classList.remove('hidden');
            gameContainer.classList.add('hidden');
        }
    } catch (error) {
        console.error('Auth error:', error);
    } finally {
        hideLoading();
    }
});

