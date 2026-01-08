// ===========================
// Firebase Configuration
// ===========================
let auth, db, storage;
let firebaseReady = false;

function initializeFirebase() {
    // First, try to get Firebase instances from window (if main app is loaded)
    if (window.auth && window.db && window.storage) {
        auth = window.auth;
        db = window.db;
        storage = window.storage;
        firebaseReady = true;
        console.log('Firebase initialized from main app');
        return true;
    }

    // If not available, initialize Firebase directly
    if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        // Firebase SDK already loaded, use existing app
        const app = firebase.apps[0];
        auth = firebase.auth(app);
        db = firebase.firestore(app);
        storage = firebase.storage(app);
        firebaseReady = true;
        console.log('Firebase initialized from existing app');
        return true;
    }

    return false;
}

// Try to initialize immediately
if (!initializeFirebase()) {
    // If not available, wait and retry (max 10 attempts = 1 second, then fallback)
    let retries = 0;
    const retryInterval = setInterval(() => {
        retries++;
        if (initializeFirebase()) {
            clearInterval(retryInterval);
        } else if (retries > 10) {
            clearInterval(retryInterval);
            console.log('Using fallback Firebase initialization...');
            // Fallback: Initialize Firebase with config
            if (typeof firebase !== 'undefined') {
                const firebaseConfig = {
                    apiKey: "AIzaSyCjU48-MYfwQLDPc7C04lcyROT6s5cLH-8",
                    authDomain: "chat-f5b70.firebaseapp.com",
                    projectId: "chat-f5b70",
                    storageBucket: "chat-f5b70.firebasestorage.app",
                    messagingSenderId: "158106000000",
                    appId: "1:158106000000:web:6cd2c27cdd676d306da465"
                };
                try {
                    const app = firebase.initializeApp(firebaseConfig);
                    auth = firebase.auth(app);
                    db = firebase.firestore(app);
                    storage = firebase.storage(app);
                    firebaseReady = true;
                    console.log('Firebase initialized with fallback config');
                } catch (error) {
                    console.error('Fallback initialization failed:', error);
                }
            }
        }
    }, 100);
}

// ===========================
// Global State
// ===========================
let currentUser = null;
let currentUserData = null;
let selectedImage = null;
let selectedImageFile = null;
let isLoading = false;
let lastVisibleDoc = null;
let hasMore = true;
let currentViewingImageId = null;
let userLikes = new Map(); // Track user's likes: imageId -> boolean

const IMAGES_PER_PAGE = 12;

