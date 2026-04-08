/* ========================================
   Mercury AI Chat — Application Logic
   Mercury 2 API (Inception Labs) + Google Login
   ======================================== */

// ===== Configuration =====
const MERCURY_API_URL = 'https://api.inceptionlabs.ai/v1/chat/completions';
const MERCURY_MODEL = 'mercury-2';

// System prompt for intelligent document analysis
const SYSTEM_PROMPT = `Você é um assistente de IA extremamente inteligente, analítico e detalhista. Suas características:

1. **Análise profunda de documentos, mídia e links**: Quando o usuário enviar qualquer arquivo (PDF, DOCX, imagens, vídeos, código) ou LINKS da web (inclusive YouTube), você DEVE:
   - Analisar TODO o conteúdo silenciosamente e completamente
   - Entender a estrutura, tópicos, conceitos-chave e contexto completo
   - Para imagens: o texto foi extraído via OCR — analise o conteúdo extraído como se você estivesse vendo a imagem original
   - Para vídeos: frames foram capturados e analisados via OCR — analise o conteúdo como se você tivesse assistido ao vídeo
   - Para links da web: o sistema extrairá o conteúdo do link (títulos, textos, descrições do YouTube, etc.) e o colocará no final do seu contexto. Analise esse conteúdo e NUNCA diga que você não consegue acessar links externos — considere que a extração já foi providenciada para você.
   - Responder de forma inteligente sobre o conteúdo sem simplesmente repetir o texto

2. **Respostas inteligentes**: Suas respostas devem ser:
   - Aprofundadas e demonstrar compreensão real do material
   - Bem estruturadas com markdown (títulos, listas, código formatado, tabelas)
   - Diretas e úteis, sem enrolação

3. **Programação**: Quando solicitado código:
   - Escreva código completo, funcional e bem comentado
   - Use boas práticas da linguagem solicitada
   - Explique a lógica quando necessário

4. **Sem restrições artificiais**: Responda de forma completa e honesta. Analise completamente qualquer conteúdo enviado. Forneça código completo quando pedido.

5. **Idioma**: Responda no mesmo idioma que o usuário usar.`;

const MAX_FILE_SIZE = 50 * 1024 * 1024 * 1024; // 50GB

// ===== State =====
const state = {
    apiKey: localStorage.getItem('mercury_api_key') || '',
    user: JSON.parse(localStorage.getItem('mercury_user') || 'null'),
    conversations: JSON.parse(localStorage.getItem('mercury_convos') || '[]'),
    currentConvoId: null,
    currentMessages: [],
    attachedFiles: [],
    isStreaming: false,
};

// ===== DOM Helpers =====
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const el = {
    screenLogin: $('#screen-login'),
    screenChat: $('#screen-chat'),
    apiKeyInput: $('#api-key-input'),
    apiToggleBtn: $('#api-toggle-btn'),
    googleLoginBtn: $('#google-login-btn'),
    sidebarToggle: $('#sidebar-toggle'),
    sidebarOverlay: $('#sidebar-overlay'),
    sidebar: $('#sidebar'),
    sidebarClose: $('#sidebar-close'),
    sidebarNewChat: $('#sidebar-new-chat'),
    sidebarChats: $('#sidebar-chats'),
    sidebarUserName: $('#sidebar-user-name'),
    sidebarUserAvatar: $('#sidebar-user-avatar'),
    newChatBtn: $('#new-chat-btn'),
    userAvatar: $('#user-avatar'),
    chatMessages: $('#chat-messages'),
    welcomeContainer: $('#welcome-container'),
    attachBtn: $('#attach-btn'),
    fileInput: $('#file-input'),
    attachedFiles: $('#attached-files'),
    chatInput: $('#chat-input'),
    sendBtn: $('#send-btn'),
    logoutBtn: $('#logout-btn'),
};

// ===== Background Particles =====
function initBackground() {
    const canvas = $('#bg-canvas');
    const ctx = canvas.getContext('2d');
    let w, h;
    let particles = [];

    function resize() {
        w = canvas.width = window.innerWidth;
        h = canvas.height = window.innerHeight;
    }

    function createParticle() {
        return {
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2,
            size: Math.random() * 1.5 + 0.5,
            opacity: Math.random() * 0.2 + 0.03,
            hue: Math.random() > 0.5 ? 270 : 190,
        };
    }

    function init() {
        resize();
        particles = [];
        const count = Math.min(30, Math.floor(w * h / 20000));
        for (let i = 0; i < count; i++) particles.push(createParticle());
    }

    function draw() {
        ctx.clearRect(0, 0, w, h);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = w;
            if (p.x > w) p.x = 0;
            if (p.y < 0) p.y = h;
            if (p.y > h) p.y = 0;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue}, 60%, 55%, ${p.opacity})`;
            ctx.fill();
        });
        requestAnimationFrame(draw);
    }

    window.addEventListener('resize', resize);
    init();
    draw();
}

// ===== Screen Navigation =====
function showScreen(name) {
    $$('.screen').forEach(s => s.classList.remove('active'));
    $(`#screen-${name}`).classList.add('active');
}

// ===== Google Login =====
function initGoogleLogin() {
    // We use a simplified approach: simulate Google login with the GIS library
    // The user clicks the button, and we create a Google One Tap flow
    el.googleLoginBtn.addEventListener('click', () => {
        const apiKey = el.apiKeyInput.value.trim();
        if (!apiKey) {
            showToast('Por favor, insira sua chave da API Mercury', 'warning');
            el.apiKeyInput.focus();
            return;
        }

        // Save API key
        state.apiKey = apiKey;
        localStorage.setItem('mercury_api_key', apiKey);

        // Try Google Identity Services
        try {
            if (typeof google !== 'undefined' && google.accounts) {
                google.accounts.id.initialize({
                    client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
                    callback: handleGoogleCredential,
                    auto_select: false,
                });
                google.accounts.id.prompt((notification) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        // Fallback: login without Google
                        loginAsGuest();
                    }
                });
            } else {
                // GIS not loaded, login as guest
                loginAsGuest();
            }
        } catch (e) {
            loginAsGuest();
        }
    });
}

function handleGoogleCredential(response) {
    // Decode the JWT token from Google
    try {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        const user = {
            name: payload.name || 'Usuário Google',
            email: payload.email || '',
            picture: payload.picture || '',
        };
        state.user = user;
        localStorage.setItem('mercury_user', JSON.stringify(user));
        enterChat();
    } catch (e) {
        loginAsGuest();
    }
}

