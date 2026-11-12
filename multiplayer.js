/* ============================================================================
   FAZIONI — MULTIPLAYER P2P CON RICONNESSIONE & SUBENTRO SLOT IN PARTITA
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
  myOnlineSlot: 0,
  peerInstance: null,
  hostConnections: [],
  clientConnection: null,
  localBroadcast: null,
  clientJoinRetryTimer: null,
  lobbySlots: {},

  initLobbySlots() {
    this.lobbySlots = {
      0: { index: 0, label: "Slot P1 (Host)", name: null, occupiedBy: null, isAI: true, wasHuman: false },
      1: { index: 1, label: "Slot P2", name: null, occupiedBy: null, isAI: true, wasHuman: false },
      2: { index: 2, label: "Slot P3", name: null, occupiedBy: null, isAI: true, wasHuman: false },
      3: { index: 3, label: "Slot P4", name: null, occupiedBy: null, isAI: true, wasHuman: false }
    };
  },

  setupBroadcastChannel(code) {
    if (this.localBroadcast) this.localBroadcast.close();
    try {
      this.localBroadcast = new BroadcastChannel(`fazioni_p2p_room_${code}`);
      this.localBroadcast.onmessage = (ev) => this.handleIncomingNetworkMessage(ev.data, null);
    } catch (e) {}
  },

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
    this.lobbySlots[0].wasHuman = true;
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

  joinOnlineRoom(codeInput, playerName) {
    this.roomCode = codeInput.trim().toUpperCase();
    this.isOnlineHost = false;
    this.networkMode = "ONLINE";
    this.myPeerId = "client_" + Math.random().toString(36).substring(2, 9);
    this.myOnlineSlot = null;
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
    const prevOccupant = this.lobbySlots[slotIdx].occupiedBy;

    // Se un giocatore subentra in uno slot già occupato da un vecchio peerId, disconnette il vecchio (Takeover)
    if (prevOccupant && prevOccupant !== peerId) {
      const oldW = this.hostConnections.find((w) => w.peerId === prevOccupant);
      if (oldW && oldW.conn && oldW.conn.open) {
        try { oldW.conn.send({ type: "KICKED_BY_TAKEOVER", slotIdx }); } catch (e) {}
        setTimeout(() => { try { oldW.conn.close(); } catch (e) {} }, 150);
      }
      this.hostConnections = this.hostConnections.filter((w) => w.peerId !== prevOccupant);
    }

    // Libera eventuale altro slot precedentemente occupato dallo stesso peerId
    Object.keys(this.lobbySlots).forEach((k) => {
      if (this.lobbySlots[k].occupiedBy === peerId) {
        this.lobbySlots[k].occupiedBy = null;
        if (GameState.currentScreen === "MENU") {
          this.lobbySlots[k].name = null;
          this.lobbySlots[k].isAI = true;
          this.lobbySlots[k].wasHuman = false;
        }
      }
    });

    this.lobbySlots[slotIdx].occupiedBy = peerId;
    if (playerName) this.lobbySlots[slotIdx].name = playerName;
    this.lobbySlots[slotIdx].isAI = false;
    this.lobbySlots[slotIdx].wasHuman = true;

    // Se la partita è già in corso, aggiorna il nome del giocatore nel tavolo!
    if (GameState.players && GameState.players[slotIdx]) {
      if (playerName) GameState.players[slotIdx].name = playerName;
      GameState.players[slotIdx].isAI = false;
    }

    this.syncMyIdentity();
    UI.renderLobbySlotsUI();
    UI.syncDisconnectOverlayUI();
    if (GameState.currentScreen === "TABLE") UI.renderTable();
  },

  syncMyIdentity() {
    if (this.networkMode !== "ONLINE") {
      this.myOnlineSlot = 0;
      return;
    }
    const found = Object.keys(this.lobbySlots).find((k) => this.lobbySlots[k].occupiedBy === this.myPeerId);
    this.myOnlineSlot = found !== undefined ? Number(found) : null;
  },

  // Verifica se uno dei giocatori umani partiti nella stanza si è scollegato
  isRoomMissingPlayers() {
    if (this.networkMode !== "ONLINE" || GameState.currentScreen === "MENU") return false;
    return Object.values(this.lobbySlots).some((s) => s.wasHuman && !s.occupiedBy);
  },

  getHumanSlotsCount() {
    if (this.networkMode !== "ONLINE") return 1;
    return Object.values(this.lobbySlots).filter((s) => s.wasHuman || !!s.occupiedBy).length || 1;
  },

  handlePeerDisconnectOnHost(peerId) {
    if (!this.isOnlineHost || !peerId) return;
    let disconnectedName = null;
    Object.keys(this.lobbySlots).forEach((k) => {
      if (this.lobbySlots[k].occupiedBy === peerId) {
        disconnectedName = this.lobbySlots[k].name || `P${Number(k) + 1}`;
        this.lobbySlots[k].occupiedBy = null;
        if (GameState.currentScreen === "MENU") {
          this.lobbySlots[k].isAI = true;
          this.lobbySlots[k].wasHuman = false;
        }
      }
    });
    this.hostConnections = this.hostConnections.filter((w) => w.peerId !== peerId);
    if (disconnectedName && GameState.currentScreen !== "MENU") {
      UI.setPersistentStatus(`⚠️ <b>${disconnectedName}</b> si è scollegato! Partita in pausa in attesa di riconnessione...`);
    }
    UI.renderLobbySlotsUI();
    UI.syncDisconnectOverlayUI();
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
      takenFactions: GameState.takenFactions,
      setupChoices: GameState.setupChoices,
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
        roundStartSnapshot: GameState.roundStartSnapshot,
        roundSummaryLines: GameState.roundSummaryLines,
        sharedModalState: GameState.sharedModalState,
        clashConfirmVotes: GameState.clashConfirmVotes,
        roundEndVotes: GameState.roundEndVotes,
        newRoundVotes: GameState.newRoundVotes,
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
        // Se siamo nel menu, assegna automaticamente il primo slot libero; se siamo in partita, mostra il selettore slot!
        if (!existing && GameState.currentScreen === "MENU") {
          const freeKey = Object.keys(this.lobbySlots).find((k) => !this.lobbySlots[k].occupiedBy);
          if (freeKey !== undefined) {
            this.assignPeerToSlot(data.peerId, data.name || `Giocatore ${Number(freeKey) + 1}`, Number(freeKey));
          }
        }
        UI.renderLobbySlotsUI();
        UI.syncDisconnectOverlayUI();
        this.broadcastFullStateFromHost();
      } else if (data.type === "CLAIM_SLOT") {
        this.assignPeerToSlot(data.peerId, data.name, data.slotIdx);
        this.broadcastFullStateFromHost();
      } else if (data.type === "LEAVE_NOTICE") {
        this.handlePeerDisconnectOnHost(data.peerId);
      } else if (data.type === "CLIENT_ACTION") {
        this.applyClientActionOnHost(data.action, data.peerId, data.slot);
      }
    } else if (data.type === "STATE_SYNC") {
      this.lobbySlots = data.lobbySlots || this.lobbySlots;
      this.syncMyIdentity();
      UI.renderLobbySlotsUI();

      GameState.takenFactions = data.takenFactions || {};
      GameState.setupChoices = data.setupChoices || {};

      if (data.screen === "SETUP") {
        GameState.options = data.state.options;
        if (GameState.currentScreen !== "SETUP") {
          UI.goToSetup(true);
        } else if (!GameState.selectedFaction) {
          UI.renderFactionSelection();
        }
      } else if (data.screen === "TABLE") {
        Object.assign(GameState, data.state);
        if (GameState.currentScreen !== "TABLE") UI.showTableScreen();
        UI.renderTable();
        UI.syncSharedModalOnClient();
      }
      UI.syncDisconnectOverlayUI();
    } else if (data.type === "KICKED_BY_TAKEOVER") {
      this.myOnlineSlot = null;
      UI.syncDisconnectOverlayUI();
    }
  },

  applyClientActionOnHost(act, peerId, slotIdx) {
    if (!act || this.isRoomMissingPlayers()) return;
    if (act.kind === "CLAIM_FACTION") {
      Engine.claimFactionForSlot(slotIdx, act.factionId, act.playerName);
    } else if (act.kind === "LOCK_SETUP_CHOICE") {
      Engine.registerPlayerSetupChoice(slotIdx, act.faction, act.leader, act.objective);
    } else if (act.kind === "PLAYER_THINKING") {
      const p = GameState.players[slotIdx];
      if (p) UI.setPersistentStatus(`💭 <b>${p.name}</b> sta pensando...`);
    } else if (act.kind === "VOTE_SKIP_SUMMARY") {
      Engine.registerActionSkipVote(slotIdx);
    } else if (act.kind === "CONFIRM_CLASH") {
      Engine.registerClashConfirmation(slotIdx);
    } else if (act.kind === "CONFIRM_ROUND_END") {
      Engine.registerRoundEndConfirmation(slotIdx);
    } else if (act.kind === "CONFIRM_NEW_ROUND") {
      Engine.registerNewRoundConfirmation(slotIdx);
    } else if (act.kind === "PLAY_ACTION_CARD") {
      const p = GameState.players[slotIdx];
      const card = p?.hand.find((c) => c.uid === act.cardUid);
      if (p && card) Engine.executeActionCardEffect(p, card, act.targetIdx, null, act.discardUid);
    } else if (act.kind === "ACTIVATE_LEADER") {
      Engine.executeLeaderSkillOnHost(slotIdx, act.targetIdx, act.discardUid);
    } else if (act.kind === "STAGE_ATK_CARD") {
      const p = GameState.players[slotIdx];
      const card = p?.hand.find((c) => c.uid === act.cardUid);
      if (card) {
        GameState.slotAtkCard = card;
        GameState.currentAttackingPlayerIdx = slotIdx;
        UI.setPersistentStatus("⚔️ <b>" + p.name + "</b> sta decidendo chi attaccare...");
        UI.renderTable();
      }
    } else if (act.kind === "DECLARE_ATTACK") {
      const p = GameState.players[slotIdx];
      const card = p?.hand.find((c) => c.uid === act.cardUid) || GameState.slotAtkCard;
      if (card) Engine.resolveCombat(slotIdx, act.targetIdx, card);
    } else if (act.kind === "SUBMIT_DEFENSE") {
      const p = GameState.players[slotIdx];
      const card = act.cardUid ? p?.hand.find((c) => c.uid === act.cardUid) : null;
      Engine.finishCombatResolution(GameState.currentAttackingPlayerIdx, slotIdx, GameState.slotAtkCard, card);
    } else if (act.kind === "PASS_TURN") {
      Engine.executePassTurn(slotIdx);
    }
    this.broadcastFullStateFromHost();
  }
};

window.addEventListener("beforeunload", () => {
  if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
    Multiplayer.sendToHost({ type: "LEAVE_NOTICE", peerId: Multiplayer.myPeerId });
  }
});