// ===========================
// DOM Elements
// ===========================
const backBtn = document.getElementById('backBtn');
const uploadBtn = document.getElementById('uploadBtn');
const uploadModal = document.getElementById('uploadModal');
const closeUploadBtn = document.getElementById('closeUploadBtn');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
const selectImageBtn = document.getElementById('selectImageBtn');
const changeImageBtn = document.getElementById('changeImageBtn');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const fileInputWrapper = document.getElementById('fileInputWrapper');
const imageTitle = document.getElementById('imageTitle');
const charCount = document.getElementById('charCount');
const shareBtn = document.getElementById('shareBtn');
const galleryGrid = document.getElementById('galleryGrid');
const loadingSpinner = document.getElementById('loadingSpinner');
const fullViewModal = document.getElementById('fullViewModal');
const closeFullViewBtn = document.getElementById('closeFullViewBtn');
const fullViewImage = document.getElementById('fullViewImage');
const fullViewTitle = document.getElementById('fullViewTitle');
const uploaderName = document.getElementById('uploaderName');
const uploaderAvatar = document.getElementById('uploaderAvatar');
const uploadDate = document.getElementById('uploadDate');
const likeBtn = document.getElementById('likeBtn');
const likeCount = document.getElementById('likeCount');
const downloadBtn = document.getElementById('downloadBtn');
const uploadProgressContainer = document.getElementById('uploadProgressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const errorMessage = document.getElementById('errorMessage');
const emptyState = document.getElementById('emptyState');

// ===========================
// Authentication
// ===========================
let authCheckTimeout = null;

function setupAuthListener() {
    if (!auth || !firebaseReady) {
        // Firebase not ready yet, try again (but don't log repeatedly)
        setTimeout(setupAuthListener, 300);
        return;
    }

    console.log('Setting up auth listener');

    auth.onAuthStateChanged(async (user) => {
        // Clear any pending redirects
        if (authCheckTimeout) {
            clearTimeout(authCheckTimeout);
        }

        if (user) {
            console.log('User authenticated:', user.uid);
            currentUser = user;
            try {
                await loadCurrentUserData();
                // Load gallery immediately without waiting
                loadGallery();
            } catch (error) {
                console.error('Error loading gallery:', error);
            }
        } else {
            console.log('User not authenticated, redirecting...');
            // Only redirect if user is definitely not authenticated
            // Add a small delay to ensure auth state is fully resolved
            authCheckTimeout = setTimeout(() => {
                window.location.href = 'index.html';
            }, 500);
        }
    });
}

// Setup auth listener when Firebase is ready
function waitForFirebaseAndSetupAuth() {
    if (firebaseReady && auth) {
        setupAuthListener();
    } else {
        setTimeout(waitForFirebaseAndSetupAuth, 50);
    }
}

// Start waiting for Firebase immediately
waitForFirebaseAndSetupAuth();

async function loadCurrentUserData() {
    try {
        const userDoc = await db.collection('users').doc(currentUser.uid).get();
        if (userDoc.exists) {
            currentUserData = userDoc.data();
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// ===========================
// Navigation
// ===========================
backBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

// ===========================
// Upload Modal Management
// ===========================
uploadBtn.addEventListener('click', () => {
    resetUploadModal();
    uploadModal.classList.remove('hidden');
});

closeUploadBtn.addEventListener('click', () => {
    uploadModal.classList.add('hidden');
});

cancelUploadBtn.addEventListener('click', () => {
    uploadModal.classList.add('hidden');
});

uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) {
        uploadModal.classList.add('hidden');
    }
});

// ===========================
// Image Selection
// ===========================
selectImageBtn.addEventListener('click', () => {
    imageInput.click();
});

changeImageBtn.addEventListener('click', () => {
    imageInput.click();
});

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
            showError('Please select a valid image file');
            return;
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            showError('Image size must be less than 10MB');
            return;
        }

        selectedImageFile = file;
        const reader = new FileReader();
        reader.onload = (event) => {
            selectedImage = event.target.result;
            imagePreview.src = selectedImage;
            imagePreviewContainer.classList.remove('hidden');
            fileInputWrapper.classList.add('hidden');
            shareBtn.disabled = false;
            clearError();
        };
        reader.readAsDataURL(file);
    }
});

// ===========================
// Title Input
// ===========================
imageTitle.addEventListener('input', (e) => {
    charCount.textContent = e.target.value.length;
});

// ===========================
// Upload Functionality (Using Cloudinary)
// ===========================
const CLOUDINARY_CLOUD_NAME = "dxhn3fzfu";
const CLOUDINARY_UPLOAD_PRESET = "chat123";

shareBtn.addEventListener('click', async () => {
    if (!selectedImageFile) {
        showError('Please select an image');
        return;
    }

    if (!currentUser) {
        showError('Please wait for authentication to complete...');
        return;
    }

    if (!firebaseReady) {
        showError('Firebase is not ready. Please refresh the page.');
        return;
    }

    shareBtn.disabled = true;
    uploadProgressContainer.classList.remove('hidden');

    try {
        // Upload to Cloudinary
        const formData = new FormData();
        formData.append('file', selectedImageFile);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
        formData.append('folder', `gallery/${currentUser.uid}`);

        const xhr = new XMLHttpRequest();

        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `Uploading... ${Math.round(progress)}%`;
            }
        });

        xhr.addEventListener('load', async () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    const downloadURL = response.secure_url;

                    // Save to Firestore
                    await db.collection('gallery').add({
                        title: imageTitle.value || 'Untitled',
                        imageUrl: downloadURL,
                        uploadedBy: currentUser.uid,
                        uploaderName: currentUserData?.displayName || 'Unknown',
                        uploaderAvatar: currentUserData?.photoURL || '',
                        uploadedAt: firebase.firestore.FieldValue.serverTimestamp ?
                            firebase.firestore.FieldValue.serverTimestamp() :
                            new Date(),
                        likes: 0,
                        likedBy: []
                    });

                    // Reset modal
                    resetUploadModal();
                    uploadModal.classList.add('hidden');

                    // Reload gallery
                    galleryGrid.innerHTML = '';
                    lastVisibleDoc = null;
                    hasMore = true;
                    await loadGallery();
                } catch (error) {
                    console.error('Error saving to Firestore:', error);
                    showError('Failed to save image. Please try again.');
                    shareBtn.disabled = false;
                }
            } else {
                showError('Failed to upload image. Please try again.');
                shareBtn.disabled = false;
                uploadProgressContainer.classList.add('hidden');
            }
        });

        xhr.addEventListener('error', () => {
            console.error('Upload error');
            showError('Failed to upload image. Please try again.');
            shareBtn.disabled = false;
            uploadProgressContainer.classList.add('hidden');
        });

        xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);
        xhr.send(formData);
    } catch (error) {
        console.error('Upload error:', error);
        showError('Failed to upload image. Please try again.');
        shareBtn.disabled = false;
        uploadProgressContainer.classList.add('hidden');
    }
});

