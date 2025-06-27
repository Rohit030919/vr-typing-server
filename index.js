const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Track connection time
  const connectionTime = new Date();
  console.log(`Connection established at: ${connectionTime.toISOString()}`);

  socket.on('join-room', ({ roomId, playerName }) => {
    try {
      console.log(`Player ${playerName} joining room ${roomId}`);

      // Initialize room if it doesn't exist
      if (!rooms[roomId]) {
        rooms[roomId] = [];
        console.log(`Created new room: ${roomId}`);
      }

      // Remove any existing player with same socket ID or name
      rooms[roomId] = rooms[roomId].filter(
        player => player.socketId !== socket.id && player.playerName !== playerName
      );

      // Add new player to room
      const playerData = {
        socketId: socket.id,
        playerName: playerName.trim(),
        stats: null,
        connected: true,
        joinTime: new Date()
      };
      rooms[roomId].push(playerData);

      // Join the socket room
      socket.join(roomId);

      // Notify all players in room about current status
      io.to(roomId).emit('room-update', {
        players: rooms[roomId].map(p => ({
          name: p.playerName,
          connected: p.connected
        }))
      });

      // Start game if 2 players are present
      if (rooms[roomId].length === 2) {
        console.log(`Starting game in room ${roomId}`);
        io.to(roomId).emit('both-players-joined');
      }

    } catch (err) {
      console.error('Error in join-room:', err);
    }
  });

  socket.on('progress', ({ roomId, index }) => {
    try {
      socket.to(roomId).emit('opponent-progress', { 
        index,
        timestamp: Date.now() 
      });
    } catch (err) {
      console.error('Error handling progress:', err);
    }
  });

  socket.on('user-finished', ({ roomId, userData }) => {
    try {
      console.log(`Player ${userData.name} finished with WPM: ${userData.wpm}`);
      
      if (rooms[roomId]) {
        const playerIndex = rooms[roomId].findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          // Save player stats
          rooms[roomId][playerIndex].stats = userData;
          
          // Find opponent
          const opponent = rooms[roomId].find(p => p.socketId !== socket.id);
          
          // Only send to opponent if they're connected
          if (opponent?.connected) {
            socket.to(roomId).emit('opponent-finished', userData);
          }
        }
      }
    } catch (err) {
      console.error('Error handling user-finished:', err);
    }
  });

  socket.on('disconnect', () => {
    try {
      console.log(`Player disconnected: ${socket.id}`);
      
      // Update all rooms this player was in
      for (const roomId in rooms) {
        const playerIndex = rooms[roomId].findIndex(p => p.socketId === socket.id);
        
        if (playerIndex !== -1) {
          // Mark as disconnected but keep data
          rooms[roomId][playerIndex].connected = false;
          console.log(`Marked player as disconnected in room ${roomId}`);
          
          // Notify remaining players
          const remainingPlayers = rooms[roomId].filter(p => p.connected);
          if (remainingPlayers.length > 0) {
            io.to(remainingPlayers[0].socketId).emit('opponent-disconnected');
          }
        }

        // Clean up empty rooms after delay
        setTimeout(() => {
          if (rooms[roomId] && rooms[roomId].every(p => !p.connected)) {
            console.log(`Cleaning up room ${roomId}`);
            delete rooms[roomId];
          }
        }, 30000); // 30 second delay
      }
    } catch (err) {
      console.error('Error handling disconnect:', err);
    }
  });

  // Health check
  socket.on('ping', (cb) => {
    if (typeof cb === 'function') {
      cb('pong');
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    rooms: Object.keys(rooms).length,
    totalPlayers: Object.values(rooms).reduce((acc, room) => acc + room.length, 0),
    uptime: process.uptime()
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket path: ${io.path()}`);
});