// src/gui/ui_handler.js
// Logika frontend untuk UI Jarvis - Universal AI Agent

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const voiceBtn = document.getElementById('voiceBtn');
    const statusText = document.getElementById('statusText');
    const statusDot = document.querySelector('.status-dot');
    const aiOrb = document.getElementById('aiOrb');
    const cyberCanvas = document.getElementById('cyberCanvas');

    // ============ TITLE BAR CONTROLS ============
    document.getElementById('minimizeBtn').addEventListener('click', () => {
        if (window.jarvis) window.jarvis.minimizeWindow();
    });

    document.getElementById('maximizeBtn').addEventListener('click', () => {
        if (window.jarvis) window.jarvis.maximizeWindow();
    });

    document.getElementById('closeBtn').addEventListener('click', () => {
        if (window.jarvis) window.jarvis.closeWindow();
    });

    // ============ STATUS UPDATE LISTENER ============
    if (window.jarvis) {
        window.jarvis.onStatusUpdate((data) => {
            setStatus(data.text, data.state);
        });
        
        // Tandai window siap
        window.jarvis.windowReady();
    }

    // ============ SEND MESSAGE ============
    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        // Clear input
        userInput.value = '';

        // Add user message to chat
        addMessage(message, 'user');

        // Set status to thinking
        setStatus('Memproses...', 'thinking');

        try {
            let fullResponse = '';

            if (window.jarvis) {
                // Listen for stream tokens
                window.jarvis.onStreamToken((token) => {
                    fullResponse += token;
                    updateLastAiMessage(fullResponse);
                });

                // Send command with streaming
                const result = await window.jarvis.sendCommandStream(message);
                
                if (!result.success) {
                    addMessage(result.response || '❌ Maaf, terjadi kesalahan.', 'ai');
                }
            } else {
                // Fallback for non-Electron environment
                const response = await simulateAIResponse(message);
                addMessage(response, 'ai');
            }
        } catch (error) {
            console.error('Error:', error);
            addMessage('❌ Maaf, terjadi kesalahan komunikasi dengan AI.', 'ai');
        }

        // Set status back to idle
        setStatus('Menunggu perintah...', 'idle');
        scrollToBottom();
    }

    // Event listeners for send
    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // ============ VOICE INPUT ============
    voiceBtn.addEventListener('click', () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            addMessage('❌ Maaf, browser Anda tidak mendukung voice input.', 'ai');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'id-ID';
        recognition.interimResults = false;

        setStatus('Mendengarkan...', 'listening');
        aiOrb.classList.add('listening');

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            sendMessage();
        };

        recognition.onerror = (event) => {
            console.error('Voice error:', event.error);
            setStatus('Menunggu perintah...', 'idle');
            aiOrb.classList.remove('listening');
        };

        recognition.onend = () => {
            setStatus('Menunggu perintah...', 'idle');
            aiOrb.classList.remove('listening');
        };

        recognition.start();
    });

    // ============ ADD MESSAGE TO CHAT ============
    function addMessage(text, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.dataset.timestamp = Date.now();

        const icon = document.createElement('div');
        icon.className = 'message-icon';
        icon.textContent = type === 'user' ? '👤' : '◈';

        const content = document.createElement('div');
        content.className = 'message-content';
        
        // Format rich text: detect URLs and emojis
        content.innerHTML = formatMessage(text);

        messageDiv.appendChild(icon);
        messageDiv.appendChild(content);
        chatMessages.appendChild(messageDiv);

        scrollToBottom();
        return messageDiv;
    }

    // ============ FORMAT MESSAGE (Rich Text) ============
    function formatMessage(text) {
        if (!text) return '';
        
        // Escape HTML first
        let formatted = text.replace(/&/g, '&')
                            .replace(/</g, '<')
                            .replace(/>/g, '>');
        
        // Convert URLs to clickable links
        formatted = formatted.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="#" onclick="event.preventDefault(); if(window.jarvis) window.jarvis.openWeb(\'$1\'); return false;" style="color: #00d4ff; text-decoration: underline;">$1</a>'
        );
        
        // Convert **bold** to <strong>
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #00d4ff;">$1</strong>');
        
        // Convert newlines to <br>
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }

    // ============ UPDATE LAST AI MESSAGE (STREAMING) ============
    function updateLastAiMessage(text) {
        let lastMessage = chatMessages.querySelector('.ai-message:last-child');
        
        if (!lastMessage) {
            lastMessage = addMessage('', 'ai');
        }

        const content = lastMessage.querySelector('.message-content');
        if (content) {
            content.innerHTML = formatMessage(text);
        }

        scrollToBottom();
    }

    // ============ SET STATUS ============
    function setStatus(text, state) {
        statusText.textContent = text;
        
        const colors = {
            thinking: 'var(--secondary)',
            listening: 'var(--accent)',
            idle: 'var(--primary)'
        };
        const color = colors[state] || 'var(--primary)';
        
        statusDot.style.background = color;
        statusDot.style.boxShadow = `0 0 8px ${color}`;

        // Update orb state
        aiOrb.className = 'ai-orb';
        if (state === 'thinking') aiOrb.classList.add('thinking');
        if (state === 'listening') aiOrb.classList.add('listening');
    }

    // ============ SCROLL TO BOTTOM ============
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // ============ CYBER CANVAS (Background Animation) ============
    function initCanvas() {
        const ctx = cyberCanvas.getContext('2d');
        let width, height, particles = [];
        const particleCount = 80;

        function resize() {
            width = cyberCanvas.width = window.innerWidth;
            height = cyberCanvas.height = window.innerHeight;
        }

        class Particle {
            constructor() {
                this.reset();
            }

            reset() {
                this.x = Math.random() * width;
                this.y = Math.random() * height;
                this.size = Math.random() * 2 + 0.5;
                this.speedX = (Math.random() - 0.5) * 0.5;
                this.speedY = (Math.random() - 0.5) * 0.5;
                this.opacity = Math.random() * 0.5 + 0.2;
                this.color = Math.random() > 0.5 ? '#00d4ff' : '#ff0066';
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;

                if (this.x < 0 || this.x > width || 
                    this.y < 0 || this.y > height) {
                    this.reset();
                }
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.opacity;
                ctx.fill();
            }
        }

        function connectParticles() {
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 150) {
                        ctx.beginPath();
                        ctx.strokeStyle = '#00d4ff';
                        ctx.globalAlpha = (1 - distance / 150) * 0.15;
                        ctx.lineWidth = 0.5;
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);
            
            particles.forEach(particle => {
                particle.update();
                particle.draw();
            });

            connectParticles();

            requestAnimationFrame(animate);
        }

        resize();
        window.addEventListener('resize', resize);

        for (let i = 0; i < particleCount; i++) {
            particles.push(new Particle());
        }

        animate();
    }

    // Initialize canvas
    initCanvas();

    // ============ FALLBACK SIMULATED AI (Non-Electron) ============
    async function simulateAIResponse(input) {
        const lowerInput = input.toLowerCase();
        
        // Simulasi intent detection seperti di agent.js
        if (lowerInput.includes('buka') && (lowerInput.includes('.com') || lowerInput.includes('.org') || lowerInput.includes('.net'))) {
            return `🌐 Membuka website... (fungsi browser akan aktif di Electron)`;
        } else if (lowerInput.includes('cari') && (lowerInput.includes('internet') || lowerInput.includes('google') || lowerInput.includes('web'))) {
            return `🔍 Mencari informasi... (fungsi search akan aktif di Electron)`;
        } else if (lowerInput.includes('putar') && (lowerInput.includes('musik') || lowerInput.includes('lagu'))) {
            return `🎵 Memutar musik... (fungsi YouTube Music akan aktif di Electron)`;
        } else if (lowerInput.includes('putar') && lowerInput.includes('video') || lowerInput.includes('tonton')) {
            return `🎬 Memutar video... (fungsi YouTube akan aktif di Electron)`;
        } else if (lowerInput.includes('halo') || lowerInput.includes('hai') || lowerInput.includes('hello')) {
            return 'Halo! Saya Jarvis, AI Agent universal Anda. Saya bisa:\n\n🌐 **Buka & Baca Website**\n🔍 **Cari Informasi di Internet**\n🎵 **Putar Musik YouTube Music**\n🎬 **Putar Video YouTube**\n💬 **Chat & Ingat Konteks**\n\nAda yang bisa saya bantu?';
        } else if (lowerInput.includes('siapa') && lowerInput.includes('kamu')) {
            return 'Saya **JARVIS** — Just A Rather Very Intelligent System.\nAsisten AI pribadi Anda yang berjalan di model lokal Ollama (qwen2.5:7b).\n\nSaya bisa mengakses web, memutar musik/video YouTube, dan chat dengan memori konteks!';
        } else {
            return `Saya menerima: "${input}"\n\n💡 Untuk menggunakan semua fitur, jalankan aplikasi di Electron dengan Ollama aktif.\n\nSaya bisa:\n• Buka website: "buka google.com"\n• Cari info: "cari berita terbaru"\n• Putar musik: "putar lagu bohemian rhapsody"\n• Putar video: "putar video tutorial"\n• Chat biasa: "halo, apa kabar?"`;
        }
    }

    console.log('🚀 JARVIS Universal AI Agent UI initialized!');
    console.log('📋 Available: Web Browsing, Web Search, YouTube Music, YouTube Video, AI Chat');
});