function resetUploadModal() {
    selectedImage = null;
    selectedImageFile = null;
    imageInput.value = '';
    imageTitle.value = '';
    charCount.textContent = '0';
    imagePreviewContainer.classList.add('hidden');
    fileInputWrapper.classList.remove('hidden');
    uploadProgressContainer.classList.add('hidden');
    progressFill.style.width = '0%';
    shareBtn.disabled = true;
    clearError();
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function clearError() {
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
}

// ===========================
// Gallery Loading
// ===========================
async function loadGallery() {
    if (isLoading || !hasMore) return;

    isLoading = true;
    loadingSpinner.classList.remove('hidden');

    try {
        let q;
        if (lastVisibleDoc) {
            q = db.collection('gallery')
                .orderBy('uploadedAt', 'desc')
                .startAfter(lastVisibleDoc)
                .limit(IMAGES_PER_PAGE);
        } else {
            q = db.collection('gallery')
                .orderBy('uploadedAt', 'desc')
                .limit(IMAGES_PER_PAGE);
        }

        const snapshot = await q.get();

        if (snapshot.empty && galleryGrid.innerHTML === '') {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }

        if (snapshot.docs.length < IMAGES_PER_PAGE) {
            hasMore = false;
        }

        snapshot.docs.forEach((doc, index) => {
            const imageData = doc.data();
            imageData.id = doc.id;
            renderGalleryItem(imageData, index);
        });

        if (snapshot.docs.length > 0) {
            lastVisibleDoc = snapshot.docs[snapshot.docs.length - 1];
        }
    } catch (error) {
        console.error('Error loading gallery:', error);
    } finally {
        isLoading = false;
        loadingSpinner.classList.add('hidden');
    }
}

function renderGalleryItem(imageData, index = 0) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset.imageId = imageData.id;
    
    // Add staggered animation delay (max 12 items per page, stagger by 50ms)
    const delay = Math.min(index * 0.05, 0.6);
    item.style.animationDelay = `${delay}s`;

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = imageData.imageUrl;
    img.alt = imageData.title;
    
    // Preload image for instant display
    const preloadImg = new Image();
    preloadImg.onload = function() {
        img.src = imageData.imageUrl;
    };
    preloadImg.src = imageData.imageUrl;
    
    // Load image to get natural dimensions for aspect ratio
    img.onload = function() {
        const aspectRatio = this.naturalWidth / this.naturalHeight;
        
        // Set grid row span based on aspect ratio
        if (aspectRatio > 1.5) {
            // Wide image - span 1 row
            item.style.gridRowEnd = 'span 1';
        } else if (aspectRatio > 0.8) {
            // Square-ish - span 1 row
            item.style.gridRowEnd = 'span 1';
        } else {
            // Tall image - span 2 rows
            item.style.gridRowEnd = 'span 2';
        }
    };

    const overlay = document.createElement('div');
    overlay.className = 'gallery-item-overlay';

    const title = document.createElement('div');
    title.className = 'gallery-item-title';
    title.textContent = imageData.title;

    const meta = document.createElement('div');
    meta.className = 'gallery-item-meta';

    const avatar = document.createElement('img');
    avatar.className = 'gallery-item-avatar';
    avatar.src = imageData.uploaderAvatar || 'https://via.placeholder.com/40';
    avatar.alt = imageData.uploaderName;

    const name = document.createElement('span');
    name.textContent = imageData.uploaderName;

    const likes = document.createElement('div');
    likes.className = 'gallery-item-likes';
    likes.innerHTML = `❤️ ${imageData.likes || 0}`;

    meta.appendChild(avatar);
    meta.appendChild(name);
    meta.appendChild(likes);

    overlay.appendChild(title);
    overlay.appendChild(meta);

    item.appendChild(img);
    item.appendChild(overlay);

    item.addEventListener('click', () => {
        openFullView(imageData);
    });

    galleryGrid.appendChild(item);
}