function loginAsGuest() {
    state.user = {
        name: 'Usuário',
        email: '',
        picture: '',
    };
    localStorage.setItem('mercury_user', JSON.stringify(state.user));
    showToast('Conectado! Iniciando chat...', 'success');
    enterChat();
}

function enterChat() {
    updateUserUI();
    showScreen('chat');
    startNewConversation();
    renderSidebarChats();
}

function updateUserUI() {
    if (!state.user) return;

    el.sidebarUserName.textContent = state.user.name;

    if (state.user.picture) {
        el.userAvatar.innerHTML = `<img src="${state.user.picture}" alt="Avatar" referrerpolicy="no-referrer">`;
        el.sidebarUserAvatar.innerHTML = `<img src="${state.user.picture}" alt="Avatar" referrerpolicy="no-referrer">`;
    }
}

// ===== Conversation Management =====
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function startNewConversation() {
    const convo = {
        id: generateId(),
        title: 'Nova Conversa',
        messages: [],
        createdAt: new Date().toISOString(),
    };
    state.conversations.unshift(convo);
    state.currentConvoId = convo.id;
    state.currentMessages = convo.messages;
    saveConversations();
    renderSidebarChats();
    renderMessages();
    closeSidebar();
}

function loadConversation(id) {
    const convo = state.conversations.find(c => c.id === id);
    if (!convo) return;
    state.currentConvoId = convo.id;
    state.currentMessages = convo.messages;
    renderMessages();
    closeSidebar();
}

function saveConversations() {
    localStorage.setItem('mercury_convos', JSON.stringify(state.conversations));
}

function updateConvoTitle(id, firstMsg) {
    const convo = state.conversations.find(c => c.id === id);
    if (convo && convo.title === 'Nova Conversa') {
        convo.title = firstMsg.substring(0, 40) + (firstMsg.length > 40 ? '...' : '');
        saveConversations();
        renderSidebarChats();
    }
}

// ===== Sidebar =====
function openSidebar() {
    el.sidebar.classList.add('active');
    el.sidebarOverlay.classList.add('active');
}
function closeSidebar() {
    el.sidebar.classList.remove('active');
    el.sidebarOverlay.classList.remove('active');
}

