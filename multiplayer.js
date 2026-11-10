/* ============================================================================
   FAZIONI — MULTIPLAYER P2P SENZA CHIAVI (FIX STANZA UNICA HOST/CLIENT)
   ============================================================================ */

const Multiplayer = {
  peer: null,
  connections: [],
  hostConnection: null,
  isOnlineRoom: false,
  isHost: true,
  roomCode: null,
  myPlayer: null,
  connectedPlayers: [],

  init() {},

  joinRoom(roomCode, playerData) {
    this.isOnlineRoom = true;
    this.roomCode = roomCode.toUpperCase();
    this.myPlayer = playerData;
    const roomID = `fazioni-room-v14-${this.roomCode.toLowerCase()}`;

    if (this.peer) this.peer.destroy();

    // Tenta subito di creare la stanza con l'ID fisso (Diventa HOST se la stanza non esiste)
    this.peer = new Peer(roomID, { debug: 1 });

    this.peer.on("open", () => {
      // Stanza libera: sono io l'HOST!
      this.isHost = true;
      this.connectedPlayers = [{ ...playerData, isHost: true }];
      UI.updateLobbyList(this.connectedPlayers);
      UI.updateStartButtonState();
      UI.showToastPopup(`Stanza ${this.roomCode} creata! Sei l'Host.`, 1800);
    });

    // Quando un Client si collega a me (Host)
    this.peer.on("connection", (conn) => {
      conn.on("open", () => {
        if (!this.connections.includes(conn)) this.connections.push(conn);
      });

      conn.on("data", (msg) => {
        if (msg.type === "JOIN_REQUEST") {
          const exists = this.connectedPlayers.some((p) => p.id === msg.player.id);
          if (!exists && this.connectedPlayers.length < 4) {
            this.connectedPlayers.push({ ...msg.player, isHost: false });
          }
          UI.updateLobbyList(this.connectedPlayers);
          this.broadcast({ type: "LOBBY_SYNC", list: this.connectedPlayers });
        } else {
          this.handleIncomingMessage(msg);
          this.broadcast(msg, conn.peer);
        }
      });

      conn.on("close", () => {
        this.connections = this.connections.filter((c) => c.peer !== conn.peer);
      });
    });

    // Se l'ID della stanza è già occupato da un altro iPhone -> Sono un CLIENT (Ospite)!
    this.peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        this.connectAsClient(roomID, playerData);
      } else {
        UI.showToastPopup("Errore di rete P2P: " + err.type, 2000);
      }
    });
  },

  connectAsClient(roomID, playerData) {
    this.isHost = false;
    UI.updateStartButtonState();

    this.peer = new Peer({ debug: 1 });
    this.peer.on("open", () => {
      const conn = this.peer.connect(roomID, { reliable: true });
      this.hostConnection = conn;

      conn.on("open", () => {
        UI.showToastPopup(`Connesso alla stanza ${this.roomCode} come Ospite!`, 1800);
        conn.send({ type: "JOIN_REQUEST", player: playerData });
      });

      conn.on("data", (msg) => this.handleIncomingMessage(msg));
    });
  },

  // L'Host clicca "Scegli Fazione e Inizia" e avvia il setup su tutti i dispositivi
  hostTriggerSetup() {
    if (!this.isHost) return;
    this.broadcast({
      type: "HOST_START_SETUP",
      options: GameState.options,
      playersList: this.connectedPlayers
    });
  },

  broadcast(msg, excludePeerId = null) {
    this.connections.forEach((conn) => {
      if (conn.open && conn.peer !== excludePeerId) {
        conn.send(msg);
      }
    });
  },

  handleIncomingMessage(msg) {
    if (msg.type === "LOBBY_SYNC") {
      this.connectedPlayers = msg.list;
      UI.updateLobbyList(this.connectedPlayers);
      UI.updateStartButtonState();
    } else if (msg.type === "HOST_START_SETUP") {
      GameState.options = msg.options;
      GameState.lobbyPlayers = msg.playersList;
      UI.goToSetup(true);
    } else if (msg.type === "GAME_ACTION") {
      if (msg.payload.type === "SYNC_STATE") {
        Object.assign(GameState, msg.payload.state);
        UI.renderTable();
      }
    }
  }
};