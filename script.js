// Конфигурация - замените на URL вашего сервера после деплоя
const SERVER_URL = 'http://localhost:3000';

// Состояние приложения
let currentUser = null;
let currentChatId = null;
let contacts = [];
let socket = null;

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupAuthTabs();
    setupEventListeners();
});

// Проверка авторизации
function checkAuth() {
    const savedUser = localStorage.getItem('messenger_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showMessenger();
    }
}

// Показать экран мессенджера
function showMessenger() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('messengerScreen').classList.remove('hidden');
    document.getElementById('currentUserName').textContent = currentUser.name;
    
    // Подключение к WebSocket
    connectSocket();
    
    // Загрузка контактов
    loadContacts();
}

// Подключение к WebSocket
function connectSocket() {
    socket = io(SERVER_URL);
    
    socket.on('connect', () => {
        console.log('Connected to server');
        socket.emit('user_online', currentUser.id);
    });
    
    socket.on('new_message', (message) => {
        handleNewMessage(message);
    });
    
    socket.on('message_sent', (message) => {
        handleNewMessage(message);
    });
}

// Обработка нового сообщения
function handleNewMessage(message) {
    const senderId = message.sender_id === currentUser.id ? currentUser.id : message.sender_id;
    const otherUserId = message.sender_id === currentUser.id ? message.receiver_id : message.sender_id;
    
    // Обновляем сообщение в текущем чате
    if (currentChatId === otherUserId) {
        appendMessage(message.text, message.sender_id === currentUser.id ? 'outgoing' : 'incoming', message.created_at);
        document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    }
    
    // Обновляем список контактов
    loadContacts();
}

// Настройка переключения вкладок
function setupAuthTabs() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            const tabName = tab.dataset.tab;
            if (tabName === 'login') {
                document.getElementById('loginForm').classList.remove('hidden');
                document.getElementById('registerForm').classList.add('hidden');
            } else {
                document.getElementById('loginForm').classList.add('hidden');
                document.getElementById('registerForm').classList.remove('hidden');
            }
        });
    });
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Вход
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('loginName').value;
        const password = document.getElementById('loginPassword').value;
        await login(name, password);
    });
    
    // Регистрация
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('registerName').value;
        const password = document.getElementById('registerPassword').value;
        await register(name, password);
    });
    
    // Выход
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Поиск
    document.getElementById('searchInput').addEventListener('input', debounce(searchUsers, 300));
    
    // Отправка сообщения
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