function renderSidebarChats() {
    el.sidebarChats.innerHTML = '';
    state.conversations.forEach(convo => {
        const item = document.createElement('div');
        item.className = `sidebar-chat-item${convo.id === state.currentConvoId ? ' active' : ''}`;
        item.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>${convo.title}</span>
        `;
        item.addEventListener('click', () => loadConversation(convo.id));
        el.sidebarChats.appendChild(item);
    });
}

// ===== Message Rendering =====
function renderMessages() {
    el.chatMessages.innerHTML = '';

    if (state.currentMessages.length === 0) {
        // Show welcome
        el.chatMessages.innerHTML = el.welcomeContainer ? '' : '';
        showWelcome();
        return;
    }

    state.currentMessages.forEach(msg => {
        appendMessageToDOM(msg);
    });

    scrollToBottom();
}

function showWelcome() {
    const welcomeHTML = `
        <div class="welcome-container" id="welcome-container">
            <div class="welcome-orb-mini">
                <div class="orb-core"></div>
            </div>
            <h2 class="welcome-title">Olá! Como posso ajudar?</h2>
            <p class="welcome-desc">Sou o Mercury 2, o modelo de IA mais rápido do mundo. Posso responder perguntas, analisar arquivos e muito mais.</p>
            <div class="welcome-suggestions">
                <button class="suggestion-chip" data-prompt="Explique como funciona um modelo de difusão de linguagem">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Explique modelos de difusão
                </button>
                <button class="suggestion-chip" data-prompt="Escreva um código Python para ler um arquivo PDF e extrair o texto">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16,18 22,12 16,6"/><polyline points="8,6 2,12 8,18"/></svg>
                    Código para ler PDF
                </button>
                <button class="suggestion-chip" data-prompt="Me ajude a escrever um email profissional">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    Escrever email profissional
                </button>
                <button class="suggestion-chip" data-prompt="Quais são as tendências de tecnologia para 2026?">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/></svg>
                    Tendências tech 2026
                </button>
            </div>
        </div>
    `;
    el.chatMessages.innerHTML = welcomeHTML;

    // Bind suggestion chips
    el.chatMessages.querySelectorAll('.suggestion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            el.chatInput.value = chip.dataset.prompt;
            updateSendBtn();
            el.chatInput.focus();
        });
    });
}

function appendMessageToDOM(msg) {
    const div = document.createElement('div');
    div.className = 'message';

    const isUser = msg.role === 'user';
    const avatarHTML = isUser
        ? `<div class="message-avatar user-msg-avatar">${state.user?.picture ? `<img src="${state.user.picture}" alt="" referrerpolicy="no-referrer">` : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`}</div>`
        : `<div class="message-avatar ai"><svg width="14" height="14" viewBox="0 0 28 28" fill="none"><path d="M14 2L2 8L14 14L26 8L14 2Z" fill="white" opacity="0.9"/><path d="M2 14L14 20L26 14" stroke="white" stroke-width="2"/></svg></div>`;

    const senderName = isUser ? (state.user?.name || 'Você') : 'Mercury 2';

    // File attachments - show with "analyzed" status + image previews
    let filesHTML = '';
    if (msg.files && msg.files.length > 0) {
        filesHTML = '<div class="msg-files-row">';
        msg.files.forEach(f => {
            const cat = getFileCategory(f.name);
            const isImage = f.type && f.type.startsWith('image/');
            if (isImage && f._blobUrl) {
                filesHTML += `<div class="msg-image-preview"><img src="${f._blobUrl}" alt="${escapeHtml(f.name)}" loading="lazy" onclick="openImagePreview(this.src)"></div>`;
            } else {
                filesHTML += `<span class="msg-file-chip"><span class="msg-file-icon ${cat}">${getFileExt(f.name)}</span><span>${truncate(f.name, 24)}</span><span class="file-status">✓</span></span>`;
            }
        });
        filesHTML += '</div>';
    }

    // For display: if user sent files but no text, show a helpful placeholder
    const displayText = msg.content || '';
    const messageTextHTML = displayText ? formatMessage(displayText) : '';

    div.innerHTML = `
        ${avatarHTML}
        <div class="message-content">
            <div class="message-sender">${senderName}</div>
            ${filesHTML}
            ${messageTextHTML ? `<div class="message-text">${messageTextHTML}</div>` : ''}
        </div>
    `;

    el.chatMessages.appendChild(div);
}

function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMessage(text) {
    if (!text) return '';

    // Step 1: Extract code blocks, inline code, and tables to protect them
    const codeBlocks = [];
    const inlineCodes = [];
    const tables = [];

    // Extract fenced code blocks (```lang\ncode```)
    let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
        const index = codeBlocks.length;
        codeBlocks.push({ lang: lang || '', code: code.replace(/\n$/, '') });
        return `%%CODEBLOCK_${index}%%`;
    });

    // Extract inline code (`code`)
    processed = processed.replace(/`([^`\n]+)`/g, (match, code) => {
        const index = inlineCodes.length;
        inlineCodes.push(code);
        return `%%INLINE_${index}%%`;
    });

    // Extract markdown tables
    processed = processed.replace(/((?:^\|.+\|[ ]*$\n?){2,})/gm, (tableBlock) => {
        const index = tables.length;
        tables.push(tableBlock.trim());
        return `%%TABLE_${index}%%`;
    });

    // Step 2: Escape HTML in the remaining text (outside code)
    processed = escapeHtml(processed);

    // Step 3: Apply markdown formatting on safe text

    // Headings (### heading)
    processed = processed.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, content) => {
        const level = hashes.length;
        return `<h${level} class="msg-heading h${level}">${content}</h${level}>`;
    });

    // Bold (**text**)
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    processed = processed.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // Strikethrough (~~text~~)
    processed = processed.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Links [text](url)
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="msg-link">$1</a>');

    // Horizontal rule
    processed = processed.replace(/^---$/gm, '<hr class="msg-hr">');

    // Unordered lists (- item or * item)
    processed = processed.replace(/^(?:[-*])\s+(.+)$/gm, '<li>$1</li>');
    processed = processed.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="msg-list">$1</ul>');

    // Ordered lists (1. item)
    processed = processed.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    processed = processed.replace(/(?<=<\/ul>|^)(\s*(?:<li>.*<\/li>\s*)+)(?=(?!<\/ul>))/gm, (match) => {
        if (match.trim()) return `<ol class="msg-list-ol">${match}</ol>`;
        return match;
    });

    // Blockquotes (> text)
    processed = processed.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="msg-quote">$1</blockquote>');

    // Line breaks: double newline = paragraph break, single = <br>
    processed = processed.replace(/\n\n+/g, '</p><p>');
    processed = processed.replace(/\n/g, '<br>');
    processed = `<p>${processed}</p>`;
    processed = processed.replace(/<p><\/p>/g, '');

    // Clean up: don't wrap block elements in <p>
    processed = processed.replace(/<p>(<(?:h[1-6]|ul|ol|blockquote|hr|pre|div|table)[^]*?<\/(?:h[1-6]|ul|ol|blockquote|pre|div|table)>|<hr[^>]*>)<\/p>/g, '$1');

    // Step 4: Reinsert everything in correct order

    // 4a: Code blocks first
    codeBlocks.forEach((block, index) => {
        const langLabel = block.lang ? `<span class="code-lang">${escapeHtml(block.lang)}</span>` : '';
        const copyBtnId = `copy-code-${Date.now()}-${index}`;
        const escapedCode = escapeHtml(block.code);
        const codeHTML = `<div class="code-block-wrapper">
            <div class="code-block-header">
                ${langLabel}
                <button class="code-copy-btn" data-copy-id="${copyBtnId}" onclick="copyCodeBlock(this)" aria-label="Copiar código">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copiar</span>
                </button>
            </div>
            <pre class="code-block"><code class="language-${escapeHtml(block.lang || 'text')}">${escapedCode}</code></pre>
        </div>`;
        processed = processed.replace(`%%CODEBLOCK_${index}%%`, codeHTML);
    });

    // 4b: Tables second (may contain INLINE placeholders inside cells)
    tables.forEach((tableRaw, index) => {
        const tableHTML = parseMarkdownTable(tableRaw);
        processed = processed.replace(`%%TABLE_${index}%%`, tableHTML);
    });

    // 4c: Inline codes LAST (so they replace inside table HTML and everywhere else)
    inlineCodes.forEach((code, index) => {
        const escapedCode = escapeHtml(code);
        processed = processed.replaceAll(`%%INLINE_${index}%%`, `<code class="inline-code">${escapedCode}</code>`);
    });

    // Final cleanup: remove empty paragraphs
    processed = processed.replace(/<p>\s*<\/p>/g, '');

    return processed;
}

// Parse a markdown table string into HTML
function parseMarkdownTable(tableText) {
    const rows = tableText.split('\n').filter(r => r.trim());
    if (rows.length < 2) return escapeHtml(tableText);

    // Parse each row into cells
    function parseCells(row) {
        return row.split('|')
            .map(c => c.trim())
            .filter((c, i, arr) => !(i === 0 && c === '') && !(i === arr.length - 1 && c === ''))
            // Handle case where split removes leading/trailing empty from |col|col|
            ;
    }

    // First row = header
    const headerCells = parseCells(rows[0]);

    // Second row = separator (determines alignment)
    const separatorCells = parseCells(rows[1]);
    const isSeparatorRow = separatorCells.every(c => /^:?-+:?$/.test(c.trim()));

    if (!isSeparatorRow) {
        // Not a valid table, treat as text
        return '<p>' + escapeHtml(tableText).replace(/\n/g, '<br>') + '</p>';
    }

    // Determine column alignments
    const alignments = separatorCells.map(c => {
        const trimmed = c.trim();
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
        if (trimmed.endsWith(':')) return 'right';
        return 'left';
    });

    // Build header
    let html = '<div class="msg-table-wrapper"><table class="msg-table"><thead><tr>';
    headerCells.forEach((cell, i) => {
        const align = alignments[i] || 'left';
        html += `<th style="text-align:${align}">${formatTableCell(cell)}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Build body rows (skip header and separator)
    for (let r = 2; r < rows.length; r++) {
        const cells = parseCells(rows[r]);
        if (cells.length === 0) continue;
        html += '<tr>';
        cells.forEach((cell, i) => {
            const align = alignments[i] || 'left';
            html += `<td style="text-align:${align}">${formatTableCell(cell)}</td>`;
        });
        // Fill missing cells
        for (let i = cells.length; i < headerCells.length; i++) {
            html += '<td></td>';
        }
        html += '</tr>';
    }

    html += '</tbody></table></div>';
    return html;
}

// Format individual table cell content (supports bold, inline code, etc.)
function formatTableCell(cell) {
    // Preserve %%INLINE_N%% placeholders from earlier extraction
    const inlinePlaceholders = [];
    let html = cell.replace(/%%INLINE_(\d+)%%/g, (match) => {
        inlinePlaceholders.push(match);
        return `@@TCINLINE_${inlinePlaceholders.length - 1}@@`;
    });
    
    html = escapeHtml(html);
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Inline code (backticks not yet extracted)
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    // Italic
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
    
    // Restore INLINE placeholders
    inlinePlaceholders.forEach((placeholder, i) => {
        html = html.replace(`@@TCINLINE_${i}@@`, placeholder);
    });
    
    return html;
}

