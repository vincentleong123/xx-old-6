const crypto = require('crypto');

const activeSessions = new Map();
const ADMIN_ROOM = 'admin-room';

module.exports = function(io, db, config) {
  const adminPassword = config.adminPassword || 'admin123';
  const adminName = config.adminName || 'Admin';
  const messagesCol = db.getCollection('chatMessages') || db.addCollection('chatMessages');

  function saveMessage(visitorId, from, text) {
    const msg = { visitorId, from, text, timestamp: Date.now() };
    messagesCol.insert(msg);
    db.saveDatabase();
    return msg;
  }

  function getMessages(visitorId, limit = 100) {
    return messagesCol.find({ visitorId })
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }

  function getVisitorName(visitorId) {
    const s = activeSessions.get(visitorId);
    return s ? s.name : 'Guest';
  }

  io.on('connection', (socket) => {
    const visitorId = socket.handshake.query.vid;
    const isAdmin = socket.handshake.query.admin === 'true';

    if (isAdmin) {
      socket.join(ADMIN_ROOM);
      socket.data.isAdmin = true;
      socket.emit('admin:init', { sessions: serializeSessions(), adminName });
      return;
    }

    if (!visitorId) return;

    const existing = activeSessions.get(visitorId);
    if (existing) {
      existing.socketId = socket.id;
      existing.isOnline = true;
      existing.lastActive = Date.now();
    } else {
      const shortId = visitorId.slice(-6);
      activeSessions.set(visitorId, {
        visitorId,
        socketId: socket.id,
        name: 'Guest_' + shortId,
        pageUrl: socket.handshake.query.page || '/',
        firstSeen: Date.now(),
        lastActive: Date.now(),
        isOnline: true,
        contacted: false
      });
    }

    socket.join(visitorId);
    const session = activeSessions.get(visitorId);
    const history = getMessages(visitorId);

    socket.emit('chat:init', {
      visitorId,
      name: session.name,
      adminName,
      messages: history
    });

    io.to(ADMIN_ROOM).emit('admin:session_update', { sessions: serializeSessions() });

    socket.on('chat:message', (text) => {
      if (!text || typeof text !== 'string') return;
      const msg = saveMessage(visitorId, 'visitor', text.trim());
      io.to(visitorId).emit('chat:message', msg);
      io.to(ADMIN_ROOM).emit('admin:message', { ...msg, visitorName: session.name });
      if (session) session.lastActive = Date.now();
    });

    socket.on('chat:page_update', (url) => {
      if (session) {
        session.pageUrl = url;
        io.to(ADMIN_ROOM).emit('admin:session_update', { sessions: serializeSessions() });
      }
    });

    socket.on('disconnect', () => {
      if (session) {
        session.isOnline = false;
        session.lastActive = Date.now();
        io.to(ADMIN_ROOM).emit('admin:session_update', { sessions: serializeSessions() });
      }
    });
  });

  function serializeSessions() {
    return Array.from(activeSessions.values()).map(s => ({
      visitorId: s.visitorId,
      name: s.name,
      pageUrl: s.pageUrl,
      firstSeen: s.firstSeen,
      lastActive: s.lastActive,
      isOnline: s.isOnline,
      contacted: s.contacted || false
    })).sort((a, b) => b.lastActive - a.lastActive);
  }

  return {
    adminLogin(password) {
      return password === adminPassword;
    },
    adminToken() {
      return crypto.createHash('sha256').update(adminPassword + 'xmelayu-chat-secret').digest('hex');
    },
    validateToken(token) {
      return token === crypto.createHash('sha256').update(adminPassword + 'xmelayu-chat-secret').digest('hex');
    },
    getSessions() {
      return serializeSessions();
    },
    adminStartChat(visitorId, text) {
      const session = activeSessions.get(visitorId);
      if (!text || typeof text !== 'string') return null;
      const msg = saveMessage(visitorId, 'admin', text.trim());
      io.to(visitorId).emit('chat:auto_open', msg);
      io.to(ADMIN_ROOM).emit('admin:message', { ...msg, visitorName: session ? session.name : 'Guest' });
      if (session) {
        session.contacted = true;
        io.to(ADMIN_ROOM).emit('admin:session_update', { sessions: serializeSessions() });
      }
      return msg;
    },
    adminReply(visitorId, text) {
      const session = activeSessions.get(visitorId);
      if (!text || typeof text !== 'string') return null;
      const msg = saveMessage(visitorId, 'admin', text.trim());
      io.to(visitorId).emit('chat:message', msg);
      io.to(ADMIN_ROOM).emit('admin:message', { ...msg, visitorName: session ? session.name : 'Guest' });
      if (session) {
        session.contacted = true;
        io.to(ADMIN_ROOM).emit('admin:session_update', { sessions: serializeSessions() });
      }
      return msg;
    },
    getConversation(visitorId, limit = 200) {
      return getMessages(visitorId, limit);
    }
  };
};
