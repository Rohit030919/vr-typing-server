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

  socket.on('join-room', ({ roomId, playerName }) => {
    socket.join(roomId);
    console.log(`${socket.id} (${playerName}) joined room ${roomId}`);

    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    
    // Check if player is already in room
    const existingPlayer = rooms[roomId].find(player => player.socketId === socket.id);
    if (!existingPlayer) {
      rooms[roomId].push({
        socketId: socket.id,
        playerName: playerName,
        stats: null
      });
    }

    // Emit to ALL players in room when 2 players are present
    if (rooms[roomId].length === 2) {
      io.to(roomId).emit('both-players-joined');
      console.log(`Both players joined in room ${roomId}`);
    }
  });

  socket.on('progress', ({ roomId, index }) => {
    socket.to(roomId).emit('opponent-progress', { index });
  });

  socket.on('user-finished', ({ roomId, userData }) => {
    if (rooms[roomId]) {
      const userIndex = rooms[roomId].findIndex(player => player.socketId === socket.id);
      if (userIndex !== -1) {
        rooms[roomId][userIndex].stats = userData;
        socket.to(roomId).emit('opponent-finished', userData);
        console.log(`Player ${userData.name} finished with WPM: ${userData.wpm}, Accuracy: ${userData.accuracy}%`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    for (const roomId in rooms) {
      const originalLength = rooms[roomId].length;
      rooms[roomId] = rooms[roomId].filter((player) => player.socketId !== socket.id);
      
      if (originalLength > rooms[roomId].length && rooms[roomId].length > 0) {
        io.to(roomId).emit('opponent-disconnected');
      }
      
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
        console.log(`Room ${roomId} deleted`);
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});