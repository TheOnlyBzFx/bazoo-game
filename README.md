# Bazoo Game — Arena Piazza Leonardo

Gioco 1 contro 1 in tempo reale, stile Clash Royale, ambientato a Piazza Leonardo da Vinci (Milano).
I giocatori **non hanno bisogno di nessun account**: si apre il link e si gioca.

## Com'è fatto

```
server.js            server Node.js: pagina del gioco + partite in tempo reale (WebSocket)
public/sim.js        motore della battaglia (carte, truppe, torri) — gira sul server e, per l'allenamento, nel browser
public/index.html    il gioco (arena 3D, carte, omini, effetti, collegamento al server)
public/vendor/       three.js (grafica 3D)
render.yaml          configurazione pronta per Render.com
```

Il server è l'arbitro della partita: fa girare la battaglia 20 volte al secondo (movimento, attacchi,
torri, elisir) e manda lo stato ai due giocatori 10 volte al secondo. I client mandano solo
"gioco questa carta qui". Regole e carte sono in `public/sim.js` (oggetti `CFG` e `CARDS`).

## Provarlo sul tuo computer

Serve Node.js 18 o più recente (https://nodejs.org).

```
npm install
npm start
```

Poi apri http://localhost:3000. Per provare da solo una partita a due, apri il link della partita
in una seconda finestra in incognito.

## Metterlo online gratis (Render.com)

1. Crea un account su https://github.com e un nuovo repository (es. `arena-piazza-leonardo`).
2. Carica dentro tutti i file di questa cartella (anche trascinandoli nella pagina del repository:
   "Add file" → "Upload files").
3. Crea un account su https://render.com (puoi entrare direttamente con GitHub).
4. "New" → "Web Service" → scegli il repository.
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
5. Dopo un paio di minuti Render ti dà un indirizzo tipo `https://arena-piazza-leonardo.onrender.com`.
   È il link del gioco: crea una partita e manda al tuo amico il link con il codice.

Nota sul piano gratuito: se nessuno gioca per 15 minuti il server "dorme"; la prima apertura
successiva impiega circa un minuto a svegliarlo, poi va normale.

Ogni volta che aggiorni i file sul repository GitHub, Render ripubblica il gioco da solo.