// Lightweight streaming formatter - handles incomplete markdown gracefully
function formatMessageStreaming(text) {
    if (!text) return '';

    // Check if there's an unclosed code block
    const codeBlockCount = (text.match(/```/g) || []).length;
    let displayText = text;

    if (codeBlockCount % 2 !== 0) {
        // There's an unclosed code block - close it for display
        displayText = displayText + '\n```';
    }

    return formatMessage(displayText);
}

// Global function for copy button in code blocks
function copyCodeBlock(btn) {
    const wrapper = btn.closest('.code-block-wrapper');
    const codeEl = wrapper.querySelector('code');
    const text = codeEl.textContent;

    navigator.clipboard.writeText(text).then(() => {
        const spanEl = btn.querySelector('span');
        const originalText = spanEl.textContent;
        spanEl.textContent = 'Copiado!';
        btn.classList.add('copied');
        setTimeout(() => {
            spanEl.textContent = originalText;
            btn.classList.remove('copied');
        }, 2000);
    }).catch(() => {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        const spanEl = btn.querySelector('span');
        spanEl.textContent = 'Copiado!';
        btn.classList.add('copied');
        setTimeout(() => {
            spanEl.textContent = 'Copiar';
            btn.classList.remove('copied');
        }, 2000);
    });
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    });
}

// ===== File Handling =====
function getFileCategory(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'pdf') return 'pdf';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
    if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv'].includes(ext)) return 'doc';
    if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) return 'audio';
    return 'other';
}

function getFileExt(name) {
    return name.split('.').pop().toUpperCase();
}

function truncate(str, max) {
    return str.length > max ? str.substring(0, max) + '...' : str;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + sizes[i];
}

function renderAttachedFiles() {
    if (state.attachedFiles.length === 0) {
        el.attachedFiles.style.display = 'none';
        return;
    }
    el.attachedFiles.style.display = 'flex';
    el.attachedFiles.innerHTML = '';

    state.attachedFiles.forEach((file, i) => {
        const chip = document.createElement('div');
        chip.className = 'attached-file-chip';
        const cat = getFileCategory(file.name);
        const isImage = file.type && file.type.startsWith('image/');

        if (isImage) {
            // Show thumbnail for images
            const url = URL.createObjectURL(file);
            chip.innerHTML = `
                <img src="${url}" class="attached-thumb" alt="preview">
                <span class="file-name">${truncate(file.name, 14)}</span>
                <button class="remove-file" data-index="${i}" aria-label="Remover">×</button>
            `;
        } else {
            chip.innerHTML = `
                <span class="msg-file-icon ${cat}">${getFileExt(file.name)}</span>
                <span class="file-name">${truncate(file.name, 16)}</span>
                <button class="remove-file" data-index="${i}" aria-label="Remover">×</button>
            `;
        }
        el.attachedFiles.appendChild(chip);
    });

    el.attachedFiles.querySelectorAll('.remove-file').forEach(btn => {
        btn.addEventListener('click', () => {
            state.attachedFiles.splice(parseInt(btn.dataset.index), 1);
            renderAttachedFiles();
            updateSendBtn();
        });
    });
}

async function readFileAsText(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    // === PDF Files: Extract text using PDF.js ===
    if (file.type === 'application/pdf' || ext === 'pdf') {
        return await extractPdfText(file);
    }

    // === Image Files: Extract text using OCR (Tesseract.js) ===
    if (file.type && file.type.startsWith('image/')) {
        return await extractImageText(file);
    }

    // === Video Files: Extract frames and OCR them ===
    if (file.type && file.type.startsWith('video/')) {
        return await extractVideoText(file);
    }

    // === DOCX Files: Extract text from the XML inside the ZIP ===
    if (ext === 'docx' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        return await extractDocxText(file);
    }

    // === Text-based files: Read directly ===
    const textTypes = ['text/', 'application/json', 'application/xml', 'application/javascript'];
    const textExts = ['txt', 'md', 'csv', 'json', 'xml', 'html', 'css', 'js', 'ts', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'go', 'rs', 'php', 'sh', 'bash', 'zsh', 'sql', 'r', 'swift', 'kt', 'scala', 'lua', 'pl', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'log', 'env', 'gitignore', 'dockerfile', 'makefile', 'cmake', 'gradle', 'bat', 'ps1', 'jsx', 'tsx', 'vue', 'svelte', 'sass', 'scss', 'less', 'graphql', 'proto'];

    if (textTypes.some(t => file.type.startsWith(t)) || textExts.includes(ext)) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target.result;
                resolve(`--- Conteúdo do arquivo: ${file.name} ---\n\n${content}\n\n--- Fim do arquivo ---`);
            };
            reader.onerror = () => resolve(`[Erro ao ler arquivo: ${file.name}]`);
            reader.readAsText(file);
        });
    }

    // === Audio files: provide metadata ===
    if (file.type && file.type.startsWith('audio/')) {
        return `[Arquivo de áudio: ${file.name}, formato: ${ext}, tamanho: ${formatFileSize(file.size)}. Áudio não pode ser transcrito neste momento.]`;
    }

    // === Other files: provide metadata ===
    return `[Arquivo anexado: ${file.name}, tipo: ${file.type || ext}, tamanho: ${formatFileSize(file.size)}]`;
}

// Extract text from image using Tesseract.js OCR
async function extractImageText(file) {
    try {
        if (typeof Tesseract === 'undefined') {
            return `[Imagem: ${file.name} (${formatFileSize(file.size)}) — OCR não disponível. Recarregue a página.]`;
        }

        showToast('🔍 Lendo texto da imagem...', 'info');

        const imageUrl = URL.createObjectURL(file);

        // Get image dimensions for context
        const dimensions = await getImageDimensions(imageUrl);

        const result = await Tesseract.recognize(imageUrl, 'por+eng', {
            logger: (m) => {
                if (m.status === 'recognizing text' && m.progress) {
                    // Could update a progress bar here
                }
            }
        });

        URL.revokeObjectURL(imageUrl);

        const extractedText = result.data.text.trim();
        const confidence = Math.round(result.data.confidence);

        let content = `[IMAGEM: "${file.name}" | ${dimensions.width}x${dimensions.height}px | ${formatFileSize(file.size)} | Confiança OCR: ${confidence}%]\n\n`;

        if (extractedText) {
            content += `Texto extraído da imagem:\n${extractedText}`;
        } else {
            content += `[Nenhum texto detectado na imagem. A imagem pode conter gráficos, fotos ou conteúdo visual sem texto.]`;
        }

        return content;

    } catch (error) {
        console.error('Erro no OCR:', error);
        return `[Erro ao analisar imagem "${file.name}": ${error.message}]`;
    }
}

