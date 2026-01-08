// ===========================
// Voice Messaging System
// ===========================

class VoiceMessenger {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.recordingStartTime = null;
        this.recordingTimer = null;
        this.audioBlob = null;
        this.audioUrl = null;
        this.recordingDuration = 0;
        this.maxRecordingDuration = 120000; // 2 minutes max
        this.waveformCanvas = null;
        this.analyser = null;
        this.animationId = null;
        this.audioContext = null;
        this.stream = null;
    }

    /**
     * Initialize voice recording UI and event listeners
     */
    async initializeVoiceUI() {
        // Create recording modal if it doesn't exist
        if (!document.getElementById('voice-recording-modal')) {
            this.createRecordingModal();
        }

        // Add voice button to media menu
        const voiceButton = document.querySelector('[data-action="voice"]');
        if (voiceButton) {
            voiceButton.addEventListener('click', () => this.startRecordingUI());
        }
    }

    /**
     * Create the voice recording modal UI
     */
    createRecordingModal() {
        const modal = document.createElement('div');
        modal.id = 'voice-recording-modal';
        modal.className = 'voice-recording-modal hidden';
        modal.innerHTML = `
            <div class="voice-recording-container">
                <div class="voice-recording-header">
                    <h3>Record Voice Message</h3>
                    <button class="voice-close-btn" aria-label="Close">×</button>
                </div>

                <div class="voice-recording-content">
                    <!-- Recording Phase -->
                    <div class="voice-recording-phase">
                        <div class="voice-waveform-container">
                            <canvas id="voice-waveform" class="voice-waveform" width="300" height="80"></canvas>
                        </div>

                        <div class="voice-recording-controls">
                            <button id="voice-record-btn" class="voice-btn voice-record-btn" title="Press and hold to record">
                                <svg class="voice-btn-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                    <line x1="12" y1="19" x2="12" y2="23"></line>
                                    <line x1="8" y1="23" x2="16" y2="23"></line>
                                </svg>
                            </button>
                        </div>

                        <div class="voice-recording-timer">
                            <span id="voice-timer">0:00</span>
                        </div>

                        <div class="voice-recording-hint">
                            <p>Press and hold to record</p>
                            <p class="voice-hint-secondary">Release to stop</p>
                        </div>
                    </div>

                    <!-- Review Phase -->
                    <div class="voice-review-phase hidden">
                        <div class="voice-player-container">
                            <button id="voice-play-btn" class="voice-play-btn" title="Play">
                                <svg class="voice-play-icon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                            </button>
                            <div class="voice-progress-bar">
                                <div class="voice-progress-fill"></div>
                                <input type="range" id="voice-progress-slider" class="voice-progress-slider" min="0" max="100" value="0">
                            </div>
                            <span id="voice-duration" class="voice-duration">0:00</span>
                        </div>

                        <div class="voice-waveform-review">
                            <canvas id="voice-waveform-review" class="voice-waveform-review-canvas" width="300" height="60"></canvas>
                        </div>

                        <div class="voice-review-actions">
                            <button id="voice-re-record-btn" class="voice-btn voice-secondary-btn" title="Re-record">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                                    <path d="M21 3v5h-5"></path>
                                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                                    <path d="M3 21v-5h5"></path>
                                </svg>
                                Re-record
                            </button>
                            <button id="voice-send-btn" class="voice-btn voice-primary-btn" title="Send">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Send
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Setup event listeners
        this.setupModalEventListeners();
    }

    /**
     * Setup event listeners for the recording modal
     */
    setupModalEventListeners() {
        const modal = document.getElementById('voice-recording-modal');
        const closeBtn = modal.querySelector('.voice-close-btn');
        const recordBtn = document.getElementById('voice-record-btn');
        const playBtn = document.getElementById('voice-play-btn');
        const reRecordBtn = document.getElementById('voice-re-record-btn');
        const sendBtn = document.getElementById('voice-send-btn');
        const progressSlider = document.getElementById('voice-progress-slider');

        // Close button
        closeBtn.addEventListener('click', () => this.closeRecordingModal());

        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeRecordingModal();
            }
        });

        // Record button - press and hold
        recordBtn.addEventListener('mousedown', () => this.startRecording());
        recordBtn.addEventListener('mouseup', () => this.stopRecording());
        recordBtn.addEventListener('mouseleave', () => {
            if (this.isRecording) this.stopRecording();
        });

        // Touch support for mobile
        recordBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.startRecording();
        });
        recordBtn.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.stopRecording();
        });

        // Play button
        playBtn.addEventListener('click', () => this.togglePlayback());

        // Re-record button
        reRecordBtn.addEventListener('click', () => this.resetRecording());

        // Send button
        sendBtn.addEventListener('click', () => this.sendVoiceMessage());

        // Progress slider
        progressSlider.addEventListener('input', (e) => {
            if (this.audioContext && this.audioContext.state === 'running') {
                const audio = this.getAudioElement();
                if (audio) {
                    audio.currentTime = (e.target.value / 100) * audio.duration;
                }
            }
        });
    }

    /**
     * Start recording phase
     */
    async startRecordingUI() {
        const modal = document.getElementById('voice-recording-modal');
        modal.classList.remove('hidden');

        // Reset state
        this.audioChunks = [];
        this.audioBlob = null;
        this.audioUrl = null;
        this.recordingDuration = 0;

        // Show recording phase
        modal.querySelector('.voice-recording-phase').classList.remove('hidden');
        modal.querySelector('.voice-review-phase').classList.add('hidden');

        // Request microphone access
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.setupAudioContext();
        } catch (error) {
            console.error('Microphone access denied:', error);
            alert('Microphone access is required to record voice messages.');
            this.closeRecordingModal();
        }
    }

    /**
     * Setup audio context for waveform visualization
     */
    setupAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        const source = this.audioContext.createMediaStreamSource(this.stream);
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);
    }

    /**
     * Start recording
     */
    async startRecording() {
        if (this.isRecording) return;

        try {
            this.isRecording = true;
            this.audioChunks = [];
            this.recordingStartTime = Date.now();
            this.recordingDuration = 0;

            // Create MediaRecorder
            const mimeType = this.getSupportedMimeType();
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.audioBlob = new Blob(this.audioChunks, { type: mimeType });
                this.audioUrl = URL.createObjectURL(this.audioBlob);
                this.showReviewPhase();
            };

            this.mediaRecorder.start();

            // Update timer
            this.recordingTimer = setInterval(() => {
                this.recordingDuration = Date.now() - this.recordingStartTime;
                this.updateRecordingTimer();

                // Auto-stop at max duration
                if (this.recordingDuration >= this.maxRecordingDuration) {
                    this.stopRecording();
                }
            }, 100);

            // Start waveform animation
            this.animateWaveform();

            // Update button state
            const recordBtn = document.getElementById('voice-record-btn');
            recordBtn.classList.add('recording');
        } catch (error) {
            console.error('Error starting recording:', error);
            this.isRecording = false;
        }
    }

    /**
     * Stop recording
     */
    stopRecording() {
        if (!this.isRecording) return;

        this.isRecording = false;

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
        }

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // Update button state
        const recordBtn = document.getElementById('voice-record-btn');
        recordBtn.classList.remove('recording');
    }

    /**
     * Get supported MIME type for audio recording
     */
    getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/mp4',
            'audio/ogg'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return 'audio/webm'; // Fallback
    }

    /**
     * Update recording timer display
     */
    updateRecordingTimer() {
        const timerEl = document.getElementById('voice-timer');
        if (timerEl) {
            timerEl.textContent = this.formatTime(this.recordingDuration);
        }
    }

    /**
     * Animate waveform during recording
     */
    animateWaveform() {
        const canvas = document.getElementById('voice-waveform');
        if (!canvas || !this.analyser) return;

        const ctx = canvas.getContext('2d');
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            this.animationId = requestAnimationFrame(draw);

            this.analyser.getByteFrequencyData(dataArray);

            // Clear canvas
            ctx.fillStyle = 'rgba(30, 30, 30, 1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw waveform
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = (dataArray[i] / 255) * canvas.height;

                // Gradient color
                const hue = (i / bufferLength) * 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }
        };

        draw();
    }

    /**
     * Show review phase
     */
    showReviewPhase() {
        const modal = document.getElementById('voice-recording-modal');
        modal.querySelector('.voice-recording-phase').classList.add('hidden');
        modal.querySelector('.voice-review-phase').classList.remove('hidden');

        // Update duration display
        const durationEl = document.getElementById('voice-duration');
        durationEl.textContent = this.formatTime(this.recordingDuration);

        // Draw waveform in review
        this.drawReviewWaveform();
    }

    /**
     * Draw waveform in review phase
     */
    drawReviewWaveform() {
        const canvas = document.getElementById('voice-waveform-review');
        if (!canvas || !this.audioUrl) return;

        const ctx = canvas.getContext('2d');
        const audio = new Audio(this.audioUrl);

        audio.onloadedmetadata = () => {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;

            const source = audioContext.createMediaElementAudioSource(audio);
            source.connect(analyser);
            analyser.connect(audioContext.destination);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            // Clear canvas
            ctx.fillStyle = 'rgba(30, 30, 30, 1)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw waveform
            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;

            analyser.getByteFrequencyData(dataArray);

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height;

                const hue = (i / bufferLength) * 360;
                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }
        };
    }

    /**
     * Toggle playback
     */
    togglePlayback() {
        const audio = this.getAudioElement();
        if (!audio) return;

        const playBtn = document.getElementById('voice-play-btn');
        const playIcon = playBtn.querySelector('.voice-play-icon');

        if (audio.paused) {
            audio.play();
            // Change to pause icon
            playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
            this.updateProgressBar();
        } else {
            audio.pause();
            // Change to play icon
            playIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
        }
    }

    /**
     * Get or create audio element for playback
     */
    getAudioElement() {
        let audio = document.getElementById('voice-playback-audio');
        if (!audio) {
            audio = document.createElement('audio');
            audio.id = 'voice-playback-audio';
            audio.src = this.audioUrl;
            document.body.appendChild(audio);

            // Update progress bar on time update
            audio.addEventListener('timeupdate', () => {
                this.updateProgressBar();
            });

            // Reset play button when finished
            audio.addEventListener('ended', () => {
                const playBtn = document.getElementById('voice-play-btn');
                const playIcon = playBtn.querySelector('.voice-play-icon');
                playIcon.textContent = '▶';
            });
        }
        return audio;
    }

    /**
     * Update progress bar
     */
    updateProgressBar() {
        const audio = this.getAudioElement();
        const slider = document.getElementById('voice-progress-slider');

        if (audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            slider.value = progress;

            // Update progress fill
            const progressFill = document.querySelector('.voice-progress-fill');
            if (progressFill) {
                progressFill.style.width = progress + '%';
            }
        }
    }

    /**
     * Reset recording (re-record)
     */
    resetRecording() {
        // Stop playback
        const audio = document.getElementById('voice-playback-audio');
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }

        // Reset state
        this.audioBlob = null;
        this.audioUrl = null;
        this.recordingDuration = 0;
        this.audioChunks = [];

        // Show recording phase
        const modal = document.getElementById('voice-recording-modal');
        modal.querySelector('.voice-recording-phase').classList.remove('hidden');
        modal.querySelector('.voice-review-phase').classList.add('hidden');

        // Reset timer
        document.getElementById('voice-timer').textContent = '0:00';
    }

    /**
     * Send voice message
     */
    async sendVoiceMessage() {
        if (!this.audioBlob) {
            alert('No recording to send');
            return;
        }

        try {
            // Show loading state
            const sendBtn = document.getElementById('voice-send-btn');
            sendBtn.disabled = true;
            sendBtn.textContent = '⏳ Uploading...';

            // Upload to Cloudinary
            const voiceUrl = await this.uploadVoiceMessage(this.audioBlob);

            // Send message through main chat system
            if (window.sendVoiceMessage) {
                await window.sendVoiceMessage(voiceUrl, this.recordingDuration);
            }

            // Close modal
            this.closeRecordingModal();

            // Reset state
            this.audioBlob = null;
            this.audioUrl = null;
            this.recordingDuration = 0;
        } catch (error) {
            console.error('Error sending voice message:', error);
            alert('Failed to send voice message. Please try again.');
        } finally {
            const sendBtn = document.getElementById('voice-send-btn');
            sendBtn.disabled = false;
            sendBtn.textContent = '✓ Send';
        }
    }

    /**
     * Upload voice message to Cloudinary
     */
    async uploadVoiceMessage(audioBlob) {
        const formData = new FormData();
        formData.append('file', audioBlob, 'voice-message.webm');
        formData.append('upload_preset', window.CLOUDINARY_UPLOAD_PRESET || 'chat123');
        formData.append('resource_type', 'auto');

        const response = await fetch(
            `https://api.cloudinary.com/v1_1/${window.CLOUDINARY_CLOUD_NAME || 'dxhn3fzfu'}/upload`,
            {
                method: 'POST',
                body: formData
            }
        );

        if (!response.ok) {
            throw new Error('Failed to upload voice message');
        }

        const data = await response.json();
        return data.secure_url;
    }

    /**
     * Close recording modal
     */
    closeRecordingModal() {
        // Stop recording if active
        if (this.isRecording) {
            this.stopRecording();
        }

        // Stop playback
        const audio = document.getElementById('voice-playback-audio');
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }

        // Close stream
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        // Hide modal
        const modal = document.getElementById('voice-recording-modal');
        modal.classList.add('hidden');
    }

    /**
     * Format time in MM:SS
     */
    formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

// Initialize voice messenger
const voiceMessenger = new VoiceMessenger();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        voiceMessenger.initializeVoiceUI();
    });
} else {
    voiceMessenger.initializeVoiceUI();
}
