// public/main.js

const socket = io();  // připojím se na socket.io server

// proměnné pro stav hry
let players = [];             // pole s objekty {id, name, score}
let currentPlayerId = null;   // ID hráče, který je právě na tahu
let categories = [];          // názvy kategorií z serveru
let points = [];              // hodnoty bodů (100,200…)

// 1) Přihlášení hráče – jednoduché okno s zadáním jména
document
  .getElementById('joinBtn')
  .addEventListener('click', () => {
    const name = document.getElementById('nickname').value.trim();
    if (!name) {
      // když je input prázdný, hráč musí zadat jméno
      return alert('Zadej prosím jméno');
    }
    socket.emit('joinGame', name);                     // pošlu jméno serveru
    document.getElementById('overlay').style.display = 'none'; // schovám overlay
  });

// 2) Čekání na druhého hráče
socket.on('waiting', () => {
  // pokud je jen jeden hráč, zobrazíme zprávu
  document.getElementById('currentTurn').textContent =
    'Čeká se na druhého hráče…';
});

// 3) Když server pošle aktualizaci seznamu hráčů
socket.on('updatePlayers', srv => {
  players = srv;      // uložíme si nové pole hráčů
  renderPlayers();    // překreslíme panel skóre
});

// 4) Start hry – přijde kategorie, body, hráči a první tah
socket.on('startGame', data => {
  categories      = data.categories;     // ['animals','geo',…]
  points          = data.points;         // [100,200,300,400,500]
  players         = data.players;        // [ {id,name,score}, … ]
  currentPlayerId = data.currentTurnId;  // kdo je na tahu

  renderPlayers();    // vykreslí jména + skóre
  renderGrid();       // vykreslí grid s kartami
  highlightTurn();    // zvýrazní aktivního hráče
  attachGridListener(); // přidá listener pro kliknutí na karty

  // zobrazíme, kdo je na tahu
  const cur = players.find(p => p.id === currentPlayerId);
  document.getElementById('currentTurn').textContent =
    `Na tahu: ${cur.name}`;
});

// 5) Označení použité karty – přijde všem klientům
socket.on('cardUsed', cardId => {
  const c = document.querySelector(`[data-id="${cardId}"]`);
  if (c) c.classList.add('used');  // zabarvíme kartu šedě
});

// 6) Zobrazení otázky – jen hráči, který je na tahu
socket.on(
  'showQuestion',
  ({ cardId, question, answers, correct }) => {
    // naplníme otázku do modalu
    document.getElementById('question').textContent =
      decodeHTML(question);

    const answersDiv = document.getElementById('answers');
    answersDiv.innerHTML = '';   // vymažeme předchozí odpovědi

    // z cardId "animals-200" získám číslo bodů
    const pts = parseInt(cardId.split('-')[1], 10);
    const closeBtn = document.getElementById('closeModal');
    closeBtn.disabled = true;    // hráč nesmí zavřít modal před odpovědí
    document.getElementById('feedback').textContent = '';

    // vytvoříme tlačítko pro každou možnost
    answers.forEach(ans => {
      const btn = document.createElement('button');
      btn.textContent = decodeHTML(ans);
      btn.dataset.answer = ans;
      btn.onclick = () => {
        // po kliknutí deaktivujeme všechna tlačítka
        answersDiv.querySelectorAll('button').forEach(b => {
          b.disabled = true;
          // zvýrazníme správnou (zelená) a vybranou špatnou (červená)
          if (b.dataset.answer === correct) b.classList.add('correct');
          if (b.dataset.answer === ans && ans !== correct)
            b.classList.add('wrong');
        });

        // textový feedback pod tlačítky
        document.getElementById('feedback').textContent =
          ans === correct
            ? `Správně! +${pts} b`
            : `Špatně! Správná odpověď: ${decodeHTML(correct)}`;

        socket.emit('answerSubmitted', {
          cardId,
          answer: ans
        }); // pošleme odpověď serveru

        closeBtn.disabled = false; // povolíme zavření modalu
      };
      answersDiv.appendChild(btn);
    });

    // konečně modal otevřeme
    document.getElementById('modal').classList.remove('hidden');
  }
);

// 7) Aktualizace skóre – jen text, barvy si necháme na highlightTurn
socket.on('updateScore', ({ playerId, newScore }) => {
  const pDiv = document.getElementById(`player-${playerId}`);
  if (!pDiv) return;
  const name = pDiv.dataset.name;  
  pDiv.textContent = `${name}: ${newScore} b`;
});

// 8) Přepnutí tahu
socket.on('changeTurn', ({ currentPlayer }) => {
  currentPlayerId = currentPlayer;
  highlightTurn();  // přemaže barvu u obou hráčů
  // necháme modal otevřený, hráč ji zavře až po zodpovězení
  const cur = players.find(p => p.id === currentPlayerId);
  document.getElementById('currentTurn').textContent =
    `Na tahu: ${cur.name}`;
});

// 9) Konec hry – jednoduchý alert s výsledky
socket.on('gameOver', ({ winnerName, leaderboard }) => {
  alert(
    `Konec hry! Vítěz: ${winnerName}\n` +
      leaderboard
        .map(p => `${p.name}: ${p.score} b`)
        .join('\n')
  );
});

// ————————————————————————————————————————————————
// HELPERS: funkce pro vykreslení a další drobnosti
// ————————————————————————————————————————————————

/**
 * Vykreslí seznam hráčů se skóre
 */
function renderPlayers() {
  const el = document.getElementById('scores');
  el.innerHTML = '';
  players.forEach(p => {
    const d = document.createElement('div');
    d.id = 'player-' + p.id;
    d.dataset.name = p.name;
    d.textContent = `${p.name}: ${p.score} b`;
    el.appendChild(d);
  });
}

/**
 * Vykreslí grid: nejdřív hlavičky kategorií, pak body
 */
function renderGrid() {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  // hlavičky sloupců
  categories.forEach(cat => {
    const h = document.createElement('div');
    h.className = 'header-cell';
    h.textContent = cat.toUpperCase();
    grid.appendChild(h);
  });

  // řádky s body 100 → 500
  points.forEach(pt => {
    categories.forEach(cat => {
      const card = document.createElement('div');
      card.classList.add('card', cat); // přidáme i třídu kategorie
      card.dataset.id = `${cat}-${pt}`;
      card.textContent = pt;
      grid.appendChild(card);
    });
  });
}

/**
 * Přidá klikání na karty – jen renderGrid() je vytvoří
 */
function attachGridListener() {
  document.getElementById('grid').addEventListener('click', e => {
    const card = e.target.closest('.card');
    if (!card || card.classList.contains('used')) return;
    if (socket.id !== currentPlayerId) {
      // zabráníme cizím tahům
      return alert('Není tvůj tah!');
    }
    socket.emit('cardClicked', card.dataset.id);
  });
}

/**
 * Zvýrazní hráče, který je na tahu – zeleně, druhého červeně
 */
function highlightTurn() {
  players.forEach(p => {
    const el = document.getElementById('player-' + p.id);
    if (!el) return;
    el.style.color = p.id === currentPlayerId ? 'lime' : 'red';
  });
}

/**
 * Dekóduje HTML entity z API (OpenTDB posílá &quot; apod.)
 */
function decodeHTML(str) {
  return new DOMParser()
    .parseFromString(str, 'text/html')
    .body.textContent;
}

// Zavírací tlačítko modalu – smaže feedback a schová modal
document
  .getElementById('closeModal')
  .addEventListener('click', () => {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('feedback').textContent = '';
  });