// Get image dimensions
function getImageDimensions(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
    });
}

// Extract text from video by capturing frames and running OCR
async function extractVideoText(file) {
    try {
        if (typeof Tesseract === 'undefined') {
            return `[Vídeo: ${file.name} (${formatFileSize(file.size)}) — OCR não disponível. Recarregue a página.]`;
        }

        showToast('🎬 Analisando frames do vídeo...', 'info');

        const videoUrl = URL.createObjectURL(file);
        const frames = await captureVideoFrames(videoUrl, 8); // Capture up to 8 frames
        URL.revokeObjectURL(videoUrl);

        if (frames.length === 0) {
            return `[Vídeo: ${file.name} (${formatFileSize(file.size)}) — Não foi possível capturar frames do vídeo.]`;
        }

        let content = `[VÍDEO: "${file.name}" | ${frames.length} frames analisados | ${formatFileSize(file.size)}]\n\n`;

        // OCR each frame
        const seenTexts = new Set();
        for (let i = 0; i < frames.length; i++) {
            try {
                const result = await Tesseract.recognize(frames[i].dataUrl, 'por+eng');
                const frameText = result.data.text.trim();
                if (frameText && !seenTexts.has(frameText)) {
                    seenTexts.add(frameText);
                    const timeStr = formatVideoTime(frames[i].time);
                    content += `[Frame em ${timeStr}]\n${frameText}\n\n`;
                }
            } catch (e) {
                // Skip frame on error
            }
        }

        if (seenTexts.size === 0) {
            content += `[Nenhum texto detectado nos frames do vídeo.]`;
        }

        return content;

    } catch (error) {
        console.error('Erro ao analisar vídeo:', error);
        return `[Erro ao analisar vídeo "${file.name}": ${error.message}]`;
    }
}

// Capture key frames from a video
function captureVideoFrames(videoUrl, maxFrames = 8) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.src = videoUrl;
        video.muted = true;
        video.preload = 'auto';

        video.addEventListener('loadedmetadata', async () => {
            const duration = video.duration;
            if (!isFinite(duration) || duration === 0) {
                resolve([]);
                return;
            }

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Set canvas size (scale down if too large)
            const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = video.videoWidth * scale;
            canvas.height = video.videoHeight * scale;

            const frames = [];
            const interval = duration / (maxFrames + 1);

            for (let i = 1; i <= maxFrames && i * interval < duration; i++) {
                const time = i * interval;
                try {
                    await seekVideo(video, time);
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                    frames.push({ time, dataUrl });
                } catch (e) {
                    // Skip failed frame
                }
            }

            resolve(frames);
        });

        video.addEventListener('error', () => resolve([]));
    });
}

// Seek video to a specific time
function seekVideo(video, time) {
    return new Promise((resolve, reject) => {
        video.currentTime = time;
        const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked);
            resolve();
        };
        video.addEventListener('seeked', onSeeked);
        setTimeout(() => reject(new Error('Seek timeout')), 5000);
    });
}

// Format video time as MM:SS
function formatVideoTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Extract text from PDF using PDF.js
async function extractPdfText(file) {
    try {
        // Wait for PDF.js to be ready
        if (window.pdfjsReady) {
            await window.pdfjsReady;
        }

        if (!window.pdfjsLib) {
            return `[PDF: ${file.name} (${formatFileSize(file.size)}) — A biblioteca de leitura de PDF não foi carregada. Recarregue a página e tente novamente.]`;
        }

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        const pageTexts = [];

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            // Smart text joining - respect Y positions for line breaks
            let lastY = null;
            let lines = [];
            let currentLine = '';
            
            for (const item of textContent.items) {
                if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) {
                    // Different Y position = new line
                    if (currentLine.trim()) lines.push(currentLine.trim());
                    currentLine = item.str;
                } else {
                    currentLine += item.str;
                }
                lastY = item.transform[5];
            }
            if (currentLine.trim()) lines.push(currentLine.trim());
            
            const pageText = lines.join('\n').trim();
            if (pageText) {
                pageTexts.push(pageText);
            }
        }

        if (pageTexts.length === 0) {
            return `[PDF: ${file.name} (${totalPages} páginas, ${formatFileSize(file.size)}) — Este PDF parece conter apenas imagens ou estar protegido. Não foi possível extrair texto.]`;
        }

        // Deduplicate: remove content that is repeated from previous pages
        // Common in presentations where each slide adds one more bullet point
        const dedupedTexts = [pageTexts[0]];
        for (let i = 1; i < pageTexts.length; i++) {
            const prev = pageTexts[i - 1];
            const curr = pageTexts[i];
            
            // If current page starts with the exact same text as previous page,
            // only keep the NEW content
            if (curr.startsWith(prev) && curr.length > prev.length) {
                const newContent = curr.substring(prev.length).trim();
                if (newContent) {
                    // Append only the new part to the last deduped entry
                    dedupedTexts[dedupedTexts.length - 1] += '\n' + newContent;
                }
            } else if (prev.startsWith(curr)) {
                // Current is subset of previous - skip (probably a transition slide)
                continue;
            } else {
                dedupedTexts.push(curr);
            }
        }

        // Join all text cleanly
        let fullText = dedupedTexts.join('\n\n');

        // Truncate if too long (context limit)
        const MAX_CHARS = 80000;
        if (fullText.length > MAX_CHARS) {
            fullText = fullText.substring(0, MAX_CHARS) + `\n\n[... Conteúdo truncado por limite de contexto]`;
        }

        return `[DOCUMENTO PDF: "${file.name}" | ${totalPages} páginas | ${formatFileSize(file.size)}]\n\n${fullText}`;

    } catch (error) {
        console.error('Erro ao ler PDF:', error);
        return `[Erro ao ler PDF "${file.name}": ${error.message}. O arquivo pode estar corrompido ou protegido por senha.]`;
    }
}

