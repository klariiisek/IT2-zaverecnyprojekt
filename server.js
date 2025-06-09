const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let currentPlayer = 1;

io.on('connection', (socket) => {
  const numPlayers = Object.keys(players).length;

  if (numPlayers >= 2) {
    socket.emit('gameFull');
    return;
  }

  const assignedId = numPlayers === 0 ? 1 : 2;
  players[socket.id] = assignedId;

  socket.emit('playerAssigned', assignedId);
  io.emit('changeTurn', { currentPlayer });

  console.log(`Player ${assignedId} connected: ${socket.id}`);

  socket.on('cardClicked', (cardId) => {
    const playerId = players[socket.id];
    if (playerId !== currentPlayer) return;

    io.emit('showQuestion', { cardId, by: playerId });
  });

  socket.on('answerSubmitted', ({ isCorrect, points }) => {
    const playerId = players[socket.id];
    if (isCorrect) {
      io.emit('updateScore', { playerId, isCorrect, points });
    }

    currentPlayer = currentPlayer === 1 ? 2 : 1;
    io.emit('changeTurn', { currentPlayer });
  });

  socket.on('disconnect', () => {
    const playerId = players[socket.id];
    console.log(`Player ${playerId} disconnected: ${socket.id}`);
    delete players[socket.id];
    currentPlayer = 1;
    io.emit('playerDisconnected');
  });
});

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
