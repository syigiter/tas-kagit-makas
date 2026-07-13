const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function generateRoomCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

// IP adresini bul
const os = require('os');
const networkInterfaces = os.networkInterfaces();
let localIp = 'localhost';
for (const iface of Object.values(networkInterfaces)) {
    for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
            localIp = alias.address;
            break;
        }
    }
    if (localIp !== 'localhost') break;
}

io.on('connection', (socket) => {
    console.log('Yeni bağlantı:', socket.id);

    socket.on('createRoom', ({ playerName, targetScore }) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            players: [{ id: socket.id, name: playerName, choice: null }],
            gameState: 'waiting',
            scores: { 0: 0, 1: 0 },
            targetScore: targetScore || 3,
            roundActive: false
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerIndex: 0, targetScore });
        io.to(roomCode).emit('updatePlayers', rooms[roomCode].players);
        console.log(`Oda oluşturuldu: ${roomCode} (${playerName})`);
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
        
        if (room.players.length === 2) {
            io.to(roomCode).emit('gameReady', 'İki oyuncu hazır!');
            startCountdown(roomCode);
        }
        console.log(`${playerName} odaya katıldı: ${roomCode}`);
    });

    function startCountdown(roomCode) {
        const room = rooms[roomCode];
        if (!room) return;
        room.roundActive = false;
        let count = 3;
        io.to(roomCode).emit('countdown', { count, sound: 'count' });
        
        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                io.to(roomCode).emit('countdown', { count, sound: 'count' });
            } else {
                clearInterval(interval);
                room.roundActive = true;
                io.to(roomCode).emit('countdown', { count: 0, sound: 'go' });
                io.to(roomCode).emit('roundStart');
                room.players.forEach(p => p.choice = null);
                io.to(roomCode).emit('updatePlayers', room.players);
            }
        }, 1000);
    }

    socket.on('makeChoice', ({ roomCode, choice, playerIndex }) => {
        const room = rooms[roomCode];
        if (!room || !room.roundActive) return;
        const player = room.players[playerIndex];
        if (!player || player.choice) return;
        
        player.choice = choice;
        io.to(roomCode).emit('updatePlayers', room.players);

        if (room.players[0].choice && room.players[1].choice) {
            room.roundActive = false;
            const result = calculateResult(room.players[0].choice, room.players[1].choice);
            const winner = result === 'player0' ? 0 : result === 'player1' ? 1 : -1;
            
            if (winner !== -1) {
                room.scores[winner]++;
            }
            
            io.to(roomCode).emit('gameResult', {
                result,
                choices: [room.players[0].choice, room.players[1].choice],
                names: [room.players[0].name, room.players[1].name],
                scores: room.scores,
                winner: winner
            });

            if (room.scores[0] >= room.targetScore || room.scores[1] >= room.targetScore) {
                const champion = room.scores[0] >= room.targetScore ? 0 : 1;
                io.to(roomCode).emit('gameOver', {
                    champion,
                    name: room.players[champion].name,
                    scores: room.scores
                });
                setTimeout(() => {
                    room.scores = { 0: 0, 1: 0 };
                    room.players.forEach(p => p.choice = null);
                    io.to(roomCode).emit('resetGame');
                    startCountdown(roomCode);
                }, 5000);
                return;
            }

            setTimeout(() => {
                if (room.gameState !== 'gameover') {
                    startCountdown(roomCode);
                }
            }, 3000);
        }
    });

    socket.on('disconnect', () => {
        for (const [roomCode, room] of Object.entries(rooms)) {
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(roomCode).emit('updatePlayers', room.players);
                if (room.players.length === 0) {
                    delete rooms[roomCode];
                }
                break;
            }
        }
    });
});

function calculateResult(choice1, choice2) {
    if (choice1 === choice2) return 'draw';
    if ((choice1 === 'tas' && choice2 === 'makas') ||
        (choice1 === 'kagit' && choice2 === 'tas') ||
        (choice1 === 'makas' && choice2 === 'kagit')) {
        return 'player0';
    }
    return 'player1';
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu çalışıyor: http://localhost:${PORT}`);
    console.log(`📱 Mobilden erişim: http://${localIp}:${PORT}`);
});