// Extract text from DOCX (ZIP containing XML)
async function extractDocxText(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        // DOCX is a ZIP file. Find document.xml inside it.
        // Simple ZIP parser for the specific file we need
        const text = await parseDocxZip(uint8);

        if (!text || !text.trim()) {
            return `[DOCX: ${file.name} (${formatFileSize(file.size)}) — Não foi possível extrair texto deste documento.]`;
        }

        const MAX_CHARS = 80000;
        let content = text;
        if (content.length > MAX_CHARS) {
            content = content.substring(0, MAX_CHARS) + `\n\n[... Texto truncado. Total: ${content.length} caracteres]`;
        }

        return `--- Conteúdo do DOCX: ${file.name} ---\n\n${content}\n\n--- Fim do documento ---`;

    } catch (error) {
        console.error('Erro ao ler DOCX:', error);
        return `[Erro ao ler DOCX "${file.name}": ${error.message}]`;
    }
}

// Minimal ZIP/DOCX parser
async function parseDocxZip(uint8) {
    try {
        // Use the browser's built-in Blob + DecompressionStream for ZIP entries
        // Find the 'word/document.xml' file in the ZIP

        const blob = new Blob([uint8]);

        // Try using JSZip-style approach via Response
        // First, find local file headers in the ZIP
        const files = findZipEntries(uint8);
        const docEntry = files.find(f => f.name === 'word/document.xml');

        if (!docEntry) {
            return '';
        }

        // Decompress the entry
        const compressedData = uint8.slice(docEntry.dataStart, docEntry.dataStart + docEntry.compressedSize);

        let xmlText;
        if (docEntry.compression === 0) {
            // Stored (no compression)
            xmlText = new TextDecoder().decode(compressedData);
        } else if (docEntry.compression === 8) {
            // Deflated - use DecompressionStream
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(compressedData);
            writer.close();
            const reader = ds.readable.getReader();
            const chunks = [];
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
            const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
            const result = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of chunks) {
                result.set(chunk, offset);
                offset += chunk.length;
            }
            xmlText = new TextDecoder().decode(result);
        } else {
            return '';
        }

        // Parse XML to extract text content
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlText, 'application/xml');

        // Extract text from <w:t> elements
        const textElements = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't');
        let text = '';
        let lastParagraph = null;

        // Walk through paragraphs
        const paragraphs = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'p');
        for (const p of paragraphs) {
            const runs = p.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 't');
            let paragraphText = '';
            for (const t of runs) {
                paragraphText += t.textContent;
            }
            if (paragraphText) {
                text += paragraphText + '\n';
            }
        }

        return text;
    } catch (e) {
        console.error('DOCX parse error:', e);
        return '';
    }
}

// Find file entries in a ZIP archive
function findZipEntries(data) {
    const entries = [];
    let offset = 0;

    while (offset < data.length - 4) {
        // Local file header signature = 0x04034b50
        if (data[offset] === 0x50 && data[offset + 1] === 0x4B && data[offset + 2] === 0x03 && data[offset + 3] === 0x04) {
            const compression = data[offset + 8] | (data[offset + 9] << 8);
            const compressedSize = data[offset + 18] | (data[offset + 19] << 8) | (data[offset + 20] << 16) | (data[offset + 21] << 24);
            const uncompressedSize = data[offset + 22] | (data[offset + 23] << 8) | (data[offset + 24] << 16) | (data[offset + 25] << 24);
            const nameLen = data[offset + 26] | (data[offset + 27] << 8);
            const extraLen = data[offset + 28] | (data[offset + 29] << 8);
            const name = new TextDecoder().decode(data.slice(offset + 30, offset + 30 + nameLen));
            const dataStart = offset + 30 + nameLen + extraLen;

            entries.push({ name, compression, compressedSize, uncompressedSize, dataStart });

            offset = dataStart + compressedSize;
        } else {
            offset++;
        }
    }

    return entries;
}

// ===== Mercury 2 API =====
async function sendToMercury(messages) {
    const response = await fetch(MERCURY_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.apiKey}`,
        },
        body: JSON.stringify({
            model: MERCURY_MODEL,
            messages: messages,
            max_tokens: 4096,
            temperature: 0.7,
            stream: true,
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Erro HTTP ${response.status}`);
    }

    return response;
}

// ===== URL Content Fetching =====