// ===========================
// Full View Modal
// ===========================
function openFullView(imageData) {
    currentViewingImageId = imageData.id;

    fullViewImage.src = imageData.imageUrl;
    fullViewTitle.textContent = imageData.title;
    uploaderName.textContent = imageData.uploaderName;
    uploaderAvatar.src = imageData.uploaderAvatar || 'https://via.placeholder.com/40';
    likeCount.textContent = imageData.likes || 0;

    // Format upload date
    const uploadDate_el = new Date(imageData.uploadedAt?.toDate?.() || new Date());
    uploadDate.textContent = formatDate(uploadDate_el);

    // Check if user has liked this image
    const hasLiked = imageData.likedBy?.includes(currentUser.uid);
    if (hasLiked) {
        likeBtn.classList.add('liked');
    } else {
        likeBtn.classList.remove('liked');
    }

    fullViewModal.classList.remove('hidden');
}

closeFullViewBtn.addEventListener('click', () => {
    fullViewModal.classList.add('hidden');
});

fullViewModal.addEventListener('click', (e) => {
    if (e.target === fullViewModal) {
        fullViewModal.classList.add('hidden');
    }
});

// ===========================
// Like Functionality
// ===========================
if (likeBtn) {
    likeBtn.addEventListener('click', async () => {
        if (!currentViewingImageId) {
            console.error('No image selected');
            return;
        }

        if (!currentUser) {
            console.error('User not authenticated');
            return;
        }

        if (!db) {
            console.error('Database not initialized');
            return;
        }

        try {
            likeBtn.disabled = true;
            const imageDoc = await db.collection('gallery').doc(currentViewingImageId).get();
            
            if (!imageDoc.exists) {
                console.error('Image not found');
                likeBtn.disabled = false;
                return;
            }

            const imageData = imageDoc.data();
            const likedBy = imageData.likedBy || [];
            const hasLiked = likedBy.includes(currentUser.uid);

            if (hasLiked) {
                // Unlike
                await db.collection('gallery').doc(currentViewingImageId).update({
                    likes: Math.max(0, (imageData.likes || 0) - 1),
                    likedBy: likedBy.filter(uid => uid !== currentUser.uid)
                });
                likeBtn.classList.remove('liked');
                const newCount = Math.max(0, (imageData.likes || 0) - 1);
                likeCount.textContent = newCount;
                updateGalleryItemLikes(currentViewingImageId, newCount);
            } else {
                // Like
                await db.collection('gallery').doc(currentViewingImageId).update({
                    likes: (imageData.likes || 0) + 1,
                    likedBy: [...likedBy, currentUser.uid]
                });
                likeBtn.classList.add('liked');
                const newCount = (imageData.likes || 0) + 1;
                likeCount.textContent = newCount;
                updateGalleryItemLikes(currentViewingImageId, newCount);
            }
        } catch (error) {
            console.error('Error updating like:', error);
            alert('Failed to update like. Please try again.');
        } finally {
            likeBtn.disabled = false;
        }
    });
}

function updateGalleryItemLikes(imageId, newCount) {
    const galleryItem = galleryGrid.querySelector(`[data-image-id="${imageId}"]`);
    if (galleryItem) {
        const likesElement = galleryItem.querySelector('.gallery-item-likes');
        if (likesElement) {
            likesElement.innerHTML = `❤️ ${newCount}`;
        }
    }
}

// ===========================
// Download Functionality
// ===========================
if (downloadBtn) {
    downloadBtn.addEventListener('click', async () => {
        if (!currentViewingImageId) {
            console.error('No image selected');
            return;
        }

        if (!db) {
            console.error('Database not initialized');
            return;
        }

        try {
            downloadBtn.disabled = true;
            const imageDoc = await db.collection('gallery').doc(currentViewingImageId).get();
            
            if (!imageDoc.exists) {
                console.error('Image not found');
                downloadBtn.disabled = false;
                return;
            }

            const imageData = imageDoc.data();

            // For Cloudinary URLs, add download parameter
            let downloadUrl = imageData.imageUrl;
            if (downloadUrl.includes('cloudinary')) {
                downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
            }

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${imageData.title || 'image'}.jpg`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error downloading image:', error);
            alert('Failed to download image. Please try again.');
        } finally {
            downloadBtn.disabled = false;
        }
    });
}

// ===========================
// Infinite Scroll
// ===========================
window.addEventListener('scroll', () => {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        if (!isLoading && hasMore) {
            loadGallery();
        }
    }
});

// ===========================
// Utility Functions
// ===========================
function formatDate(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ago`;
    } else if (hours > 0) {
        return `${hours}h ago`;
    } else if (minutes > 0) {
        return `${minutes}m ago`;
    } else {
        return 'Just now';
    }
}
