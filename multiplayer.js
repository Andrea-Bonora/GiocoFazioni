/* ============================================================================
   FAZIONI — MULTIPLAYER P2P ROBUSTO (ISPIRATO A PITCH & PAWNS)
   ============================================================================ */

const PEER_ICE_CONFIG = {
  pingInterval: 5000,
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" }
    ]
  }
};

const Multiplayer = {
  networkMode: "LOCAL",
  isOnlineHost: false,
  roomCode: "",
  myPeerId: "",
  myOnlineSlot: 0, // 0=P1, 1=P2, 2=P3, 3=P4
  peerInstance: null,
  hostConnections: [],
  clientConnection: null,
  localBroadcast: null,
  clientJoinRetryTimer: null,
  lobbySlots: {},

  initLobbySlots() {
    this.lobbySlots = {
      0: { index: 0, label: "Slot P1 (Host)", name: null, occupiedBy: null, isAI: true },
      1: { index: 1, label: "Slot P2", name: null, occupiedBy: null, isAI: true },
      2: { index: 2, label: "Slot P3", name: null, occupiedBy: null, isAI: true },
      3: { index: 3, label: "Slot P4", name: null, occupiedBy: null, isAI: true }
    };
  },

  setupBroadcastChannel(code) {
    if (this.localBroadcast) this.localBroadcast.close();
    try {
      this.localBroadcast = new BroadcastChannel(`fazioni_p2p_room_${code}`);
      this.localBroadcast.onmessage = (ev) => this.handleIncomingNetworkMessage(ev.data, null);
    } catch (e) {}
  },

  // 1. CREA STANZA (HOST)
  createOnlineRoom(playerName) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    this.roomCode = "FZ" + Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    this.isOnlineHost = true;
    this.networkMode = "ONLINE";
    this.myPeerId = "host_" + Math.random().toString(36).substring(2, 9);

    this.initLobbySlots();
    this.lobbySlots[0].occupiedBy = this.myPeerId;
    this.lobbySlots[0].name = playerName;
    this.lobbySlots[0].isAI = false;
    this.myOnlineSlot = 0;

    UI.showLobbyPanel(this.roomCode);
    UI.renderLobbySlotsUI();
    this.setupBroadcastChannel(this.roomCode);

    if (typeof Peer !== "undefined") {
      if (this.peerInstance) this.peerInstance.destroy();
      this.peerInstance = new Peer(`fazioni-p2p-${this.roomCode}`, PEER_ICE_CONFIG);

      this.peerInstance.on("open", () => {
        UI.showToastPopup(`Stanza ${this.roomCode} creata! Condividi il codice.`, 1800);
      });

      this.peerInstance.on("connection", (conn) => {
        const wrapper = { conn, peerId: conn.peer || null };
        this.hostConnections.push(wrapper);

        conn.on("data", (data) => {
          if (data && data.peerId) wrapper.peerId = data.peerId;
          this.handleIncomingNetworkMessage(data, conn);
        });

        const sendInitial = () => this.broadcastFullStateFromHost();
        if (conn.open) sendInitial();
        else conn.on("open", sendInitial);

        conn.on("close", () => this.handlePeerDisconnectOnHost(wrapper.peerId));
        conn.on("error", () => this.handlePeerDisconnectOnHost(wrapper.peerId));
      });

      this.peerInstance.on("error", (err) => {
        if (err && err.type === "unavailable-id") {
          this.createOnlineRoom(playerName);
        }
      });
    }
  },

  // 2. ENTRA IN STANZA ESISTENTE (CLIENT CON RETRY OGNI 800ms)
  joinOnlineRoom(codeInput, playerName) {
    this.roomCode = codeInput.trim().toUpperCase();
    this.isOnlineHost = false;
    this.networkMode = "ONLINE";
    this.myPeerId = "client_" + Math.random().toString(36).substring(2, 9);
    this.lobbySlots = {};

    UI.showLobbyPanel(this.roomCode);
    document.getElementById("lobby-status-msg").textContent = "Connessione all'Host...";

    this.setupBroadcastChannel(this.roomCode);
    this.sendToHost({ type: "JOIN_REQUEST", peerId: this.myPeerId, name: playerName });

    if (this.clientJoinRetryTimer) clearInterval(this.clientJoinRetryTimer);

    if (typeof Peer !== "undefined") {
      if (this.peerInstance) this.peerInstance.destroy();
      this.peerInstance = new Peer(undefined, PEER_ICE_CONFIG);

      this.peerInstance.on("open", () => {
        const conn = this.peerInstance.connect(`fazioni-p2p-${this.roomCode}`, { reliable: true });
        this.clientConnection = conn;

        conn.on("data", (data) => {
          if (this.clientJoinRetryTimer && data && data.type === "STATE_SYNC") {
            clearInterval(this.clientJoinRetryTimer);
            this.clientJoinRetryTimer = null;
          }
          this.handleIncomingNetworkMessage(data, null);
        });

        conn.on("open", () => {
          this.sendToHost({ type: "JOIN_REQUEST", peerId: this.myPeerId, name: playerName });
          this.clientJoinRetryTimer = setInterval(() => {
            if (Object.keys(this.lobbySlots).length > 0) {
              clearInterval(this.clientJoinRetryTimer);
              this.clientJoinRetryTimer = null;
              return;
            }
            this.sendToHost({ type: "JOIN_REQUEST", peerId: this.myPeerId, name: playerName });
          }, 800);
        });
      });

      this.peerInstance.on("error", (err) => {
        if (this.clientJoinRetryTimer) clearInterval(this.clientJoinRetryTimer);
        document.getElementById("lobby-status-msg").textContent = `❌ Stanza ${this.roomCode} non trovata!`;
      });
    }
  },

  claimSlot(slotIdx) {
    if (this.isOnlineHost) {
      this.assignPeerToSlot(this.myPeerId, GameState.playerName, slotIdx);
      this.broadcastFullStateFromHost();
    } else {
      this.sendToHost({ type: "CLAIM_SLOT", peerId: this.myPeerId, name: GameState.playerName, slotIdx });
    }
  },

  assignPeerToSlot(peerId, playerName, slotIdx) {
    if (!this.lobbySlots[slotIdx]) return;
    Object.keys(this.lobbySlots).forEach((k) => {
      if (this.lobbySlots[k].occupiedBy === peerId) {
        this.lobbySlots[k].occupiedBy = null;
        this.lobbySlots[k].name = null;
        this.lobbySlots[k].isAI = true;
      }
    });
    this.lobbySlots[slotIdx].occupiedBy = peerId;
    this.lobbySlots[slotIdx].name = playerName;
    this.lobbySlots[slotIdx].isAI = false;
    this.syncMyIdentity();
    UI.renderLobbySlotsUI();
  },

  syncMyIdentity() {
    if (this.networkMode !== "ONLINE") {
      this.myOnlineSlot = 0;
      return;
    }
    const found = Object.keys(this.lobbySlots).find((k) => this.lobbySlots[k].occupiedBy === this.myPeerId);
    if (found !== undefined) this.myOnlineSlot = Number(found);
  },

  getHumanSlotsCount() {
    if (this.networkMode !== "ONLINE") return 1;
    return Object.values(this.lobbySlots).filter((s) => !!s.occupiedBy).length || 1;
  },

  handlePeerDisconnectOnHost(peerId) {
    if (!this.isOnlineHost || !peerId) return;
    Object.keys(this.lobbySlots).forEach((k) => {
      if (this.lobbySlots[k].occupiedBy === peerId) {
        this.lobbySlots[k].occupiedBy = null;
        this.lobbySlots[k].isAI = true;
      }
    });
    this.hostConnections = this.hostConnections.filter((w) => w.peerId !== peerId);
    UI.renderLobbySlotsUI();
    this.broadcastFullStateFromHost();
  },

  sendToHost(payload) {
    if (this.clientConnection && this.clientConnection.open) {
      this.clientConnection.send(payload);
    }
    if (this.localBroadcast) {
      this.localBroadcast.postMessage(payload);
    }
  },

  sendClientAction(actionObj) {
    if (this.networkMode !== "ONLINE") return;
    if (this.isOnlineHost) {
      this.applyClientActionOnHost(actionObj, this.myPeerId, this.myOnlineSlot);
    } else {
      this.sendToHost({ type: "CLIENT_ACTION", peerId: this.myPeerId, slot: this.myOnlineSlot, action: actionObj });
    }
  },

  broadcastFullStateFromHost() {
    if (!this.isOnlineHost || this.networkMode !== "ONLINE") return;
    const packet = {
      type: "STATE_SYNC",
      lobbySlots: this.lobbySlots,
      screen: GameState.currentScreen,
      state: {
        options: GameState.options,
        round: GameState.round,
        baseOrder: GameState.baseOrder,
        activePlayerIndex: GameState.activePlayerIndex,
        lastAttackerIndex: GameState.lastAttackerIndex,
        currentArena: GameState.currentArena,
        currentAttackingPlayerIdx: GameState.currentAttackingPlayerIdx,
        currentDefendingPlayerIdx: GameState.currentDefendingPlayerIdx,
        slotAtkCard: GameState.slotAtkCard,
        slotDifCard: GameState.slotDifCard,
        waitingForDefenseFromIdx: GameState.waitingForDefenseFromIdx,
        persistentStatusText: GameState.persistentStatusText,
        turnEventsLog: GameState.turnEventsLog,
        activeSummaryModal: GameState.activeSummaryModal,
        skipVotes: GameState.skipVotes,
        players: GameState.players,
        gameOver: GameState.gameOver
      }
    };
    this.hostConnections.forEach((w) => {
      if (w.conn && w.conn.open) w.conn.send(packet);
    });
    if (this.localBroadcast) this.localBroadcast.postMessage(packet);
  },

  handleIncomingNetworkMessage(data, conn) {
    if (!data || !data.type) return;

    if (this.isOnlineHost) {
      if (data.type === "JOIN_REQUEST") {
        const existing = Object.keys(this.lobbySlots).find((k) => this.lobbySlots[k].occupiedBy === data.peerId);
        if (!existing) {
          const freeKey = Object.keys(this.lobbySlots).find((k) => !this.lobbySlots[k].occupiedBy);
          if (freeKey !== undefined) {
            this.assignPeerToSlot(data.peerId, data.name || `Giocatore ${Number(freeKey) + 1}`, Number(freeKey));
          }
        }
        UI.renderLobbySlotsUI();
        this.broadcastFullStateFromHost();
      } else if (data.type === "CLAIM_SLOT") {
        this.assignPeerToSlot(data.peerId, data.name, data.slotIdx);
        this.broadcastFullStateFromHost();
      } else if (data.type === "CLIENT_ACTION") {
        this.applyClientActionOnHost(data.action, data.peerId, data.slot);
      }
    } else if (data.type === "STATE_SYNC") {
      this.lobbySlots = data.lobbySlots || this.lobbySlots;
      this.syncMyIdentity();
      UI.renderLobbySlotsUI();

      if (data.screen === "SETUP" && GameState.currentScreen === "MENU") {
        GameState.options = data.state.options;
        UI.goToSetup(true);
      } else if (data.screen === "TABLE") {
        Object.assign(GameState, data.state);
        if (GameState.currentScreen !== "TABLE") UI.showTableScreen();
        UI.renderTable();
        UI.syncActiveSummaryModalFromState();
      }
    }
  },

  applyClientActionOnHost(act, peerId, slotIdx) {
    if (!act) return;
    if (act.kind === "LOCK_SETUP_CHOICE") {
      Engine.registerPlayerSetupChoice(slotIdx, act.faction, act.leader, act.objective);
    } else if (act.kind === "VOTE_SKIP_SUMMARY") {
      Engine.registerSkipVote(slotIdx);
    } else if (act.kind === "PLAY_ACTION_CARD") {
      Engine.executeActionCardEffect(GameState.players[slotIdx], act.card, act.targetIdx);
    } else if (act.kind === "DECLARE_ATTACK") {
      Engine.resolveCombat(slotIdx, act.targetIdx, act.card);
    } else if (act.kind === "SUBMIT_DEFENSE") {
      Engine.finishCombatResolution(GameState.currentAttackingPlayerIdx, slotIdx, GameState.slotAtkCard, act.card);
    } else if (act.kind === "PASS_TURN") {
      Engine.executePassTurn(slotIdx);
    }
    this.broadcastFullStateFromHost();
  }
};