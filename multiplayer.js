/* ============================================================================
   FAZIONI — MULTIPLAYER P2P SENZA CHIAVI (WEBRTC / PEERJS)
   ============================================================================ */

const Multiplayer = {
  peer: null,
  connections: [], // Usato dall'Host per tenere traccia dei client
  hostConnection: null, // Usato dai Client per comunicare con l'Host
  isHost: false,
  connectedPlayers: [],

  init() {
    // PeerJS non richiede chiavi!
  },

  async joinRoom(roomCode, playerData) {
    const roomID = `fazioni-game-${roomCode.toLowerCase()}`;
    this.connectedPlayers = [playerData];

    // Crea la propria identità sulla rete pubblica
    this.peer = new Peer({ debug: 2 });

    this.peer.on('open', (myId) => {
      // 1. Tenta di collegarsi alla stanza come Client
      const conn = this.peer.connect(roomID, { reliable: true });

      conn.on('open', () => {
        // La stanza esiste, sono un CLIENT!
        this.isHost = false;
        this.hostConnection = conn;
        
        // Invia i propri dati all'Host
        conn.send({ type: 'JOIN_ANNOUNCE', player: playerData });

        // Ascolta i messaggi dall'Host
        conn.on('data', (msg) => this.handleIncomingMessage(msg, conn));
      });

      conn.on('error', () => {
        this.becomeHost(roomID, playerData);
      });

      // Timeout se l'Host non risponde (es. stanza vuota)
      setTimeout(() => {
        if (!this.hostConnection || !this.hostConnection.open) {
          this.becomeHost(roomID, playerData);
        }
      }, 1500);
    });
  },

  // 2. Se la stanza non esiste, divento io l'HOST
  becomeHost(roomID, playerData) {
    this.peer.destroy(); // Distrugge l'ID casuale e ne crea uno col nome della stanza
    
    this.peer = new Peer(roomID, { debug: 2 });
    this.peer.on('open', () => {
      this.isHost = true;
      UI.setBanner(`Sei l'Host della stanza ${roomID.replace('fazioni-game-', '').toUpperCase()}`);
    });

    // Quando un Client si collega a me
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        this.connections.push(conn);
      });

      conn.on('data', (msg) => {
        // Smista i messaggi in base al tipo
        if (msg.type === 'JOIN_ANNOUNCE') {
          this.connectedPlayers.push(msg.player);
          this.broadcast({ type: 'LOBBY_SYNC', list: this.connectedPlayers });
          UI.updateLobbyList(this.connectedPlayers);
        } else {
          // Se ricevo un'azione di gioco, la eseguo e la inoltro agli altri
          this.handleIncomingMessage(msg, conn);
          this.broadcast(msg, conn.peer); // Inoltra a tutti tranne al mittente
        }
      });

      conn.on('close', () => {
        this.connections = this.connections.filter(c => c.peer !== conn.peer);
      });
    });
  },

  // Invia un messaggio (Se sono Host, a tutti. Se sono Client, all'Host che poi lo smisterà)
  sendAction(actionType, data) {
    const payload = { type: actionType, sender: GameState.activePlayerIndex, ...data };
    const msg = { type: 'GAME_ACTION', payload };

    if (this.isHost) {
      this.broadcast(msg);
    } else if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(msg);
    }
  },

  // (Solo Host) Invia un messaggio a tutti i client connessi
  broadcast(msg, excludePeerId = null) {
    this.connections.forEach(conn => {
      if (conn.open && conn.peer !== excludePeerId) {
        conn.send(msg);
      }
    });
  },

  // Smista i messaggi ricevuti dalla rete
  handleIncomingMessage(msg, sourceConn) {
    if (msg.type === 'LOBBY_SYNC') {
      this.connectedPlayers = msg.list;
      UI.updateLobbyList(this.connectedPlayers);
    } else if (msg.type === 'GAME_ACTION') {
      this.handleRemoteAction(msg.payload);
    }
  },

  handleRemoteAction(payload) {
    if (payload.type === 'SYNC_STATE') {
      Object.assign(GameState, payload.state);
      UI.renderTable();
    }
    // Qui puoi espandere in futuro chiamando i metodi di Engine per sincronizzare singole mosse
    // es: if (payload.type === 'ATTACK') Engine.resolveCombat(payload.attackerIdx, payload.targetIdx, payload.card);
  }
};