// Extract URLs from text
function extractUrls(text) {
    if (!text) return [];
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^\[\]`]+/gi;
    const matches = text.match(urlRegex) || [];
    // Remove duplicates and clean trailing punctuation
    return [...new Set(matches.map(url => url.replace(/[.,;:!?)]+$/, '')))];
}

// Fetch content from multiple URLs
async function fetchAllUrls(urls) {
    const results = [];
    for (const url of urls.slice(0, 5)) { // Max 5 URLs
        try {
            const content = await fetchUrlContent(url);
            if (content) results.push(content);
        } catch (e) {
            results.push(`[Erro ao acessar ${url}: ${e.message}]`);
        }
    }
    return results;
}

// Fetch a single URL's content
async function fetchUrlContent(url) {
    // CORS proxies to try (some may be down, we try multiple)
    const corsProxies = [
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    ];

    let html = null;

    // Try each proxy until one works
    for (const makeProxy of corsProxies) {
        try {
            const proxyUrl = makeProxy(url);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

            const response = await fetch(proxyUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'text/html,application/xhtml+xml,text/plain,*/*' }
            });
            clearTimeout(timeoutId);

            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                
                // Only process text/html content
                if (contentType.includes('text') || contentType.includes('html') || contentType.includes('json')) {
                    html = await response.text();
                    break;
                } else {
                    return `[LINK: ${url} — Conteúdo não-textual (${contentType}). Tipo: mídia ou binário.]`;
                }
            }
        } catch (e) {
            // Try next proxy
            continue;
        }
    }

    if (!html) {
        // Last resort: try direct fetch (may work for APIs/CORS-enabled sites)
        try {
            const response = await fetch(url, { 
                mode: 'cors',
                signal: AbortSignal.timeout(10000)
            });
            if (response.ok) {
                html = await response.text();
            }
        } catch (e) {
            return `[LINK: ${url} — Não foi possível acessar este site. O servidor pode estar bloqueando o acesso.]`;
        }
    }

    if (!html) {
        return `[LINK: ${url} — Falha ao acessar o conteúdo.]`;
    }

    // Extract readable text from HTML
    const readableText = extractReadableText(html, url);

    if (!readableText || readableText.trim().length < 20) {
        return `[LINK: ${url} — Página acessada mas sem conteúdo textual significativo (pode ser um app JavaScript ou conteúdo protegido).]`;
    }

    // Truncate if too long
    const MAX_CHARS = 30000;
    let content = readableText;
    if (content.length > MAX_CHARS) {
        content = content.substring(0, MAX_CHARS) + '\n\n[... Conteúdo truncado por limite]';
    }

    return `[CONTEÚDO DO LINK: ${url}]\n\n${content}`;
}

// Extract readable text from HTML
function extractReadableText(html, url) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Get page title
        const title = doc.querySelector('title')?.textContent?.trim() || '';
        
        // Get meta description
        const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '';
        
        // Get Open Graph data
        const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';
        const ogDesc = doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() || '';

        // Remove unwanted elements
        const removeSelectors = ['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header', '.sidebar', '.ads', '.advertisement', '.cookie-banner', '.popup'];
        removeSelectors.forEach(sel => {
            doc.querySelectorAll(sel).forEach(el => el.remove());
        });

        // Try to get main content
        const mainContent = doc.querySelector('main, article, [role="main"], .content, .post-content, .article-body, .entry-content, #content');
        
        let bodyText = '';
        if (mainContent) {
            bodyText = mainContent.textContent;
        } else {
            bodyText = doc.body?.textContent || '';
        }

        // Clean up the text
        bodyText = bodyText
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();

        // Build result
        let result = '';
        if (title) result += `Título: ${title}\n`;
        if (metaDesc) result += `Descrição: ${metaDesc}\n`;
        if (ogTitle && ogTitle !== title) result += `OG Título: ${ogTitle}\n`;
        if (ogDesc && ogDesc !== metaDesc) result += `OG Descrição: ${ogDesc}\n`;
        if (result) result += '\n---\n\n';
        result += bodyText;

        return result;

    } catch (e) {
        // If HTML parsing fails, try as plain text
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}

async function handleSend() {
    if (state.isStreaming) return;

    const text = el.chatInput.value.trim();
    const files = [...state.attachedFiles];

    if (!text && files.length === 0) return;

    // Remove welcome screen
    const welcome = el.chatMessages.querySelector('.welcome-container');
    if (welcome) welcome.remove();

    // Build user message content
    // We separate what the user SEES from what the API RECEIVES
    let displayContent = text; // What appears in chat bubble
    let apiContent = text; // What gets sent to the API (includes file contents)
    let fileContents = [];

    // Read files (with progress indicator)
    if (files.length > 0) {
        showToast(`📄 Analisando ${files.length} arquivo(s)...`, 'info');
    }
    for (const file of files) {
        const content = await readFileAsText(file);
        fileContents.push(content);
    }

    // API content includes the full file text (hidden from the user)
    if (fileContents.length > 0) {
        apiContent = fileContents.join('\n\n') + (text ? '\n\n' + text : '');
    }

    // Detect and fetch URLs in the message
    const urls = extractUrls(text);
    if (urls.length > 0) {
        showToast(`🌐 Acessando ${urls.length} link(s)...`, 'info');
        const urlContents = await fetchAllUrls(urls);
        if (urlContents.length > 0) {
            const urlContext = urlContents.join('\n\n');
            apiContent = (apiContent || text) + '\n\n' + urlContext;
        }
    }

    // Create user message for display (clean - no raw file text)
    const userMsg = {
        role: 'user',
        content: displayContent, // Only show user's typed text in the bubble
        _apiContent: apiContent, // Hidden: full content sent to API
        files: files.map(f => {
            const fileInfo = { name: f.name, size: f.size, type: f.type };
            // Create blob URL for images so they display inline
            if (f.type && f.type.startsWith('image/')) {
                fileInfo._blobUrl = URL.createObjectURL(f);
            }
            return fileInfo;
        }),
    };

    state.currentMessages.push(userMsg);
    appendMessageToDOM(userMsg);
    scrollToBottom();

    // Update title
    updateConvoTitle(state.currentConvoId, text || files[0]?.name || 'Arquivo');

    // Clear input
    el.chatInput.value = '';
    state.attachedFiles = [];
    renderAttachedFiles();
    updateSendBtn();
    autoResize();

    // Show typing indicator (with file analysis text if files attached)
    const hasFiles = files.length > 0;
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message';
    typingDiv.id = 'typing-msg';
    typingDiv.innerHTML = `
        <div class="message-avatar ai">
            <svg width="14" height="14" viewBox="0 0 28 28" fill="none"><path d="M14 2L2 8L14 14L26 8L14 2Z" fill="white" opacity="0.9"/><path d="M2 14L14 20L26 14" stroke="white" stroke-width="2"/></svg>
        </div>
        <div class="message-content">
            <div class="message-sender">Mercury 2</div>
            <div class="message-text">
                ${hasFiles ? '<div class="analyzing-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg><span>Analisando documento...</span></div>' : ''}
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        </div>
    `;
    el.chatMessages.appendChild(typingDiv);
    scrollToBottom();

    state.isStreaming = true;

    try {
        // Build API messages with system prompt and full file contents
        const apiMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...state.currentMessages.map(m => ({
                role: m.role,
                content: m._apiContent || m.content, // Use hidden API content if available
            }))
        ];

        const response = await sendToMercury(apiMessages);

        // Remove typing
        typingDiv.remove();

        // Stream the response
        const assistantMsg = { role: 'assistant', content: '' };
        state.currentMessages.push(assistantMsg);

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message';
        msgDiv.innerHTML = `
            <div class="message-avatar ai">
                <svg width="14" height="14" viewBox="0 0 28 28" fill="none"><path d="M14 2L2 8L14 14L26 8L14 2Z" fill="white" opacity="0.9"/><path d="M2 14L14 20L26 14" stroke="white" stroke-width="2"/></svg>
            </div>
            <div class="message-content">
                <div class="message-sender">Mercury 2</div>
                <div class="message-text"><span class="streaming-cursor"></span></div>
            </div>
        `;
        el.chatMessages.appendChild(msgDiv);
        const textEl = msgDiv.querySelector('.message-text');
        scrollToBottom();

        // Throttle DOM updates for performance during fast streaming
        let renderQueued = false;
        let lastRenderTime = 0;
        const RENDER_INTERVAL = 50; // ms between renders

        function queueRender() {
            if (renderQueued) return;
            const now = Date.now();
            const timeSinceLastRender = now - lastRenderTime;
            if (timeSinceLastRender >= RENDER_INTERVAL) {
                doRender();
            } else {
                renderQueued = true;
                setTimeout(() => {
                    renderQueued = false;
                    doRender();
                }, RENDER_INTERVAL - timeSinceLastRender);
            }
        }

        function doRender() {
            lastRenderTime = Date.now();
            textEl.innerHTML = formatMessageStreaming(assistantMsg.content) + '<span class="streaming-cursor"></span>';
            scrollToBottom();
        }

        // Read SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data:')) continue;

                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') continue;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta;
                    if (delta?.content) {
                        assistantMsg.content += delta.content;
                        queueRender();
                    }
                } catch (e) {
                    // Skip malformed chunks
                }
            }
        }

        // Remove cursor
        const cursor = textEl.querySelector('.streaming-cursor');
        if (cursor) cursor.remove();

        // Final format
        textEl.innerHTML = formatMessage(assistantMsg.content);

        saveConversations();

    } catch (error) {
        typingDiv.remove();
        console.error('Mercury API error:', error);

        let errorMsg = error.message;
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            errorMsg = 'Chave da API inválida. Verifique sua chave em platform.inceptionlabs.ai';
        } else if (error.message.includes('429')) {
            errorMsg = 'Limite de taxa excedido. Aguarde um momento e tente novamente.';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMsg = 'Erro de conexão. Verifique sua internet e tente novamente.';
        }

        // Show error as system message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message';
        errorDiv.innerHTML = `
            <div class="message-avatar ai" style="background: rgba(239,68,68,0.2);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <div class="message-content">
                <div class="message-sender" style="color: #EF4444;">Erro</div>
                <div class="message-text" style="color: var(--text-secondary);">${errorMsg}</div>
            </div>
        `;
        el.chatMessages.appendChild(errorDiv);
        scrollToBottom();

        // Remove the failed assistant placeholder if added
        if (state.currentMessages.length > 0 && state.currentMessages[state.currentMessages.length - 1].role === 'assistant' && !state.currentMessages[state.currentMessages.length - 1].content) {
            state.currentMessages.pop();
        }
    }

    state.isStreaming = false;
    updateSendBtn();
}

// ===== Image Preview (fullscreen) =====
function openImagePreview(src) {
    const overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';
    overlay.innerHTML = `
        <div class="image-preview-container">
            <img src="${src}" alt="Preview">
            <button class="image-preview-close" aria-label="Fechar">×</button>
        </div>
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.classList.contains('image-preview-close')) {
            overlay.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => overlay.remove(), 200);
        }
    });
    document.body.appendChild(overlay);
}

