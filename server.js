const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io'yu basit ama sağlam ayarla
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['polling', 'websocket']
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateRoomCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

io.on('connection', (socket) => {
    console.log('✅ Yeni bağlantı:', socket.id);

    socket.on('createRoom', ({ playerName, targetScore }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{ id: socket.id, name: playerName, choice: null }],
            scores: { 0: 0, 1: 0 },
            targetScore: targetScore || 3,
            roundActive: false
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerIndex: 0, targetScore });
        io.to(roomCode).emit('updatePlayers', rooms[roomCode].players);
        console.log(`🏠 Oda oluşturuldu: ${roomCode} (${playerName})`);
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        const room = rooms[roomCode];
        if (!room) {
            socket.emit('errorMessage', 'Oda bulunamadı!');
            return;
        }
        if (room.players.length >= 2) {
            socket.emit('errorMessage', 'Oda dolu!');
            return;
        }
        room.players.push({ id: socket.id, name: playerName, choice: null });
        socket.join(roomCode);
        socket.emit('roomJoined', { roomCode, playerIndex: 1, targetScore: room.targetScore });
        io.to(roomCode).emit('updatePlayers', room.players);
        console.log(`👤 ${playerName} odaya katıldı: ${roomCode}`);
    });

    socket.on('disconnect', () => {
        console.log('❌ Bağlantı koptu:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