// Вход
async function login(name, password) {
    try {
        const response = await fetch(`${SERVER_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = { id: data.userId, name: data.name };
            localStorage.setItem('messenger_user', JSON.stringify(currentUser));
            showMessenger();
        } else {
            document.getElementById('loginError').textContent = data.error;
        }
    } catch (error) {
        document.getElementById('loginError').textContent = 'Ошибка подключения к серверу';
        console.error('Login error:', error);
    }
}

// Регистрация
async function register(name, password) {
    try {
        const response = await fetch(`${SERVER_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            currentUser = { id: data.userId, name: data.name };
            localStorage.setItem('messenger_user', JSON.stringify(currentUser));
            showMessenger();
        } else {
            document.getElementById('registerError').textContent = data.error;
        }
    } catch (error) {
        document.getElementById('registerError').textContent = 'Ошибка подключения к серверу';
        console.error('Registration error:', error);
    }
}

// Выход
function logout() {
    localStorage.removeItem('messenger_user');
    if (socket) socket.disconnect();
    currentUser = null;
    currentChatId = null;
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('messengerScreen').classList.add('hidden');
    document.getElementById('loginForm').reset();
    document.getElementById('registerForm').reset();
}

// Загрузка контактов
async function loadContacts() {
    try {
        const response = await fetch(`${SERVER_URL}/api/users/${currentUser.id}/contacts`);
        const data = await response.json();
        contacts = data.contacts || [];
        renderChatList();
    } catch (error) {
        console.error('Load contacts error:', error);
    }
}

// Рендеринг списка чатов
function renderChatList() {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';

    contacts.forEach(contact => {
        const chatElement = document.createElement('div');
        chatElement.className = 'chat-item';
        if (contact.id === currentChatId) chatElement.classList.add('active');
        
        const initial = contact.name.charAt(0).toUpperCase();
        const lastMessage = contact.last_message || 'Нет сообщений';

        chatElement.innerHTML = `
            <div class="avatar">${initial}</div>
            <div class="chat-details">
                <div class="chat-name">${contact.name}</div>
                <div class="last-message">${lastMessage}</div>
            </div>
        `;

        chatElement.addEventListener('click', () => selectChat(contact));
        chatList.appendChild(chatElement);
    });
}

// Поиск пользователей
async function searchUsers() {
    const query = document.getElementById('searchInput').value.trim();
    if (query.length < 2) {
        document.getElementById('chatList').innerHTML = '';
        renderChatList();
        return;
    }
    
    try {
        const response = await fetch(`${SERVER_URL}/api/users/search?query=${encodeURIComponent(query)}`);
        const data = await response.json();
        
        const chatList = document.getElementById('chatList');
        chatList.innerHTML = '<div class="search-results"></div>';
        const resultsContainer = chatList.querySelector('.search-results');
        
        if (data.users.length === 0) {
            resultsContainer.innerHTML = '<div style="padding:15px;color:#6c7883;">Никого не найдено</div>';
            return;
        }
        
        data.users.forEach(user => {
            const isContact = contacts.some(c => c.id === user.id);
            const resultElement = document.createElement('div');
            resultElement.className = 'search-result-item';
            
            resultElement.innerHTML = `
                <div class="avatar">${user.name.charAt(0).toUpperCase()}</div>
                <div class="chat-details">
                    <div class="chat-name">${user.name}</div>
                </div>
                ${isContact ? '<span style="color:#6c7883;font-size:12px;">в контактах</span>' : 
                    `<button class="add-contact-btn" data-user-id="${user.id}">Добавить</button>`}
            `;
            
            if (!isContact) {
                resultElement.querySelector('.add-contact-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    addContact(user);
                });
            }
            
            resultsContainer.appendChild(resultElement);
        });
    } catch (error) {
        console.error('Search error:', error);
    }
}

// Добавление контакта
async function addContact(user) {
    try {
        await fetch(`${SERVER_URL}/api/users/${currentUser.id}/contacts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId: user.id })
        });
        
        loadContacts();
        document.getElementById('searchInput').value = '';
    } catch (error) {
        console.error('Add contact error:', error);
    }
}

// Выбор чата
async function selectChat(contact) {
    currentChatId = contact.id;
    
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.toggle('active', 
            item.querySelector('.chat-name')?.textContent === contact.name);
    });

    document.getElementById('chatHeader').querySelector('.chat-info').innerHTML = `
        <h3 class="chat-name-header">${contact.name}</h3>
    `;
    
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;

    await loadMessages(contact.id);
}

// Загрузка сообщений
async function loadMessages(otherUserId) {
    try {
        const response = await fetch(`${SERVER_URL}/api/users/${currentUser.id}/messages/${otherUserId}`);
        const data = await response.json();
        
        const messagesContainer = document.getElementById('messages');
        messagesContainer.innerHTML = '';
        
        if (data.messages.length === 0) {
            messagesContainer.innerHTML = '<div class="empty-state">Начните переписку!</div>';
            return;
        }
        
        data.messages.forEach(msg => {
            appendMessage(msg.text, msg.sender_id === currentUser.id ? 'outgoing' : 'incoming', msg.created_at);
        });
        
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (error) {
        console.error('Load messages error:', error);
    }
}

// Добавление сообщения в DOM
function appendMessage(text, type, timestamp) {
    const messagesContainer = document.getElementById('messages');
    
    // Удаляем empty state если есть
    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    const date = new Date(timestamp);
    const time = date.getHours().toString().padStart(2, '0') + ':' + 
                 date.getMinutes().toString().padStart(2, '0');
    
    messageElement.innerHTML = `
        <div class="message-text">${escapeHtml(text)}</div>
        <div class="message-time">${time}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
}

// Отправка сообщения
function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();

    if (!text || !currentChatId) return;

    socket.emit('send_message', {
        senderId: currentUser.id,
        receiverId: currentChatId,
        text: text
    });

    input.value = '';
}

// Утилита: Debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Утилита: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
