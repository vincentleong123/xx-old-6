(function() {
  'use strict';

  const CFG = window.chatConfig || {};
  const SOCKET_URL = CFG.socketUrl || '';
  const VISITOR_ID = CFG.visitorId || '';
  const ADMIN_NAME = CFG.adminName || 'Admin';
  const IS_ADMIN_PAGE = CFG.isAdminPage || false;

  let socket = null;
  let chatOpen = false;
  let unreadCount = 0;
  let messages = [];
  let originalTitle = document.title;
  let titleInterval = null;

  function initSocket() {
    if (!VISITOR_ID || IS_ADMIN_PAGE) return;
    socket = io(SOCKET_URL, {
      query: { vid: VISITOR_ID, page: window.location.pathname }
    });

    socket.on('chat:init', (data) => {
      messages = data.messages || [];
      renderMessages();
    });

    socket.on('chat:message', (msg) => {
      messages.push(msg);
      renderMessages();
      if (msg.from === 'admin' && !chatOpen) {
        incrementUnread();
        notifyNewMessage(msg);
      }
    });

    socket.on('chat:auto_open', (msg) => {
      messages.push(msg);
      renderMessages();
      if (!chatOpen) {
        chatOpen = false;
        toggleChat();
      }
      notifyNewMessage(msg);
    });

    // Track page navigation for admin visibility
    let lastUrl = window.location.pathname;
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;
    history.pushState = function() {
      origPushState.apply(this, arguments);
      emitPageUpdate();
    };
    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      emitPageUpdate();
    };
    window.addEventListener('popstate', emitPageUpdate);

    function emitPageUpdate() {
      const url = window.location.pathname;
      if (url !== lastUrl && socket) {
        lastUrl = url;
        socket.emit('chat:page_update', url);
      }
    }
    setInterval(emitPageUpdate, 5000);
  }

  function notifyNewMessage(msg) {
    playNotificationSound();
    flashTitle('\uD83D\uDCAC ' + ADMIN_NAME);
  }

  function playNotificationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
    } catch(e) {}
  }

  function flashTitle(text) {
    if (titleInterval) clearInterval(titleInterval);
    let toggle = false;
    titleInterval = setInterval(() => {
      document.title = toggle ? text + ' \uD83D\uDCAC' : originalTitle;
      toggle = !toggle;
    }, 1200);
    setTimeout(() => {
      if (titleInterval) { clearInterval(titleInterval); titleInterval = null; }
      document.title = originalTitle;
    }, 10000);
    document.addEventListener('visibilitychange', function onVis() {
      if (!document.hidden) {
        document.title = originalTitle;
        if (titleInterval) { clearInterval(titleInterval); titleInterval = null; }
        document.removeEventListener('visibilitychange', onVis);
      }
    });
  }

  function incrementUnread() {
    unreadCount++;
    updateBadge();
  }

  function updateBadge() {
    const badge = document.getElementById('chatFabBadge');
    if (!badge) return;
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
      badge.classList.remove('hidden');
      document.getElementById('chatFab')?.classList.add('has-unread');
    } else {
      badge.classList.add('hidden');
      document.getElementById('chatFab')?.classList.remove('has-unread');
    }
  }

  function clearUnread() {
    unreadCount = 0;
    updateBadge();
    if (titleInterval) { clearInterval(titleInterval); titleInterval = null; }
    document.title = originalTitle;
  }

  function toggleChat() {
    chatOpen = !chatOpen;
    const w = document.getElementById('chatWindow');
    const fab = document.getElementById('chatFab');
    if (chatOpen) {
      w.classList.add('open');
      fab.classList.remove('has-unread');
      clearUnread();
      scrollToBottom();
      document.getElementById('chatInput')?.focus();
    } else {
      w.classList.remove('open');
    }
  }

  function sendMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !socket) return;
    socket.emit('chat:message', text);
    input.value = '';
    input.style.height = 'auto';
  }

  function renderMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (!messages.length) {
      container.innerHTML = '<div class="chat-welcome"><div class="chat-welcome-line">Say hi! <span class="emoji">\uD83D\uDC4B</span></div></div>';
      return;
    }
    container.innerHTML = messages.map(m => {
      const isVisitor = m.from === 'visitor';
      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return '<div class="chat-msg ' + (isVisitor ? 'visitor' : 'admin') + '">' +
        escapeHtml(m.text) + '<span class="msg-time">' + time + '</span></div>';
    }).join('');
    scrollToBottom();
  }

  function scrollToBottom() {
    const c = document.getElementById('chatMessages');
    if (c) requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function adjustTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 80) + 'px';
  }

  document.addEventListener('DOMContentLoaded', function() {
    if (IS_ADMIN_PAGE) return;

    const fab = document.createElement('button');
    fab.id = 'chatFab';
    fab.className = 'chat-fab';
    fab.innerHTML = '\uD83D\uDCAC Chat<span id="chatFabBadge" class="chat-fab-badge hidden">0</span>';
    fab.onclick = toggleChat;
    document.body.appendChild(fab);

    const win = document.createElement('div');
    win.id = 'chatWindow';
    win.className = 'chat-window';
    win.innerHTML =
      '<div class="chat-header">' +
        '<div class="chat-header-avatar">\uD83D\uDC64</div>' +
        '<div class="chat-header-info">' +
          '<div class="chat-header-name">' + escapeHtml(ADMIN_NAME) + '</div>' +
          '<div class="chat-header-status"><span style="color:#22c55e">\u25CF</span> Usually replies within minutes</div>' +
        '</div>' +
        '<button class="chat-header-close" onclick="window.__toggleChat ? window.__toggleChat() : null" title="Close">\u2715</button>' +
      '</div>' +
      '<div class="chat-messages" id="chatMessages"></div>' +
      '<div class="chat-input-wrap">' +
        '<textarea class="chat-input" id="chatInput" placeholder="Type a message..." rows="1" maxlength="500"></textarea>' +
        '<button class="chat-send" id="chatSend">\u27A4</button>' +
      '</div>';
    document.body.appendChild(win);

    document.getElementById('chatSend').onclick = sendMessage;
    document.getElementById('chatInput').onkeydown = function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    };
    document.getElementById('chatInput').oninput = function() { adjustTextarea(this); };

    window.__toggleChat = toggleChat;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/chat.css?v=1';
    document.head.appendChild(link);

    initSocket();
  });
})();
