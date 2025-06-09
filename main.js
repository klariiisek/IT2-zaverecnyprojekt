// public/main.js
const socket = io();
let myPlayerId = null;
let currentPlayer = 1;

// === KATEGORIE A BODY ===
const categories = ['animals', 'geo', 'history', 'science'];
const points = [100, 200, 300, 400, 500];

// === VYTVOŘ GRID ===
const grid = document.getElementById('grid');
categories.forEach(cat => {
  points.forEach(pt => {
    const card = document.createElement('div');
    card.classList.add('card');
    card.setAttribute('data-id', `${cat}-${pt}`);
    card.textContent = pt;
    grid.appendChild(card);
  });
});

// === PŘIPOJ UDÁLOSTI NA KARTIČKY ===
function attachCardListeners() {
  document.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const cardId = card.getAttribute('data-id');
      if (card.classList.contains('used')) return;
      if (myPlayerId !== currentPlayer) {
        alert("It's not your turn!");
        return;
      }
      console.log(`Karta kliknuta: ${cardId} hráčem ${myPlayerId}`);
      socket.emit('cardClicked', cardId);
    });
  });
}
attachCardListeners();

// === SOCKETY ===
socket.on('playerAssigned', (id) => {
  myPlayerId = id;
  document.getElementById('playerId').textContent = `You are Player ${id}`;
  console.log("Moje ID:", myPlayerId);
});

socket.on('gameFull', () => {
  alert('Game is full. Only two players can join.');
});

socket.on('showQuestion', ({ cardId, by }) => {
  const card = document.querySelector(`[data-id="${cardId}"]`);
  if (card) {
    card.classList.add('used');
    showQuestion(cardId);
  }
});

socket.on('updateScore', ({ playerId, isCorrect, points }) => {
  const el = document.getElementById(`score${playerId}`);
  const oldScore = parseInt(el.textContent) || 0;
  if (isCorrect) el.textContent = oldScore + points;
});

socket.on('changeTurn', ({ currentPlayer: cp }) => {
  currentPlayer = cp;
  document.getElementById('currentTurn').textContent = `Player ${cp}'s turn`;
  console.log("Aktuální tah hráče:", currentPlayer);
});

socket.on('playerDisconnected', () => {
  alert('Other player disconnected. Game reset.');
  location.reload();
});

// === MODAL ===
function showQuestion(cardId) {
  fetchQuestion(cardId).then(({ question, answers, correct }) => {
    document.getElementById('question').innerHTML = question;
    const answersDiv = document.getElementById('answers');
    answersDiv.innerHTML = '';

    answers.forEach((answer) => {
      const btn = document.createElement('button');
      btn.textContent = answer;
      btn.onclick = () => {
        const isCorrect = answer === correct;
        const points = parseInt(cardId.split('-')[1]);
        document.getElementById('feedback').textContent = isCorrect ? "Correct!" : `Wrong! (${correct})`;
        socket.emit('answerSubmitted', { isCorrect, points });
        console.log(`Odpověď: ${answer}, Správně: ${isCorrect}`);
      };
      answersDiv.appendChild(btn);
    });

    document.getElementById('modal').classList.remove('hidden');
  }).catch(err => {
    console.error('Chyba při získání otázky:', err);
    alert('Nepodařilo se načíst otázku.');
  });
}

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('feedback').textContent = '';
});

// === FETCH OTÁZKY ===
function fetchQuestion(cardId) {
  const [category, points] = cardId.split('-');
  const difficulty = getDifficultyFromPoints(points);
  const categoryMap = {
    animals: 27,
    geo: 22,
    history: 23,
    science: 21
  };
  const url = `https://opentdb.com/api.php?amount=1&category=${categoryMap[category]}&difficulty=${difficulty}&type=multiple`;
  console.log("URL dotazu:", url);
  return fetch(url)
    .then(res => res.json())
    .then(data => {
      console.log("Odpověď z API:", data);
      if (!data.results || data.results.length === 0) {
        throw new Error('Žádná otázka nenalezena.');
      }
      const q = data.results[0];
      const allAnswers = [...q.incorrect_answers, q.correct_answer];
      const shuffled = allAnswers.sort(() => Math.random() - 0.5);
      return {
        question: q.question,
        answers: shuffled,
        correct: q.correct_answer
      };
    });
}

function getDifficultyFromPoints(points) {
  points = parseInt(points);
  if (points <= 200) return 'easy';
  if (points <= 400) return 'medium';
  return 'hard';
}
