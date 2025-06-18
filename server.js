// index.js

// --- import knihoven a nastavení serveru ---
const express   = require('express');
const http      = require('http');
const socketIo  = require('socket.io');
const path      = require('path');

// Node v22+ už má fetch, pro starší odkomentuj následující:
// const fetch = require('node-fetch');

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server);

const PORT = process.env.PORT || 3000;

// --- proměnné pro stav hry ---
let players            = [];            // pole objektů {id, name, score}
let currentPlayerIndex = 0;             // index hráče, který je právě na tahu
let usedCards          = new Set();     // mapa cardId, abychom neotevřeli dvakrát stejnou otázku
let pendingQuestions   = {};            // cardId → { correct: 'odpověď', points: číslo }

// definice kategorií a bodů
const categories = ['animals','geo','history','science'];
const points     = [100,200,300,400,500];
// mapujeme naše kategorie na ID v OpenTDB
const categoryMap = {
  animals:  27,
  geo:      22,
  history:  23,
  science:  21
};

// statické soubory (HTML, CSS, JS) servírujeme z /public
app.use(express.static(path.join(__dirname, 'public')));

// --- hlavní socket.io logika ---
io.on('connection', socket => {
  console.log('Nové připojení:', socket.id);

  // 1) hráč se přihlásí jménem
  socket.on('joinGame', name => {
    name = name?.trim();
    if (!name) {
      // pokud nezadá jméno, vrátíme chybu
      socket.emit('errorMessage', 'Musíš zadat jméno');
      return;
    }
    if (players.length >= 2) {
      // už jsou dva, nepřijímáme další
      socket.emit('gameFull');
      return;
    }
    // přidáme hráče do pole
    players.push({ id: socket.id, name, score: 0 });
    socket.emit('waiting');           // klient ví, že musí počkat
    io.emit('updatePlayers', players); // všechny klienty upozorníme na nové skóre

    // jakmile jsou dva hráči, startujeme hru
    if (players.length === 2) {
      currentPlayerIndex = 0;
      usedCards.clear();
      pendingQuestions = {};
      io.emit('startGame', {
        categories,
        points,
        players,
        currentTurnId: players[currentPlayerIndex].id
      });
    }
  });

  // 2) hráč klikl na kartu (jen aktivní hráč)
  socket.on('cardClicked', async cardId => {
    const player = players[currentPlayerIndex];
    if (!player || socket.id !== player.id) return;
    if (usedCards.has(cardId)) return;  // už jsme tuto kartu otevřeli

    usedCards.add(cardId);              // označíme kartu jako "used"

    // vytáhneme kategorii a body z cardId (např. "animals-200")
    const [cat, ptStr] = cardId.split('-');
    const pts          = parseInt(ptStr, 10);
    const diff         = pts <= 200 ? 'easy'
                     : pts <= 400 ? 'medium'
                                   : 'hard';
    const url = `https://opentdb.com/api.php?amount=1`
              + `&category=${categoryMap[cat]}`
              + `&difficulty=${diff}`
              + `&type=multiple`;

    try {
      // stáhneme otázku z OpenTDB
      const res  = await fetch(url);
      const json = await res.json();
      const q    = json.results[0];

      // smícháme správnou a špatné odpovědi
      const answers = [
        ...q.incorrect_answers,
        q.correct_answer
      ].sort(() => Math.random() - 0.5);

      // nejprve všem klientům pošleme, že se karta používá
      io.emit('cardUsed', cardId);
      // pak aktivnímu hráči odešleme samotnou otázku
      socket.emit('showQuestion', {
        cardId,
        question: q.question,
        answers,
        correct: q.correct_answer
      });

      // uložíme odpověď na server pro pozdější validaci
      pendingQuestions[cardId] = { correct: q.correct_answer, points: pts };
    } catch (err) {
      console.error('Chyba při načítání otázky:', err);
      socket.emit('errorMessage', 'Nepodařilo se načíst otázku.');
    }
  });

  // 3) hráč odeslal odpověď
  socket.on('answerSubmitted', ({ cardId, answer }) => {
    const player = players[currentPlayerIndex];
    if (!player || socket.id !== player.id) return;

    const pending = pendingQuestions[cardId];
    if (!pending) return;  // nestihli jsme uložit otázku

    const isCorrect = answer === pending.correct;
    const pts       = pending.points;

    // přičteme body jen za správnou odpověď
    if (isCorrect) player.score += pts;

    delete pendingQuestions[cardId];            // vyčistíme pending
    currentPlayerIndex = 1 - currentPlayerIndex; // přepneme tah

    // posíláme aktualizaci skóre a tahu všem
    io.emit('updateScore', {
      playerId: player.id,
      newScore: player.score,
      isCorrect,
      points: pts
    });
    io.emit('changeTurn', {
      currentPlayer: players[currentPlayerIndex].id
    });

    // kontrola, jestli už jsou všechny karty použity
    const total = categories.length * points.length;
    if (usedCards.size === total) {
      // najdeme vítěze nebo remízu
      const [p1, p2] = players;
      let winnerName;
      if      (p1.score > p2.score) winnerName = p1.name;
      else if (p2.score > p1.score) winnerName = p2.name;
      else                            winnerName = 'Remíza';

      io.emit('gameOver', {
        winnerName,
        leaderboard: players
          .slice()
          .sort((a, b) => b.score - a.score)
      });
    }
  });

  // 4) někdo se odpojí
  socket.on('disconnect', () => {
    console.log('Odpojení:', socket.id);
    // vyhodíme ho ze seznamu a resetneme hru
    players = players.filter(p => p.id !== socket.id);
    usedCards.clear();
    pendingQuestions = {};
    io.emit('updatePlayers', players);
    io.emit('playerDisconnected');
  });
});

// 5) spustíme HTTP server
server.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT}`);
});