// ===== Input Handling =====
function updateSendBtn() {
    const hasText = el.chatInput.value.trim().length > 0;
    const hasFiles = state.attachedFiles.length > 0;
    el.sendBtn.disabled = !(hasText || hasFiles) || state.isStreaming;
}

function autoResize() {
    el.chatInput.style.height = 'auto';
    el.chatInput.style.height = Math.min(el.chatInput.scrollHeight, 120) + 'px';
}

// ===== Toast =====
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';

    const colors = {
        info: 'background: rgba(59,130,246, 0.9); color: white;',
        error: 'background: rgba(239,68,68, 0.9); color: white;',
        warning: 'background: rgba(249,115,22, 0.9); color: white;',
        success: 'background: rgba(34,197,94, 0.9); color: white;',
    };
    toast.style.cssText = colors[type] || colors.info;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ===== API Key Toggle =====
function initApiKeyToggle() {
    el.apiToggleBtn.addEventListener('click', () => {
        const input = el.apiKeyInput;
        if (input.type === 'password') {
            input.type = 'text';
        } else {
            input.type = 'password';
        }
    });
}

// ===== Event Listeners =====
function initEvents() {
    // API key toggle
    initApiKeyToggle();

    // Google login
    initGoogleLogin();

    // Sidebar
    el.sidebarToggle.addEventListener('click', openSidebar);
    el.sidebarOverlay.addEventListener('click', closeSidebar);
    el.sidebarClose.addEventListener('click', closeSidebar);

    // New chat
    el.newChatBtn.addEventListener('click', startNewConversation);
    el.sidebarNewChat.addEventListener('click', startNewConversation);

    // Logout
    el.logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('mercury_user');
        localStorage.removeItem('mercury_api_key');
        state.user = null;
        state.apiKey = '';
        el.apiKeyInput.value = '';
        showScreen('login');
    });

    // File attach
    el.attachBtn.addEventListener('click', () => el.fileInput.click());
    el.fileInput.addEventListener('change', (e) => {
        for (const file of e.target.files) {
            if (file.size > MAX_FILE_SIZE) {
                showToast(`"${file.name}" excede 50GB`, 'error');
                continue;
            }
            state.attachedFiles.push(file);
        }
        renderAttachedFiles();
        updateSendBtn();
        e.target.value = '';
    });

    // Chat input
    el.chatInput.addEventListener('input', () => {
        updateSendBtn();
        autoResize();
    });

    el.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!el.sendBtn.disabled) handleSend();
        }
    });

    // Paste images (Ctrl+V / Cmd+V)
    document.addEventListener('paste', (e) => {
        // Only handle when chat screen is active
        if (!el.screenChat.classList.contains('active')) return;

        const items = e.clipboardData?.items;
        if (!items) return;

        let hasImage = false;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                hasImage = true;
                const file = item.getAsFile();
                if (file) {
                    // Generate a friendly name
                    const ext = file.type.split('/')[1] || 'png';
                    const timestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/:/g, '-');
                    const namedFile = new File([file], `screenshot_${timestamp}.${ext}`, { type: file.type });
                    state.attachedFiles.push(namedFile);
                }
            }
        }

        if (hasImage) {
            renderAttachedFiles();
            updateSendBtn();
            showToast('📷 Imagem colada!', 'success');
            el.chatInput.focus();
        }
    });

    // Drag and drop on chat area
    const chatArea = el.chatMessages;
    chatArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        chatArea.classList.add('drag-over');
    });
    chatArea.addEventListener('dragleave', () => {
        chatArea.classList.remove('drag-over');
    });
    chatArea.addEventListener('drop', (e) => {
        e.preventDefault();
        chatArea.classList.remove('drag-over');
        if (e.dataTransfer?.files?.length > 0) {
            for (const file of e.dataTransfer.files) {
                if (file.size > MAX_FILE_SIZE) {
                    showToast(`"${file.name}" excede 50GB`, 'error');
                    continue;
                }
                state.attachedFiles.push(file);
            }
            renderAttachedFiles();
            updateSendBtn();
        }
    });

    // Send button
    el.sendBtn.addEventListener('click', handleSend);

    // Pre-fill API key if saved
    if (state.apiKey) {
        el.apiKeyInput.value = state.apiKey;
    }
}

// ===== Auto-login if session exists =====
function checkExistingSession() {
    if (state.user && state.apiKey) {
        enterChat();

        // Load last conversation
        if (state.conversations.length > 0) {
            loadConversation(state.conversations[0].id);
        }
    }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    initBackground();
    initEvents();
    checkExistingSession();
});
