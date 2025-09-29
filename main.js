class InfiniteJourney {
    constructor() {
        this.room = new WebsimSocket();
        this.segments = [];
        this.currentSegmentIndex = 0;
        this.isPlaying = false;
        this.isLive = true;
        this.segmentDuration = 5000; // 5 seconds per segment
        this.playStartTime = 0;
        this.pausedAt = 0;
        
        this.canvas = document.getElementById('videoCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.initializeElements();
        this.modelChoice = localStorage.getItem('modelChoice') || 'flux-schnell';
        this.initializeEventListeners();
        this.loadSegments();
        this.startPlaybackLoop();
    }

    initializeElements() {
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.beginningBtn = document.getElementById('beginningBtn');
        this.liveBtn = document.getElementById('liveBtn');
        this.syncBtn = document.getElementById('syncBtn');
        this.addBtn = document.getElementById('addBtn');
        this.progressFill = document.getElementById('progressFill');
        this.timeDisplay = document.getElementById('timeDisplay');
        this.segmentsList = document.getElementById('segmentsList');
        this.addModal = document.getElementById('addModal');
        this.settingsModal = document.getElementById('settingsModal');
        this.settingsBtn = document.getElementById('settingsBtn');
        this.loadingOverlay = document.getElementById('loadingOverlay');
    }

    initializeEventListeners() {
        this.playBtn.addEventListener('click', () => this.play());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.beginningBtn.addEventListener('click', () => this.goToBeginning());
        this.liveBtn.addEventListener('click', () => this.goToLive());
        this.syncBtn.addEventListener('click', () => this.sync());
        this.addBtn.addEventListener('click', () => this.openAddModal());
        this.settingsBtn.addEventListener('click', () => this.openSettingsModal());
        
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeAddModal());
        document.getElementById('generateBtn').addEventListener('click', () => this.generateAndAdd());
        
        // Subscribe to segment updates
        this.room.collection('journey_segment').subscribe((segments) => {
            this.segments = segments.reverse(); // newest first, but we want oldest first for playback
            this.updateTimeline();
            if (this.isLive) {
                this.currentSegmentIndex = Math.max(0, this.segments.length - 1);
            }
        });
    }

    async loadSegments() {
        // Initial load
        this.segments = this.room.collection('journey_segment').getList().reverse();
        this.updateTimeline();
        
        // If no segments exist, create the first one
        if (this.segments.length === 0) {
            await this.createFirstSegment();
        }
        
        this.currentSegmentIndex = Math.max(0, this.segments.length - 1);
        this.hideLoading();
    }

    async createFirstSegment() {
        const statusEl = document.querySelector('.loading-content p');
        statusEl.textContent = 'Creating the beginning of the journey...';
        
        try {
            const imageResult = await websim.imageGen({
                prompt: "A serene landscape at dawn, the beginning of an infinite journey, mystical and inviting, digital art",
                aspect_ratio: "1:1"
            });
            
            const audioResult = await websim.textToSpeech({
                text: "And so begins the infinite journey, where every moment creates the next...",
                voice: "en-female"
            });
            
            await this.room.collection('journey_segment').create({
                image_url: imageResult.url,
                audio_url: audioResult.url,
                prompt: "The beginning of the infinite journey",
                speech_text: "And so begins the infinite journey, where every moment creates the next...",
                order: 0
            });
        } catch (error) {
            console.error('Error creating first segment:', error);
        }
    }

    play() {
        this.isPlaying = true;
        this.playStartTime = Date.now() - this.pausedAt;
        this.playBtn.style.display = 'none';
        this.pauseBtn.style.display = 'inline-block';
    }

    pause() {
        this.isPlaying = false;
        this.pausedAt = Date.now() - this.playStartTime;
        this.playBtn.style.display = 'inline-block';
        this.pauseBtn.style.display = 'none';
    }

    goToBeginning() {
        this.isLive = false;
        this.currentSegmentIndex = 0;
        this.playStartTime = Date.now();
        this.pausedAt = 0;
        this.liveBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    }

    goToLive() {
        this.isLive = true;
        this.currentSegmentIndex = Math.max(0, this.segments.length - 1);
        this.playStartTime = Date.now();
        this.pausedAt = 0;
        this.liveBtn.style.background = '#ff4444';
    }

    sync() {
        this.segments = this.room.collection('journey_segment').getList().reverse();
        this.updateTimeline();
        if (this.isLive) {
            this.currentSegmentIndex = Math.max(0, this.segments.length - 1);
        }
    }

    startPlaybackLoop() {
        setInterval(() => {
            this.updatePlayback();
        }, 100);
    }

    updatePlayback() {
        if (!this.segments.length) return;

        if (this.isPlaying) {
            const elapsed = Date.now() - this.playStartTime;
            const currentSegment = Math.floor(elapsed / this.segmentDuration);
            
            if (!this.isLive && currentSegment < this.segments.length) {
                this.currentSegmentIndex = currentSegment;
            } else if (this.isLive) {
                this.currentSegmentIndex = Math.max(0, this.segments.length - 1);
            }
        }

        this.renderCurrentSegment();
        this.updateProgress();
        this.updateTimeDisplay();
        this.highlightCurrentSegment();
    }

    async renderCurrentSegment() {
        if (!this.segments[this.currentSegmentIndex]) return;

        const segment = this.segments[this.currentSegmentIndex];
        
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            };
            img.src = segment.image_url;
            
            // Play audio for current segment
            if (this.isPlaying && segment.audio_url) {
                this.playSegmentAudio(segment);
            }
        } catch (error) {
            console.error('Error rendering segment:', error);
        }
    }

    playSegmentAudio(segment) {
        if (this.currentAudio) {
            this.currentAudio.pause();
        }
        
        this.currentAudio = new Audio(segment.audio_url);
        this.currentAudio.volume = 0.7;
        this.currentAudio.play().catch(e => console.log('Audio play failed:', e));
    }

    updateProgress() {
        if (!this.segments.length) return;
        
        const progress = (this.currentSegmentIndex + 1) / this.segments.length * 100;
        this.progressFill.style.width = `${Math.min(progress, 100)}%`;
    }

    updateTimeDisplay() {
        this.timeDisplay.textContent = `${this.currentSegmentIndex + 1} / ${this.segments.length}`;
    }

    updateTimeline() {
        this.segmentsList.innerHTML = '';
        
        this.segments.forEach((segment, index) => {
            const item = document.createElement('div');
            item.className = 'segment-item';
            item.innerHTML = `
                <div class="username">${segment.username}</div>
                <div class="prompt">${segment.prompt}</div>
            `;
            
            item.addEventListener('click', () => {
                this.currentSegmentIndex = index;
                this.isLive = false;
                this.playStartTime = Date.now() - (index * this.segmentDuration);
                this.pausedAt = 0;
                this.liveBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            });
            
            this.segmentsList.appendChild(item);
        });
    }

    highlightCurrentSegment() {
        const items = this.segmentsList.querySelectorAll('.segment-item');
        items.forEach((item, index) => {
            item.classList.toggle('active', index === this.currentSegmentIndex);
        });
    }

    async openAddModal() {
        if (this.segments.length === 0) return;
        
        const lastSegment = this.segments[this.segments.length - 1];
        
        document.getElementById('contextImage').src = lastSegment.image_url;
        document.getElementById('contextText').textContent = lastSegment.prompt;
        document.getElementById('promptInput').value = '';
        document.getElementById('speechInput').value = '';
        
        this.addModal.style.display = 'flex';
    }

    closeAddModal() {
        this.addModal.style.display = 'none';
    }

    async openSettingsModal() {
        document.getElementById('modelFlux').checked = this.modelChoice === 'flux-schnell';
        document.getElementById('modelNano').checked = this.modelChoice === 'nano-banana';
        this.settingsModal.style.display = 'flex';
    }

    closeSettingsModal() {
        this.settingsModal.style.display = 'none';
    }

    async urlToDataUrl(url) {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async generateAndAdd() {
        const prompt = document.getElementById('promptInput').value.trim();
        const speechText = document.getElementById('speechInput').value.trim();
        
        if (!prompt) {
            alert('Please describe what happens next in the journey');
            return;
        }

        const generateBtn = document.getElementById('generateBtn');
        const statusEl = document.getElementById('generationStatus');
        
        generateBtn.disabled = true;
        statusEl.style.display = 'block';
        statusEl.textContent = 'Generating your addition to the journey...';

        try {
            const lastSegment = this.segments[this.segments.length - 1];
            const contextPrompt = `Continuing from "${lastSegment.prompt}", now: ${prompt}. Digital art, cinematic, high quality`;
            statusEl.textContent = 'Creating visual (10 seconds)...';
            let imageParams = { prompt: contextPrompt, aspect_ratio: "1:1" };
            if (this.modelChoice === 'nano-banana') {
                statusEl.textContent = 'Analyzing previous frame...';
                const prevDataUrl = await this.urlToDataUrl(lastSegment.image_url);
                imageParams = { prompt: `${contextPrompt} — maintain visual continuity`, aspect_ratio: "1:1", image_inputs: [{ url: prevDataUrl }] };
            }
            const imageResult = await websim.imageGen(imageParams);
            
            let audioResult = null;
            if (speechText) {
                statusEl.textContent = 'Creating narration...';
                audioResult = await websim.textToSpeech({
                    text: speechText,
                    voice: "en-female"
                });
            }
            
            statusEl.textContent = 'Adding to the infinite journey...';
            await this.room.collection('journey_segment').create({
                image_url: imageResult.url,
                audio_url: audioResult?.url || null,
                prompt: prompt,
                speech_text: speechText || null,
                order: this.segments.length
            });
            
            this.closeAddModal();
            this.goToLive(); // Jump to the new segment
            
        } catch (error) {
            console.error('Error generating segment:', error);
            statusEl.textContent = 'Error generating content. Please try again.';
        } finally {
            generateBtn.disabled = false;
        }
    }

    hideLoading() {
        this.loadingOverlay.style.display = 'none';
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    new InfiniteJourney();
});