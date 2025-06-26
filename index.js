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
    
    // Check if player is already in room (prevents duplicates)
    const existingPlayer = rooms[roomId].find(player => player.socketId === socket.id);
    if (!existingPlayer) {
      rooms[roomId].push({
        socketId: socket.id,
        playerName: playerName,
        stats: null
      });
    }

    if (rooms[roomId].length === 2) {
      io.to(roomId).emit('both-players-joined');
      console.log(`Both players joined in room ${roomId}`);
    }
  });

  socket.on('progress', ({ roomId, index }) => {
    socket.to(roomId).emit('opponent-progress', { index });
  });

  socket.on('user-finished', ({ roomId, userData }) => {
    // Update the user's stats in the room
    if (rooms[roomId]) {
      const userIndex = rooms[roomId].findIndex(player => player.socketId === socket.id);
      if (userIndex !== -1) {
        rooms[roomId][userIndex].stats = userData;
        
        // Send the stats to the opponent
        socket.to(roomId).emit('opponent-finished', userData);
        
        console.log(`Player ${userData.name} finished with WPM: ${userData.wpm}, Accuracy: ${userData.accuracy}%`);
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Clean up rooms when a player disconnects
    for (const roomId in rooms) {
      const originalLength = rooms[roomId].length;
      rooms[roomId] = rooms[roomId].filter((player) => player.socketId !== socket.id);
      
      // If a player left, notify the remaining player
      if (originalLength > rooms[roomId].length && rooms[roomId].length > 0) {
        socket.to(roomId).emit('opponent-disconnected');
      }
      
      // Delete room if empty
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