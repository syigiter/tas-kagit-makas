const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io ayarları - daha hızlı ve güvenilir
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],  // WebSocket öncelikli
    pingTimeout: 60000,  // 60 saniye
    pingInterval: 25000, // 25 saniye
    connectTimeout: 45000, // 45 saniye bağlantı zaman aşımı
    allowEIO3: true
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
            players: [
                { id: socket.id, name: playerName, choice: null }
            ],
            scores: { 0: 0, 1: 0 },
            targetScore: targetScore || 3,
            roundActive: false,
            gameState: 'waiting'
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { 
            roomCode, 
            playerIndex: 0, 
            targetScore: rooms[roomCode].targetScore 
        });
        console.log(`🏠 Oda oluşturuldu: ${roomCode} (${playerName})`);
    });

    socket.on('joinRoom', ({ roomCode, playerName }) => {
        console.log(`🔍 Katılma isteği: ${roomCode} - ${playerName}`);
        const room = rooms[roomCode];
        
        if (!room) {
            socket.emit('errorMessage', '❌ Oda bulunamadı!');
            return;
        }
        
        if (room.players.length >= 2) {
            socket.emit('errorMessage', '❌ Oda dolu!');
            return;
        }
        
        room.players.push({ id: socket.id, name: playerName, choice: null });
        socket.join(roomCode);
        
        socket.emit('roomJoined', { 
            roomCode, 
            playerIndex: 1, 
            targetScore: room.targetScore 
        });
        
        io.to(roomCode).emit('updatePlayers', room.players);
        
        console.log(`👤 ${playerName} odaya katıldı: ${roomCode} (${room.players.length}/2)`);
        
        if (room.players.length === 2) {
            io.to(roomCode).emit('gameReady', '🎮 İki oyuncu hazır! Oyun başlıyor...');
            console.log(`🎮 Oyun başlıyor: ${roomCode}`);
        }
    });

    socket.on('makeChoice', ({ roomCode, choice, playerIndex }) => {
        const room = rooms[roomCode];
        if (!room) return;
        
        const player = room.players[playerIndex];
        if (!player) return;
        
        player.choice = choice;
        io.to(roomCode).emit('updatePlayers', room.players);
        console.log(`✋ ${player.name} seçim yaptı: ${choice}`);
    });

    socket.on('disconnect', () => {
        console.log('❌ Bağlantı koptu:', socket.id);
        
        for (const [roomCode, room] of Object.entries(rooms)) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                const playerName = room.players[index].name;
                room.players.splice(index, 1);
                io.to(roomCode).emit('updatePlayers', room.players);
                io.to(roomCode).emit('errorMessage', `⚠️ ${playerName} ayrıldı!`);
                console.log(`👋 ${playerName} odadan ayrıldı: ${roomCode}`);
                
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                    console.log(`🗑️ Oda silindi: ${roomCode}`);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
});
