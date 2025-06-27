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
  }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Track connection time for debugging
  const connectionTime = new Date();
  console.log(`Connection time: ${connectionTime.toISOString()}`);

  socket.on('join-room', ({ roomId, playerName }) => {
    try {
      console.log(`Join attempt: ${playerName} to room ${roomId}`);
      
      // Initialize room if doesn't exist
      if (!rooms[roomId]) {
        rooms[roomId] = [];
        console.log(`New room created: ${roomId}`);
      }

      // Remove previous instance if reconnecting
      rooms[roomId] = rooms[roomId].filter(player => 
        player.socketId !== socket.id && player.playerName !== playerName
      );

      // Add new player data
      const playerData = {
        socketId: socket.id,
        playerName: playerName.trim(),
        stats: null,
        connected: true,
        joinTime: new Date()
      };
      rooms[roomId].push(playerData);

      console.log(`Current players in ${roomId}:`, rooms[roomId].map(p => p.playerName));

      // Join the socket room
      socket.join(roomId);

      // Notify all in room about current players
      io.to(roomId).emit('room-update', {
        players: rooms[roomId].map(p => ({
          name: p.playerName,
          connected: p.connected
        }))
      });

      // Start game if 2 unique players
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
      console.error('Error in progress:', err);
    }
  });

  socket.on('user-finished', ({ roomId, userData }) => {
    try {
      console.log(`User finished: ${userData.name} in ${roomId}`);
      
      if (rooms[roomId]) {
        const playerIndex = rooms[roomId].findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          rooms[roomId][playerIndex].stats = userData;
          console.log(`Stats saved for ${userData.name}`);
          
          // Only send to opponent if they're still connected
          const opponent = rooms[roomId].find(p => p.socketId !== socket.id);
          if (opponent?.connected) {
            socket.to(roomId).emit('opponent-finished', userData);
          }
        }
      }
    } catch (err) {
      console.error('Error in user-finished:', err);
    }
  });

  socket.on('disconnect', () => {
    try {
      console.log(`User disconnected: ${socket.id}`);
      
      for (const roomId in rooms) {
        const playerIndex = rooms[roomId].findIndex(p => p.socketId === socket.id);
        
        if (playerIndex !== -1) {
          // Mark as disconnected but keep data
          rooms[roomId][playerIndex].connected = false;
          console.log(`Marked ${rooms[roomId][playerIndex].playerName} as disconnected`);
          
          // Notify remaining player
          const remainingPlayer = rooms[roomId].find(p => p.connected);
          if (remainingPlayer) {
            io.to(remainingPlayer.socketId).emit('opponent-disconnected');
          }
        }

        // Clean empty rooms after delay
        setTimeout(() => {
          if (rooms[roomId] && rooms[roomId].every(p => !p.connected)) {
            console.log(`Cleaning up room ${roomId}`);
            delete rooms[roomId];
          }
        }, 30000); // 30 second delay
      }
    } catch (err) {
      console.error('Error in disconnect:', err);
    }
  });

  // Add ping-pong for connection health
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
    totalPlayers: Object.values(rooms).reduce((acc, room) => acc + room.length, 0)
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket path: ${io.path()}`);
});