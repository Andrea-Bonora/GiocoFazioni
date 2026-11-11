/* ============================================================================
   FAZIONI — MOTORE DI GIOCO (PATCH 1.4) & CONTROLLER INTERFACCIA iOS
   ============================================================================ */

const GameState = {
  roomCode: "SOLO",
  currentScreen: "MENU",
  waitingForDefenseFromIdx: null,
  persistentStatusText: "Inizio partita • In attesa della prima mossa...",
  turnEventsLog: [],
  combatEffectsLog: [],         // Registra SOLO gli effetti delle 2 carte nello scontro attuale
  roundSummaryLines: [],        // Le 4 righe descrittive di Nuovo Round (chi guadagna cosa)
  roundStartSnapshot: {},       // Fotografa PV, PC e Carte a inizio ROUND per il recap di Fine Round
  sharedModalState: null,       // Sincronizza i modali (Azione, Scontro, Fine Round) su tutti i dispositivi online
  lastRenderedModalId: null,
  clashConfirmVotes: [],        // Voti di conferma per chiudere il riepilogo di un attacco
  newRoundVotes: [],
  skipVotes: [],
  readingTimerInterval: null,
  playerName: "Giocatore 1",
  options: {
    arenasEnabled: true,
    awakeningEnabled: true
  },
  takenFactions: {},            // { factionId: { slotIdx, playerName } }
  setupChoices: {},             // { slotIdx: { faction, leader, objective } }
  round: 1,
  baseOrder: [0, 1, 2, 3],
  activePlayerIndex: 0,
  lastAttackerIndex: null,
  currentArena: null,
  selectedFaction: null,
  drawnObjective: null,
  selectedLeader: null,
  selectedCardUid: null,
  currentAttackingPlayerIdx: null,
  currentDefendingPlayerIdx: null,
  slotAtkCard: null,
  slotDifCard: null,
  waitingForDefenseFromP1: false,
  pendingTargetSelection: null,
  pendingDiscardSelection: null, // { sourceCardUid, reason, onDiscard: fn }
  inspectedHandIndex: null,
  lastSwipeDirection: null,     // 'next' | 'prev' per l'animazione dello swipe
  lobbyPlayers: [],
  players: [],
  gameOver: false
};

/* ============================================================================
   1. CONTROLLER INTERFACCIA UTENTE (UI & NAVIGAZIONE SCHERMATE)
   ============================================================================ */
const UI = {
  init() {
    lucide.createIcons();
    this.renderFactionSelection();
  },

  // Valida che lo username sia stato inserito (obbligatorio sia in locale che online!)
  validateUsername() {
    const input = document.getElementById("player-name-input");
    const name = input?.value.trim() || "";
    if (!name) {
      input?.classList.add("ring-2", "ring-rose-500");
      this.showToastPopup("⚠️ Inserisci il tuo Nome prima di continuare!", 1800);
      return null;
    }
    input?.classList.remove("ring-2", "ring-rose-500");
    GameState.playerName = name;
    return name;
  },

  createOnlineRoom() {
    const name = this.validateUsername();
    if (!name) return;
    Multiplayer.createOnlineRoom(name);
  },

  joinOnlineRoom() {
    const name = this.validateUsername();
    if (!name) return;
    const code = document.getElementById("room-code-input")?.value.trim().toUpperCase();
    if (!code || code.length < 3) {
      this.showToastPopup("⚠️ Inserisci un Codice Stanza valido!", 1600);
      return;
    }
    Multiplayer.joinOnlineRoom(code, name);
  },

  showLobbyPanel(code) {
    const box = document.getElementById("lobby-box");
    box.classList.remove("hidden");
    box.classList.add("flex");
    document.getElementById("lobby-room-label").textContent = code;
  },

  renderLobbySlotsUI() {
    const container = document.getElementById("lobby-slots-container");
    if (!container) return;
    container.innerHTML = "";
    Object.values(Multiplayer.lobbySlots).forEach((slot) => {
      const isMine = slot.occupiedBy === Multiplayer.myPeerId;
      const isOccupied = !!slot.occupiedBy;
      const btn = document.createElement("button");
      btn.className = `p-2 rounded-xl border text-left text-xs transition ${
        isMine
          ? "bg-emerald-500/25 border-emerald-400 text-white font-black"
          : isOccupied
          ? "bg-white/10 border-white/20 text-white/80"
          : "bg-black/30 border-dashed border-cyan-400/50 text-cyan-200"
      }`;
      btn.onclick = () => Multiplayer.claimSlot(slot.index);
      btn.innerHTML = `
        <div class="text-[10px] uppercase text-white/60">P${slot.index + 1}</div>
        <div class="truncate font-bold">${isOccupied ? slot.name : "🤖 Bot (Tocca per entrare)"}</div>
      `;
      container.appendChild(btn);
    });

    const humans = Multiplayer.getHumanSlotsCount();
    document.getElementById("lobby-status-msg").textContent = `${humans} Umani • ${4 - humans} Bot`;
    this.updateStartButtonState();
  },

  setPersistentStatus(text) {
    GameState.persistentStatusText = text;
    const bar = document.getElementById("persistent-status-bar");
    if (bar) bar.innerHTML = text;
  },

  // Disattivati tutti i log in sovraimpressione durante la partita: resta solo il log fisso!
  showToastPopup(text, duration = 1500) {
    if (GameState.currentScreen === "TABLE") {
      this.setPersistentStatus(text);
      return;
    }
    const pop = document.getElementById("turn-popup");
    const txt = document.getElementById("turn-popup-text");
    if (!pop || !txt) return;
    txt.textContent = text;
    pop.classList.remove("hidden");
    setTimeout(() => pop.classList.add("hidden"), duration);
  },

  setBanner(msg) {
    this.setPersistentStatus(msg);
  },

  showCenterActionBanner(htmlText) {
    this.setPersistentStatus(htmlText);
  },

  // Sopra alla Zona ATK e DIF mostra SOLO il nome di chi è coinvolto (senza PV e PC)
  renderMiniArenaPills() {
    const atkPill = document.getElementById("mini-pill-atk");
    const difPill = document.getElementById("mini-pill-dif");
    if (!atkPill || !difPill) return;

    const atkP = GameState.currentAttackingPlayerIdx !== null ? GameState.players[GameState.currentAttackingPlayerIdx] : null;
    const difP = GameState.currentDefendingPlayerIdx !== null ? GameState.players[GameState.currentDefendingPlayerIdx] : null;

    atkPill.innerHTML = atkP
      ? `<span class="text-rose-300 font-black">⚔️ ${atkP.name}</span>`
      : `<span class="text-white/40">Attaccante</span>`;

    difPill.innerHTML = difP
      ? `<span class="text-sky-300 font-black">🛡️ ${difP.name}</span>`
      : `<span class="text-white/40">Difensore</span>`;
  },

  // Modale con Pausa Fissa + Barra di Caricamento Visiva RADDOPPIATA (10.000ms = 10 secondi) + Salta Condiviso
  showTimedSummaryModal(summaryHTML, durationMs = 10000, onFinishCallback = null) {
    if (GameState.readingTimerInterval) clearInterval(GameState.readingTimerInterval);
    GameState.skipVotes = [];

    const view = document.getElementById("modal-custom-view");
    const actions = document.getElementById("modal-actions");

    view.innerHTML = `
      <div class="flex flex-col items-center gap-2.5 w-full max-w-2xl">
        ${summaryHTML}
        <!-- Barra di Caricamento Visiva (Durata Doppia: 10 secondi) -->
        <div class="w-full max-w-lg h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/20 mt-1">
          <div id="reading-bar-fill" class="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 reading-progress-fill" style="width: 100%"></div>
        </div>
      </div>
    `;

    const totalHumans = Multiplayer.getHumanSlotsCount();
    actions.innerHTML = `
      <button id="btn-skip-timer" class="liquid-btn-gold px-8 py-2 rounded-xl text-xs font-black uppercase tracking-wider">
        Salta (${GameState.skipVotes.length}/${totalHumans}) ➔
      </button>
    `;

    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();

    const finishNow = () => {
      if (GameState.readingTimerInterval) {
        clearInterval(GameState.readingTimerInterval);
        GameState.readingTimerInterval = null;
      }
      this.closeModal();
      if (onFinishCallback) onFinishCallback();
    };

    document.getElementById("btn-skip-timer").onclick = () => {
      const mySlot = Multiplayer.myOnlineSlot || 0;
      if (!GameState.skipVotes.includes(mySlot)) GameState.skipVotes.push(mySlot);
      const btn = document.getElementById("btn-skip-timer");
      if (btn) btn.textContent = `Salta (${GameState.skipVotes.length}/${totalHumans}) ➔`;

      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "VOTE_SKIP_SUMMARY" });
      } else if (GameState.skipVotes.length >= totalHumans) {
        finishNow();
      }
    };

    let elapsed = 0;
    const step = 100;
    GameState.readingTimerInterval = setInterval(() => {
      elapsed += step;
      const pct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      const bar = document.getElementById("reading-bar-fill");
      if (bar) bar.style.width = `${pct}%`;

      if (elapsed >= durationMs || GameState.skipVotes.length >= totalHumans) {
        finishNow();
      }
    }, step);
  },

  // Nasconde i Moduli Espansione e il tasto "Scegli Fazione e Inizia" ai giocatori ospiti (solo l'Host li vede!)
  updateStartButtonState() {
    const hostControls = document.getElementById("host-only-menu-controls");
    if (!hostControls) return;

    if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
      hostControls.classList.add("hidden");
    } else {
      hostControls.classList.remove("hidden");
    }
  },

  handleStartButtonClick() {
    const name = this.validateUsername();
    if (!name) return;

    if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) return;
    GameState.options.arenasEnabled = document.getElementById("toggle-arenas").checked;
    GameState.options.awakeningEnabled = document.getElementById("toggle-awakening").checked;

    this.goToSetup(false);
    if (Multiplayer.networkMode === "ONLINE" && Multiplayer.isOnlineHost) {
      Multiplayer.broadcastFullStateFromHost();
    }
  },

  goToSetup(fromRemoteHost = false) {
    if (!fromRemoteHost) {
      const name = this.validateUsername();
      if (!name) return;
      GameState.options.arenasEnabled = document.getElementById("toggle-arenas").checked;
      GameState.options.awakeningEnabled = document.getElementById("toggle-awakening").checked;
      GameState.takenFactions = {};
      GameState.setupChoices = {};
    }

    GameState.currentScreen = "SETUP";
    GameState.selectedFaction = null;
    GameState.selectedLeader = null;

    document.getElementById("btn-setup-back").classList.toggle("hidden", Multiplayer.networkMode === "ONLINE");
    document.getElementById("setup-header-title").textContent = "Scegli la tua Fazione";
    document.getElementById("faction-grid").classList.remove("hidden");
    document.getElementById("objective-preview-box").classList.add("hidden");
    document.getElementById("leader-selection-box").classList.add("hidden");
    document.getElementById("leader-selection-box").classList.remove("flex");

    document.getElementById("screen-menu").classList.add("hidden");
    const setup = document.getElementById("screen-setup");
    setup.classList.remove("hidden");
    setup.classList.add("flex");
    this.renderFactionSelection();
  },

  // Se una fazione è già stata presa da un altro giocatore online, la blocca e mostra il nome di chi l'ha scelta!
  renderFactionSelection() {
    const grid = document.getElementById("faction-grid");
    if (!grid) return;
    grid.innerHTML = "";
    Object.values(DB.factions).forEach((fac) => {
      const takenBy = GameState.takenFactions[fac.id];
      const isTaken = !!takenBy;

      const btn = document.createElement("button");
      btn.disabled = isTaken;
      btn.className = `liquid-glass ${fac.cardClass} p-4 text-left flex flex-col gap-1.5 transition ${
        isTaken ? "opacity-45 grayscale cursor-not-allowed" : "active:scale-95 hover:brightness-110"
      }`;
      btn.onclick = () => {
        if (!isTaken) this.selectFaction(fac.id);
      };
      btn.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-base font-black tracking-wide text-white drop-shadow">${fac.name}</span>
          <i data-lucide="${fac.icon}" class="w-5 h-5 text-white"></i>
        </div>
        <span class="text-[11px] text-white/85 leading-tight">${fac.tagline}</span>
        ${
          isTaken
            ? `<div class="mt-1 px-2 py-0.5 rounded-full bg-black/60 border border-amber-400/50 text-[10px] font-black text-amber-300 text-center">
                 🔒 Presa da ${takenBy.playerName}
               </div>`
            : ""
        }
      `;
      grid.appendChild(btn);
    });
    lucide.createIcons();
  },

  backToMenu() {
    GameState.currentScreen = "MENU";
    document.getElementById("screen-setup").classList.add("hidden");
    document.getElementById("screen-setup").classList.remove("flex");
    document.getElementById("screen-menu").classList.remove("hidden");
  },

  selectFaction(factionId) {
    if (GameState.takenFactions[factionId]) return;
    GameState.selectedFaction = factionId;
    GameState.selectedLeader = null;
    const fac = DB.factions[factionId];
    const mySlot = Multiplayer.myOnlineSlot || 0;

    if (Multiplayer.networkMode === "ONLINE") {
      if (Multiplayer.isOnlineHost) {
        Engine.claimFactionForSlot(mySlot, factionId, GameState.playerName);
        Multiplayer.broadcastFullStateFromHost();
      } else {
        Multiplayer.sendClientAction({ kind: "CLAIM_FACTION", factionId, playerName: GameState.playerName });
      }
    }

    document.getElementById("faction-grid").classList.add("hidden");
    document.getElementById("btn-setup-back").classList.add("hidden");
    document.getElementById("setup-header-title").textContent = `Fazione: ${fac.name}`;

    const objBox = document.getElementById("objective-preview-box");
    const objTitle = document.getElementById("setup-objective-title");
    const objDesc = document.getElementById("setup-objective-desc");
    const statusLbl = document.getElementById("objective-status-label");
    objBox.classList.remove("hidden");
    objDesc.textContent = "";

    let ticks = 0;
    const rollInterval = setInterval(() => {
      const tempObj = fac.objectives[ticks % fac.objectives.length];
      objTitle.textContent = tempObj.name;
      ticks++;
      if (ticks >= 10) {
        clearInterval(rollInterval);
        const finalObj = fac.objectives[Math.floor(Math.random() * fac.objectives.length)];
        GameState.drawnObjective = finalObj;
        statusLbl.textContent = "Obiettivo Segreto Assegnato";
        objTitle.textContent = finalObj.name;
        objDesc.textContent = finalObj.desc;
        this.revealLeaderChoices(fac);
      }
    }, 90);
  },

  revealLeaderChoices(fac) {
    const leaderBox = document.getElementById("leader-selection-box");
    const leaderList = document.getElementById("leader-list");
    leaderBox.classList.remove("hidden");
    leaderBox.classList.add("flex");
    leaderList.innerHTML = "";

    fac.leaders.forEach((ldr) => {
      const leaderArt = DB.generateUniqueCardArt(ldr.name, fac.id, "creature").replace("h-16", "h-full");
      const lBtn = document.createElement("button");
      lBtn.className = `liquid-pill p-2.5 rounded-2xl text-left transition active:scale-98 flex items-center gap-3 ${fac.cardClass}`;
      lBtn.onclick = () => this.selectLeader(ldr, lBtn);
      lBtn.innerHTML = `
        <div class="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-white/25 shadow-md">
          ${leaderArt}
        </div>
        <div class="flex flex-col flex-1">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black text-amber-300">${ldr.name}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-black/40 border border-white/20 text-rose-200 font-bold">
              ≤ ${ldr.threshold} ♥
            </span>
          </div>
          <div class="text-[11px] text-white/90 leading-snug mt-0.5">${ldr.baseDesc}</div>
          ${GameState.options.awakeningEnabled ? `<div class="text-[10px] text-amber-200/90 italic mt-0.5">${ldr.awakenedDesc}</div>` : ""}
        </div>
      `;
      leaderList.appendChild(lBtn);
    });
  },

  selectLeader(leaderObj, btnEl) {
    GameState.selectedLeader = leaderObj;
    Array.from(document.getElementById("leader-list").children).forEach((el) => {
      el.classList.remove("ring-2", "ring-amber-400", "bg-white/20");
    });
    btnEl.classList.add("ring-2", "ring-amber-400", "bg-white/20");

    const enterBtn = document.getElementById("btn-enter-battle");
    enterBtn.disabled = false;
    enterBtn.classList.remove("opacity-40", "pointer-events-none");
  },

  startMatch() {
    const mySlot = Multiplayer.myOnlineSlot || 0;
    if (Multiplayer.networkMode === "ONLINE") {
      const enterBtn = document.getElementById("btn-enter-battle");
      enterBtn.disabled = true;
      enterBtn.textContent = "In attesa degli altri giocatori...";
      if (Multiplayer.isOnlineHost) {
        Engine.registerPlayerSetupChoice(mySlot, GameState.selectedFaction, GameState.selectedLeader, GameState.drawnObjective);
      } else {
        Multiplayer.sendClientAction({
          kind: "LOCK_SETUP_CHOICE",
          faction: GameState.selectedFaction,
          leader: GameState.selectedLeader,
          objective: GameState.drawnObjective
        });
      }
      return;
    }

    this.showTableScreen();
    Engine.setupMatch();
  },

  showTableScreen() {
    GameState.currentScreen = "TABLE";
    document.getElementById("screen-menu").classList.add("hidden");
    document.getElementById("screen-setup").classList.add("hidden");
    document.getElementById("screen-setup").classList.remove("flex");
    const table = document.getElementById("screen-table");
    table.classList.remove("hidden");
    table.classList.add("flex");
  },

  buildCustomCardHTML(card, extraClass = "") {
    if (!card) return "";
    const isCreature = card.type === "creature";
    const factionClass = DB.factions[card.faction]?.cardClass || "";
    const artSvg = card.svgArt.replace("h-16", "h-32");

    return `
      <div class="liquid-glass ${factionClass} ${extraClass} p-3.5 rounded-2xl w-full max-w-[360px] grid grid-cols-12 gap-3 text-left items-center">
        <div class="col-span-5 flex flex-col gap-1.5">
          <div class="text-xs font-black text-white uppercase tracking-wide leading-tight text-center bg-black/40 py-1 px-1.5 rounded-lg border border-white/15">
            ${card.name}
          </div>
          <div class="w-full h-32 rounded-xl overflow-hidden border border-white/20 shadow-inner">
            ${artSvg}
          </div>
        </div>

        <div class="col-span-7 flex flex-col justify-between h-full gap-1.5">
          <div class="flex flex-col gap-1 bg-black/35 p-2 rounded-xl border border-white/10">
            <div class="flex items-center justify-between text-xs font-black text-cyan-300">
              <span class="flex items-center gap-1"><i data-lucide="zap" class="w-3.5 h-3.5 fill-current"></i> Costo</span>
              <span>${card.cost}</span>
            </div>
            ${
              isCreature
                ? `<div class="flex items-center justify-between text-xs font-black text-rose-300">
                     <span class="flex items-center gap-1"><i data-lucide="sword" class="w-3.5 h-3.5"></i> Attacco</span>
                     <span>${card.computedAtk ?? card.atk}</span>
                   </div>
                   <div class="flex items-center justify-between text-xs font-black text-sky-300">
                     <span class="flex items-center gap-1"><i data-lucide="shield" class="w-3.5 h-3.5"></i> Difesa</span>
                     <span>${card.computedDif ?? card.dif}</span>
                   </div>`
                : `<div class="text-[10px] font-bold text-amber-300 uppercase tracking-wider text-center py-1">Carta Azione</div>`
            }
          </div>

          <div class="bg-black/45 p-2 rounded-xl border border-white/15 flex-1 flex items-center">
            <p class="text-[10px] text-white/90 leading-snug">${card.effectText}</p>
          </div>
        </div>
      </div>
    `;
  },

  renderTable() {
    if (!GameState.players || GameState.players.length === 0) return;
    const mySlot = Multiplayer.myOnlineSlot || 0;
    const me = GameState.players[mySlot] || GameState.players[0];

    const attackOverlay = document.getElementById("under-attack-overlay");
    if (attackOverlay) attackOverlay.classList.toggle("hidden", !GameState.waitingForDefenseFromP1);

    const bar = document.getElementById("persistent-status-bar");
    if (bar && GameState.persistentStatusText) bar.innerHTML = GameState.persistentStatusText;

    // 1. Colonna Sinistra: Gli altri 3 giocatori (Illumina i bersagli validi anche quando scegli chi attaccare!)
    const oppCol = document.getElementById("opponents-col");
    oppCol.innerHTML = "";
    const opponents = GameState.players.filter((p) => p.index !== me.index);

    const isSelectingAttackTarget =
      GameState.activePlayerIndex === me.index &&
      GameState.slotAtkCard !== null &&
      GameState.currentDefendingPlayerIdx === null;

    opponents.forEach((opp) => {
      const isTurn = GameState.activePlayerIndex === opp.index && GameState.currentDefendingPlayerIdx === null;
      const isBeingAttacked = GameState.currentDefendingPlayerIdx === opp.index;
      const isImmune = opp.attacksTakenThisRound >= Engine.getMaxAttacksPerRound();
      const isSelectableActionTarget = GameState.pendingTargetSelection?.validTargets.includes(opp.index);
      const isSelectableAttackTarget = isSelectingAttackTarget && Engine.isValidAttackTarget(me.index, opp.index);

      let borderClass = "";
      if (isSelectableActionTarget || isSelectableAttackTarget) borderClass = "target-selectable-glow";
      else if (isBeingAttacked) borderClass = "status-attacked-red";
      else if (isTurn) borderClass = "status-turn-green";
      else if (isImmune) borderClass = "status-immune-yellow";

      const box = document.createElement("div");
      box.id = `opp-box-${opp.index}`;
      box.className = `relative liquid-glass panel-${opp.faction} p-2 rounded-2xl flex flex-col justify-between flex-1 cursor-pointer transition ${borderClass} ${
        opp.eliminated ? "opacity-30 grayscale pointer-events-none" : ""
      }`;

      box.onclick = () => {
        if (GameState.pendingTargetSelection) {
          Engine.handlePendingTargetClick(opp.index);
        } else if (isSelectingAttackTarget) {
          Engine.confirmTargetForDraggedAttack(opp.index);
        } else {
          this.inspectPlayer(opp);
        }
      };

      box.innerHTML = `
        <div class="flex items-center justify-between text-xs font-black">
          <span class="truncate">${opp.name} • ${DB.factions[opp.faction].name}</span>
          <span class="text-[11px] text-white/90">🃏 ${opp.hand.length}/${Engine.getPlayerHandLimit(opp)}</span>
        </div>
        <div class="text-[10px] font-bold text-amber-300 truncate">${opp.leader.name}</div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5 text-xs font-black">
            <span class="text-rose-300 flex items-center gap-0.5"><i data-lucide="heart" class="w-3.5 h-3.5 fill-current"></i>${opp.hp}</span>
            <span class="text-cyan-300 flex items-center gap-0.5"><i data-lucide="zap" class="w-3.5 h-3.5 fill-current"></i>${opp.pc}</span>
          </div>
          <div class="flex gap-1">${this.buildBuffBadgesHTML(opp)}</div>
        </div>
      `;
      oppCol.appendChild(box);
    });

    // 2. Zona Centrale Superiore: Solo Nome sopra Zona ATK e DIF
    this.renderMiniArenaPills();
    this.renderMiniSlot("slot-attacker", GameState.slotAtkCard, "Zona ATK");
    this.renderMiniSlot("slot-defender", GameState.slotDifCard, "Zona DIF");

    // 3. Pulsante Centrale ("Passa" sparisce se devi scegliere una carta da scartare!)
    const passBtn = document.getElementById("btn-pass-turn");
    if (GameState.pendingDiscardSelection) {
      passBtn.classList.add("hidden");
    } else {
      passBtn.classList.remove("hidden");
      if (GameState.waitingForDefenseFromP1) {
        passBtn.textContent = "Subisci (No Difesa)";
        passBtn.disabled = false;
        passBtn.classList.remove("opacity-40");
      } else {
        passBtn.textContent = "Passa";
        const canPass = GameState.activePlayerIndex === me.index && GameState.currentDefendingPlayerIdx === null && !GameState.pendingTargetSelection && !GameState.slotAtkCard;
        passBtn.disabled = !canPass;
        passBtn.classList.toggle("opacity-40", !canPass);
      }
    }

    // 4. Colonna Destra: PV, PC, Carte affiancati + Obiettivo & Arena
    document.getElementById("p1-hp").textContent = me.hp;
    document.getElementById("p1-pc").textContent = me.pc;
    document.getElementById("p1-buff-row").innerHTML = this.buildBuffBadgesHTML(me);
    document.getElementById("p1-hand-counter").textContent = `${me.hand.length}/${Engine.getPlayerHandLimit(me)}`;
    document.getElementById("arena-badge").classList.toggle("hidden", !GameState.options.arenasEnabled);
    document.getElementById("p1-leader-name").textContent = me.leader.name;
    document.getElementById("my-leader-art").innerHTML = DB.generateUniqueCardArt(me.leader.name, me.faction, "creature").replace("h-16", "h-full");

    // 5. Mano del Giocatore
    const handContainer = document.getElementById("player-hand");
    handContainer.innerHTML = "";
    me.hand.forEach((card, handIdx) => {
      const effectiveCost = Engine.getEffectiveCardCost(me, card);
      const isDiscardCandidate = GameState.pendingDiscardSelection && card.uid !== GameState.pendingDiscardSelection.sourceCardUid;
      const mini = document.createElement("div");
      mini.className = `hand-card-mini ${DB.factions[card.faction].cardClass} ${isDiscardCandidate ? "ring-2 ring-amber-300 animate-pulse" : ""}`;
      mini.onclick = () => this.inspectCard(card, true, handIdx);

      mini.innerHTML = `
        <div class="absolute inset-0">${card.svgArt.replace("h-16", "h-full")}</div>
        <span class="absolute top-1 left-1 w-5 h-5 rounded-full bg-cyan-500 border border-white text-[10px] font-black flex items-center justify-center shadow">
          ${effectiveCost}
        </span>
        ${
          card.type === "creature"
            ? `<div class="absolute bottom-0 inset-x-0 bg-black/75 px-1.5 py-0.5 flex justify-between text-[10px] font-black">
                 <span class="text-rose-300">⚔️${card.atk}</span>
                 <span class="text-sky-300">🛡️${card.dif}</span>
               </div>`
            : `<div class="absolute bottom-0 inset-x-0 bg-black/75 py-0.5 text-center text-[9px] font-bold text-amber-300">AZIONE</div>`
        }
      `;
      handContainer.appendChild(mini);
    });

    lucide.createIcons();
  },

  // Ispezione Carta con Animazione Swipe fluida + Log "<nome_giocatore> sta pensando" + Modalità "Scarta"
  inspectCard(card, fromHand = false, handIdx = null) {
    if (!card) return;
    const mySlot = Multiplayer.myOnlineSlot || 0;
    const me = GameState.players[mySlot] || GameState.players[0];

    // Appena il giocatore di turno clicca su una carta e questa si zoomma, il log diventa "<nome_giocatore> sta pensando"
    if (fromHand && GameState.activePlayerIndex === me.index && !GameState.pendingDiscardSelection) {
      this.setPersistentStatus(`💭 <b>${me.name}</b> sta pensando...`);
      if (Multiplayer.networkMode === "ONLINE") {
        Multiplayer.sendClientAction({ kind: "PLAYER_THINKING" });
      }
    }

    if (fromHand) {
      GameState.inspectedHandIndex = handIdx !== null ? handIdx : me.hand.findIndex((c) => c.uid === card.uid);
    } else {
      GameState.inspectedHandIndex = null;
    }

    const view = document.getElementById("modal-custom-view");
    const actions = document.getElementById("modal-actions");

    const swipeAnimClass = GameState.lastSwipeDirection === "next"
      ? "card-swipe-next"
      : GameState.lastSwipeDirection === "prev"
      ? "card-swipe-prev"
      : "";
    GameState.lastSwipeDirection = null;

    const navHint = fromHand && me.hand.length > 1
      ? `<div class="flex items-center justify-between w-full max-w-[360px] text-[10px] text-white/60 px-2 mb-1">
           <button onclick="UI.navigateInspectedHand(-1)" class="liquid-pill px-2.5 py-1 rounded-lg font-bold">◀ Prec</button>
           <span>Scorri col dito (${GameState.inspectedHandIndex + 1}/${me.hand.length})</span>
           <button onclick="UI.navigateInspectedHand(1)" class="liquid-pill px-2.5 py-1 rounded-lg font-bold">Succ ▶</button>
         </div>`
      : "";

    view.innerHTML = `<div class="flex flex-col items-center w-full">${navHint}${this.buildCustomCardHTML(card, swipeAnimClass)}</div>`;

    let touchStartX = 0;
    view.ontouchstart = (e) => { touchStartX = e.changedTouches[0].screenX; };
    view.ontouchend = (e) => {
      if (!fromHand || me.hand.length <= 1) return;
      const diff = e.changedTouches[0].screenX - touchStartX;
      if (Math.abs(diff) > 40) {
        this.navigateInspectedHand(diff < 0 ? 1 : -1);
      }
    };

    let extraBtn = "";
    // Se siamo in modalità "Scegli una carta da scartare", spariscono "Metti in Zona ATK" e compare "Scarta"!
    if (fromHand && GameState.pendingDiscardSelection) {
      if (card.uid !== GameState.pendingDiscardSelection.sourceCardUid) {
        extraBtn = `<button onclick="UI.closeModal(); Engine.confirmManualDiscard('${card.uid}')" class="liquid-btn-gold px-6 py-2 rounded-xl text-xs font-black uppercase">🗑️ Scarta questa carta</button>`;
      }
    } else if (fromHand && GameState.activePlayerIndex === me.index && !GameState.waitingForDefenseFromP1 && card.type === "action") {
      extraBtn = `<button onclick="UI.closeModal(); Engine.initiateActionPlay(${me.index}, '${card.uid}')" class="liquid-btn-primary px-6 py-2 rounded-xl text-xs font-bold">Usa Azione</button>`;
    } else if (fromHand && GameState.activePlayerIndex === me.index && !GameState.waitingForDefenseFromP1 && card.type === "creature" && !GameState.slotAtkCard) {
      extraBtn = `<button onclick="UI.closeModal(); Engine.placeCardInAtkSlot('${card.uid}')" class="liquid-btn-gold px-6 py-2 rounded-xl text-xs font-bold">Metti in Zona ATK</button>`;
    } else if (fromHand && GameState.waitingForDefenseFromP1 && card.type === "creature") {
      extraBtn = `<button onclick="UI.closeModal(); Engine.placeCardInDifSlot('${card.uid}')" class="liquid-btn-primary px-6 py-2 rounded-xl text-xs font-bold">Difendi in Zona DIF</button>`;
    }

    actions.innerHTML = `${extraBtn}<button onclick="UI.closeModal()" class="liquid-pill px-6 py-2 rounded-xl text-xs font-bold">Chiudi</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();
  },

  navigateInspectedHand(direction) {
    const mySlot = Multiplayer.myOnlineSlot || 0;
    const me = GameState.players[mySlot] || GameState.players[0];
    if (GameState.inspectedHandIndex === null || me.hand.length === 0) return;
    GameState.lastSwipeDirection = direction > 0 ? "next" : "prev";
    const nextIdx = (GameState.inspectedHandIndex + direction + me.hand.length) % me.hand.length;
    this.inspectCard(me.hand[nextIdx], true, nextIdx);
  },

  inspectPlayer(opp) {
    const isImmune = opp.attacksTakenThisRound >= Engine.getMaxAttacksPerRound();
    const leaderArt = DB.generateUniqueCardArt(opp.leader.name, opp.faction, "creature").replace("h-16", "h-28");
    const factionClass = DB.factions[opp.faction].cardClass;
    const view = document.getElementById("modal-custom-view");

    const activeEffects = [];
    if (isImmune) activeEffects.push("Immune agli attacchi per questo Round");
    if (opp.buffNextAttack > 0) activeEffects.push(`+${opp.buffNextAttack} ATK al prossimo attacco`);
    if (opp.buffNextDefense > 0) activeEffects.push(`+${opp.buffNextDefense} DIF alla prossima difesa`);
    if (opp.halfNextAttackDamage) activeEffects.push("Dimezza l'ATK del prossimo attacco subito");
    if (opp.shieldSlamActive) activeEffects.push("Usa la DIF al posto dell'ATK in questo turno");

    view.innerHTML = `
      <div class="liquid-glass ${factionClass} p-4 rounded-2xl grid grid-cols-12 gap-4 items-center text-left max-w-lg w-full">
        <div class="col-span-4 flex flex-col items-center gap-1.5">
          <div class="w-full h-28 rounded-xl overflow-hidden border border-white/25 shadow-lg">${leaderArt}</div>
          <span class="text-[10px] font-bold uppercase tracking-widest text-white/80">${DB.factions[opp.faction].name}</span>
        </div>
        <div class="col-span-8 space-y-1.5">
          <div class="text-base font-black text-amber-300">${opp.leader.name} (${opp.name})</div>
          <div class="text-xs text-white/90"><b>Effetto Leader:</b> ${opp.leader.baseDesc}</div>
          <div class="text-xs text-rose-300"><b>Soglia Critica:</b> ≤ ${opp.leader.threshold} ♥ ${opp.awakened ? "(ATTIVO)" : ""}</div>
          <div class="text-xs text-amber-200"><b>Post-Soglia:</b> ${opp.leader.awakenedDesc}</div>
          <div class="text-xs text-yellow-300"><b>Immunità & Boost Attivi:</b> ${activeEffects.length > 0 ? activeEffects.join(" • ") : "Nessuno"}</div>
        </div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `<button onclick="UI.closeModal()" class="liquid-pill px-8 py-2 rounded-xl text-xs font-bold">Chiudi</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();
  },

  toggleObjectiveModal() {
    const mySlot = Multiplayer.myOnlineSlot || 0;
    const me = GameState.players[mySlot] || GameState.players[0];
    const progressText = Engine.getObjectiveProgressText(me);
    const factionClass = DB.factions[me.faction].cardClass;
    const view = document.getElementById("modal-custom-view");
    view.innerHTML = `
      <div class="liquid-glass ${factionClass} p-5 rounded-2xl max-w-md w-full flex flex-col items-center gap-2">
        <div class="text-[10px] font-bold uppercase tracking-widest text-amber-300">Il Tuo Obiettivo Segreto</div>
        <h3 class="text-xl font-black text-white">${me.objective.name}</h3>
        <p class="text-xs text-white/90 leading-relaxed">${me.objective.desc}</p>
        <div class="mt-2 px-4 py-1.5 rounded-xl bg-black/45 border border-amber-400/50 text-xs font-black text-amber-300">
          ${progressText}
        </div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `<button onclick="UI.closeModal()" class="liquid-pill px-8 py-2 rounded-xl text-xs font-bold">Chiudi</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
  },

  // Disegna la freccia d'attacco: se keepVisible = true resta visibile finché il difensore non sceglie la carta!
  drawTargetingArrow(fromPlayerIdx, toPlayerIdx, onComplete = null, keepVisible = false) {
    const svg = document.getElementById("targeting-arrow-layer");
    const pathEl = document.getElementById("targeting-arrow-path");
    const glowEl = document.getElementById("targeting-arrow-glow");
    const headEl = document.getElementById("target-arrowhead-path");
    const reticleEl = document.getElementById("targeting-reticle");
    const mySlot = Multiplayer.myOnlineSlot || 0;

    const getBoxEl = (pIdx) => (pIdx === mySlot ? document.getElementById("p1-resource-box") : document.getElementById(`opp-box-${pIdx}`));
    const fromEl = getBoxEl(fromPlayerIdx);
    const toEl = getBoxEl(toPlayerIdx);

    if (!svg || !pathEl || !fromEl || !toEl) {
      if (onComplete) onComplete();
      return;
    }

    const attacker = GameState.players[fromPlayerIdx];
    const factionColors = {
      goblin: "#4ade80",
      vichinghi: "#38bdf8",
      maghi: "#c084fc",
      mutaformi: "#f87171"
    };
    const strokeCol = factionColors[attacker?.faction] || "#38bdf8";

    const r1 = fromEl.getBoundingClientRect();
    const r2 = toEl.getBoundingClientRect();
    const x1 = r1.left + r1.width / 2;
    const y1 = r1.top + r1.height / 2;
    const x2 = r2.left + r2.width / 2;
    const y2 = r2.top + r2.height / 2;

    const cx = (x1 + x2) / 2 + (y2 > y1 ? 45 : -45);
    const cy = Math.min(y1, y2) - 40;
    const d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;

    pathEl.setAttribute("d", d);
    pathEl.setAttribute("stroke", strokeCol);
    glowEl.setAttribute("d", d);
    glowEl.setAttribute("stroke", strokeCol);
    if (headEl) headEl.setAttribute("fill", strokeCol);
    if (reticleEl) {
      reticleEl.setAttribute("cx", x2);
      reticleEl.setAttribute("cy", y2);
      reticleEl.setAttribute("stroke", strokeCol);
    }

    svg.classList.remove("hidden");

    if (!keepVisible) {
      setTimeout(() => {
        svg.classList.add("hidden");
        if (onComplete) onComplete();
      }, 1800);
    } else if (onComplete) {
      onComplete();
    }
  },

  hideTargetingArrow() {
    const svg = document.getElementById("targeting-arrow-layer");
    if (svg) svg.classList.add("hidden");
  },

  // Negli slot ATK/DIF mantiene ATK e DIF in primo piano (z-20) sopra le immagini .jpg
  renderMiniSlot(slotId, card, placeholder) {
    const el = document.getElementById(slotId);
    if (!card) {
      el.innerHTML = `<span>${placeholder}</span>`;
      return;
    }
    el.innerHTML = `
      <div class="relative w-full h-full rounded-xl overflow-hidden">
        <div class="absolute inset-0 z-0">${card.svgArt.replace("h-16", "h-full")}</div>
        <div class="absolute bottom-0 inset-x-0 z-20 bg-black/85 px-1.5 py-0.5 flex justify-between text-[10px] font-black">
          <span class="text-rose-300">⚔️${card.computedAtk ?? card.atk}</span>
          <span class="text-sky-300">🛡️${card.computedDif ?? card.dif}</span>
        </div>
      </div>
    `;
  },

  renderTable() {
    if (!GameState.players || GameState.players.length === 0) return;
    const mySlot = Multiplayer.myOnlineSlot || 0;
    const me = GameState.players[mySlot] || GameState.players[0];
    const iAmWaitingToDefend = GameState.waitingForDefenseFromIdx === mySlot;
    GameState.waitingForDefenseFromP1 = iAmWaitingToDefend;

    const attackOverlay = document.getElementById("under-attack-overlay");
    if (attackOverlay) attackOverlay.classList.toggle("hidden", !iAmWaitingToDefend);

    const bar = document.getElementById("persistent-status-bar");
    if (bar && GameState.persistentStatusText) bar.innerHTML = GameState.persistentStatusText;

    // 1. Colonna Sinistra: Gli altri 3 giocatori
    const oppCol = document.getElementById("opponents-col");
    oppCol.innerHTML = "";
    const opponents = GameState.players.filter((p) => p.index !== me.index);

    const isSelectingAttackTarget =
      GameState.activePlayerIndex === me.index &&
      GameState.slotAtkCard !== null &&
      GameState.currentDefendingPlayerIdx === null;

    opponents.forEach((opp) => {
      const isTurn = GameState.activePlayerIndex === opp.index && GameState.currentDefendingPlayerIdx === null;
      const isBeingAttacked = GameState.currentDefendingPlayerIdx === opp.index;
      const isImmune = opp.attacksTakenThisRound >= Engine.getMaxAttacksPerRound();
      const isSelectableActionTarget = GameState.pendingTargetSelection?.validTargets.includes(opp.index);
      const isSelectableAttackTarget = isSelectingAttackTarget && Engine.isValidAttackTarget(me.index, opp.index);

      let borderClass = "";
      if (isSelectableActionTarget || isSelectableAttackTarget) borderClass = "target-selectable-glow";
      else if (isBeingAttacked) borderClass = "status-attacked-red";
      else if (isTurn) borderClass = "status-turn-green";
      else if (isImmune) borderClass = "status-immune-yellow";

      const box = document.createElement("div");
      box.id = `opp-box-${opp.index}`;
      box.className = `relative liquid-glass panel-${opp.faction} p-2 rounded-2xl flex flex-col justify-between flex-1 cursor-pointer transition ${borderClass} ${
        opp.eliminated ? "opacity-30 grayscale pointer-events-none" : ""
      }`;

      box.onclick = () => {
        if (GameState.pendingTargetSelection) {
          Engine.handlePendingTargetClick(opp.index);
        } else if (isSelectingAttackTarget) {
          Engine.confirmTargetForDraggedAttack(opp.index);
        } else {
          this.inspectPlayer(opp);
        }
      };

      box.innerHTML = `
        <div class="flex items-center justify-between text-xs font-black">
          <span class="truncate">${opp.name} • ${DB.factions[opp.faction].name}</span>
          <span class="text-[11px] text-white/90">🃏 ${opp.hand.length}/${Engine.getPlayerHandLimit(opp)}</span>
        </div>
        <div class="text-[10px] font-bold text-amber-300 truncate">${opp.leader.name}</div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5 text-xs font-black">
            <span class="text-rose-300 flex items-center gap-0.5"><i data-lucide="heart" class="w-3.5 h-3.5 fill-current"></i>${opp.hp}</span>
            <span class="text-cyan-300 flex items-center gap-0.5"><i data-lucide="zap" class="w-3.5 h-3.5 fill-current"></i>${opp.pc}</span>
          </div>
          <div class="flex gap-1">${this.buildBuffBadgesHTML(opp)}</div>
        </div>
      `;
      oppCol.appendChild(box);
    });

    // 2. Zona Centrale Superiore: Solo Nome sopra Zona ATK e DIF
    this.renderMiniArenaPills();
    this.renderMiniSlot("slot-attacker", GameState.slotAtkCard, "Zona ATK");
    this.renderMiniSlot("slot-defender", GameState.slotDifCard, "Zona DIF");

    // Se c'è un attacco in corso e non è ancora stata scelta la carta difensiva, mantiene la freccia d'attacco visibile!
    if (GameState.currentAttackingPlayerIdx !== null && GameState.currentDefendingPlayerIdx !== null && !GameState.slotDifCard) {
      setTimeout(() => {
        if (GameState.currentAttackingPlayerIdx !== null && GameState.currentDefendingPlayerIdx !== null && !GameState.slotDifCard) {
          this.drawTargetingArrow(GameState.currentAttackingPlayerIdx, GameState.currentDefendingPlayerIdx, null, true);
        }
      }, 30);
    } else {
      this.hideTargetingArrow();
    }

    // 3. Pulsante Centrale ("SUBISCI" quando ti attaccano, "Passa" nel tuo turno)
    const passBtn = document.getElementById("btn-pass-turn");
    if (GameState.pendingDiscardSelection) {
      passBtn.classList.add("hidden");
    } else {
      passBtn.classList.remove("hidden");
      if (iAmWaitingToDefend) {
        passBtn.textContent = "SUBISCI";
        passBtn.disabled = false;
        passBtn.classList.remove("opacity-40");
      } else {
        passBtn.textContent = "Passa";
        const canPass = GameState.activePlayerIndex === me.index && GameState.currentDefendingPlayerIdx === null && !GameState.pendingTargetSelection && !GameState.slotAtkCard;
        passBtn.disabled = !canPass;
        passBtn.classList.toggle("opacity-40", !canPass);
      }
    }

    // 4. Colonna Destra: PV, PC, Carte affiancati + Obiettivo & Arena
    document.getElementById("p1-hp").textContent = me.hp;
    document.getElementById("p1-pc").textContent = me.pc;
    document.getElementById("p1-buff-row").innerHTML = this.buildBuffBadgesHTML(me);
    document.getElementById("p1-hand-counter").textContent = `${me.hand.length}/${Engine.getPlayerHandLimit(me)}`;
    document.getElementById("arena-badge").classList.toggle("hidden", !GameState.options.arenasEnabled);
    document.getElementById("p1-leader-name").textContent = me.leader.name;
    document.getElementById("my-leader-art").innerHTML = DB.generateUniqueCardArt(me.leader.name, me.faction, "creature").replace("h-16", "h-full");

    // 5. Mano del Giocatore (con z-20 su PC, ATK e DIF così restano sempre visibili sopra le foto .jpg!)
    const handContainer = document.getElementById("player-hand");
    handContainer.innerHTML = "";
    me.hand.forEach((card, handIdx) => {
      const effectiveCost = Engine.getEffectiveCardCost(me, card);
      const isDiscardCandidate = GameState.pendingDiscardSelection && card.uid !== GameState.pendingDiscardSelection.sourceCardUid;
      const mini = document.createElement("div");
      mini.className = `hand-card-mini ${DB.factions[card.faction].cardClass} ${isDiscardCandidate ? "ring-2 ring-amber-300 animate-pulse" : ""}`;
      mini.onclick = () => this.inspectCard(card, true, handIdx);

      mini.innerHTML = `
        <div class="absolute inset-0 z-0">${card.svgArt.replace("h-16", "h-full")}</div>
        <span class="absolute top-1 left-1 z-20 w-5 h-5 rounded-full bg-cyan-500 border border-white text-[10px] font-black flex items-center justify-center shadow-md">
          ${effectiveCost}
        </span>
        ${
          card.type === "creature"
            ? `<div class="absolute bottom-0 inset-x-0 z-20 bg-black/85 px-1.5 py-0.5 flex justify-between text-[10px] font-black">
                 <span class="text-rose-300">⚔️${card.atk}</span>
                 <span class="text-sky-300">🛡️${card.dif}</span>
               </div>`
            : `<div class="absolute bottom-0 inset-x-0 z-20 bg-black/85 py-0.5 text-center text-[9px] font-bold text-amber-300">AZIONE</div>`
        }
      `;
      handContainer.appendChild(mini);
    });

    lucide.createIcons();
  },

  // Modale di Riepilogo Scontro SENZA barra del tempo: il gioco rimane fermo finché tutti non premono Conferma!
  showClashConfirmModal(clashHTML, onAllConfirmedCallback = null) {
    if (GameState.readingTimerInterval) {
      clearInterval(GameState.readingTimerInterval);
      GameState.readingTimerInterval = null;
    }
    GameState.clashConfirmVotes = [];
    const totalHumans = Multiplayer.getHumanSlotsCount();

    const view = document.getElementById("modal-custom-view");
    const actions = document.getElementById("modal-actions");

    view.innerHTML = `
      <div class="flex flex-col items-center gap-2.5 w-full max-w-2xl">
        ${clashHTML}
      </div>
    `;

    actions.innerHTML = `
      <button id="btn-confirm-clash" class="liquid-btn-gold px-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider">
        Conferma (0/${totalHumans}) ➔
      </button>
    `;

    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();

    document.getElementById("btn-confirm-clash").onclick = () => {
      const mySlot = Multiplayer.myOnlineSlot || 0;
      if (!GameState.clashConfirmVotes.includes(mySlot)) GameState.clashConfirmVotes.push(mySlot);
      const btn = document.getElementById("btn-confirm-clash");
      if (btn) btn.textContent = `Conferma (${GameState.clashConfirmVotes.length}/${totalHumans}) ➔`;

      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "CONFIRM_CLASH" });
      } else {
        Engine.registerClashConfirmation(mySlot, onAllConfirmedCallback);
      }
    };
  },

  // Schermata di Fine Round + Nuovo Round: mostra sia il bilancio risorse del Round appena concluso sia i guadagni del Nuovo Round
  showNewRoundModal(roundNumber, firstPlayerName, roundSummaryLines, onConfirmCallback = null) {
    GameState.newRoundVotes = [];
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const view = document.getElementById("modal-custom-view");

    const linesHTML = (roundSummaryLines || []).map((line) => `
      <div class="liquid-pill px-3.5 py-2 rounded-xl text-xs text-left text-white/95 font-medium">
        ${line}
      </div>
    `).join("");

    view.innerHTML = `
      <div class="liquid-glass p-5 rounded-3xl w-full max-w-xl flex flex-col items-center gap-2.5">
        <div class="w-12 h-12 rounded-full liquid-pill border-2 border-amber-400 flex items-center justify-center text-amber-300 shadow-2xl round-emblem-anim">
          <i data-lucide="swords" class="w-6 h-6"></i>
        </div>
        <div class="text-[10px] font-black uppercase tracking-widest text-cyan-300">Riepilogo Fine Round ${roundNumber - 1} & Rigenerazione</div>
        <h3 class="text-xl font-black tracking-wide text-white">NUOVO ROUND ${roundNumber}</h3>
        <p class="text-xs text-amber-300 font-bold mb-1">Primo ad iniziare: ${firstPlayerName}</p>
        <div class="w-full flex flex-col gap-1.5">${linesHTML}</div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `
      <button id="btn-confirm-round" class="liquid-btn-gold px-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider">
        Conferma (0/${totalHumans}) ➔
      </button>
    `;
    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();

    document.getElementById("btn-confirm-round").onclick = () => {
      const mySlot = Multiplayer.myOnlineSlot || 0;
      if (!GameState.newRoundVotes.includes(mySlot)) GameState.newRoundVotes.push(mySlot);
      const btn = document.getElementById("btn-confirm-round");
      if (btn) btn.textContent = `Conferma (${GameState.newRoundVotes.length}/${totalHumans}) ➔`;

      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "CONFIRM_NEW_ROUND" });
      } else {
        Engine.registerNewRoundConfirmation(mySlot, onConfirmCallback);
      }
    };
  },

  // Sincronizza l'apertura e la chiusura dei modali condivisi sugli iPhone dei Client
  syncSharedModalOnClient() {
    const modal = GameState.sharedModalState;
    const totalHumans = Multiplayer.getHumanSlotsCount();

    if (!modal) {
      if (GameState.lastRenderedModalId !== null) {
        GameState.lastRenderedModalId = null;
        this.closeModal();
      }
      return;
    }

    if (GameState.lastRenderedModalId === modal.id) {
      // Aggiorna solo il contatore dei voti sul pulsante
      const clashBtn = document.getElementById("btn-confirm-clash");
      if (clashBtn) clashBtn.textContent = `Conferma (${(GameState.clashConfirmVotes || []).length}/${totalHumans}) ➔`;
      const roundBtn = document.getElementById("btn-confirm-round");
      if (roundBtn) roundBtn.textContent = `Conferma (${(GameState.newRoundVotes || []).length}/${totalHumans}) ➔`;
      const skipBtn = document.getElementById("btn-skip-timer");
      if (skipBtn) skipBtn.textContent = `Salta (${(GameState.skipVotes || []).length}/${totalHumans}) ➔`;
      return;
    }

    GameState.lastRenderedModalId = modal.id;
    if (modal.type === "ACTION_TIMED") {
      this.showTimedSummaryModal(modal.html, modal.durationMs || 10000, null);
    } else if (modal.type === "CLASH_CONFIRM") {
      this.showClashConfirmModal(modal.html, null);
    } else if (modal.type === "NEW_ROUND") {
      this.showNewRoundModal(modal.roundNumber, modal.firstPlayerName, modal.lines, null);
    }
  },

  passTurn() {
    const mySlot = Multiplayer.myOnlineSlot || 0;
    if (GameState.waitingForDefenseFromIdx === mySlot) {
      GameState.waitingForDefenseFromIdx = null;
      GameState.waitingForDefenseFromP1 = false;
      this.hideTargetingArrow();
      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "SUBMIT_DEFENSE", cardUid: null });
      } else {
        Engine.finishCombatResolution(GameState.currentAttackingPlayerIdx, mySlot, GameState.slotAtkCard, null);
      }
      return;
    }
    if (GameState.activePlayerIndex === mySlot) {
      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "PASS_TURN" });
      } else {
        Engine.executePassTurn(mySlot);
      }
    }
  },

  inspectSlot(type) {
    const card = type === "atk" ? GameState.slotAtkCard : GameState.slotDifCard;
    if (card) this.inspectCard(card, false);
  },

  inspectMyLeader() {
    const mySlot = Multiplayer.myOnlineSlot || 0;
    const me = GameState.players[mySlot] || GameState.players[0];
    this.inspectPlayer(me);
    if (me.leader.skillType === "active" && GameState.activePlayerIndex === me.index && !me.usedLeaderThisRound && !GameState.pendingDiscardSelection) {
      document.getElementById("modal-actions").innerHTML = `
        <button onclick="UI.closeModal(); Engine.activateLeaderSkill(${me.index})" class="liquid-btn-gold px-6 py-2 rounded-xl text-xs font-bold">Attiva Potere Leader</button>
        <button onclick="UI.closeModal()" class="liquid-pill px-6 py-2 rounded-xl text-xs font-bold">Chiudi</button>
      `;
    }
  },

  toggleArenaModal() {
    if (!GameState.currentArena) return;
    const art = DB.generateUniqueCardArt(GameState.currentArena.name, "maghi", "action").replace("h-16", "h-28");
    const view = document.getElementById("modal-custom-view");
    view.innerHTML = `
      <div class="liquid-glass p-4 rounded-2xl flex flex-col items-center gap-2 max-w-sm">
        <div class="text-xs font-bold uppercase tracking-widest text-cyan-300">Campo di Battaglia Attivo</div>
        <div class="text-lg font-black">${GameState.currentArena.name}</div>
        <div class="w-48 rounded-xl overflow-hidden">${art}</div>
        <div class="text-xs text-white/85 mt-1">${GameState.currentArena.desc}</div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `<button onclick="UI.closeModal()" class="liquid-pill px-8 py-2 rounded-xl text-xs font-bold">Chiudi</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
  },

  showModal(badge, title, body) {
    const view = document.getElementById("modal-custom-view");
    view.innerHTML = `
      <div class="liquid-glass p-5 rounded-2xl flex flex-col items-center gap-2 max-w-sm">
        <div class="text-[10px] font-bold uppercase tracking-widest text-cyan-300">${badge}</div>
        <h3 class="text-xl font-black">${title}</h3>
        <p class="text-xs text-white/80 leading-relaxed whitespace-pre-line">${body}</p>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `<button onclick="UI.closeModal()" class="liquid-pill px-8 py-2 rounded-xl text-xs font-bold">Chiudi</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
  },

  closeModal() {
    document.getElementById("glass-modal").classList.add("hidden");
  },

  // Rimosso anche il floating number in sovraimpressione: tutto viene registrato nel riepilogo di fine turno!
  spawnFloatingText() {},

  buildBuffBadgesHTML(p) {
    const badges = [];
    if (p.buffNextAttack > 0) badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-rose-500/30 border border-rose-400 text-[9px] font-black text-rose-200">⚔️+${p.buffNextAttack}</span>`);
    if (p.buffNextDefense > 0) badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-sky-500/30 border border-sky-400 text-[9px] font-black text-sky-200">🛡️+${p.buffNextDefense}</span>`);
    if (p.halfNextAttackDamage) badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-purple-500/30 border border-purple-300 text-[9px] font-black text-purple-200">🔮 Dimezza ATK</span>`);
    if (p.shieldSlamActive) badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-amber-500/30 border border-amber-300 text-[9px] font-black text-amber-200">🛡️ Colpo Scudo</span>`);
    if (p.forcedTargetByIdx !== null && p.forcedTargetByIdx !== undefined) {
      badges.push(`<span class="px-1.5 py-0.5 rounded-md bg-amber-500/30 border border-amber-400 text-[9px] font-black text-amber-200">🎯 Provocato</span>`);
    }
    return badges.join("");
  }
};

/* ============================================================================
   2. MOTORE DELLE REGOLE (PATCH 1.4 COMPLETA)
   ============================================================================ */
const Engine = {
  claimFactionForSlot(slotIdx, factionId, playerName) {
    if (GameState.takenFactions[factionId]) return;
    GameState.takenFactions[factionId] = { slotIdx, playerName };
    if (!GameState.selectedFaction) UI.renderFactionSelection();
  },

  registerPlayerSetupChoice(slotIdx, faction, leader, objective) {
    GameState.setupChoices[slotIdx] = { faction, leader, objective };
    const totalHumans = Multiplayer.getHumanSlotsCount();
    if (Object.keys(GameState.setupChoices).length >= totalHumans) {
      UI.showTableScreen();
      this.setupMatch();
      if (Multiplayer.networkMode === "ONLINE" && Multiplayer.isOnlineHost) {
        Multiplayer.broadcastFullStateFromHost();
      }
    }
  },

  setupMatch() {
    const allFactions = ["goblin", "vichinghi", "maghi", "mutaformi"];
    const usedFactions = Object.values(GameState.setupChoices).map((c) => c.faction);
    if (GameState.selectedFaction && !usedFactions.includes(GameState.selectedFaction)) {
      usedFactions.push(GameState.selectedFaction);
    }
    const availableFactions = allFactions.filter((f) => !usedFactions.includes(f));

    GameState.players = [0, 1, 2, 3].map((idx) => {
      const slotInfo = Multiplayer.lobbySlots?.[idx];
      const isHuman = Multiplayer.networkMode === "ONLINE" ? (slotInfo && !slotInfo.isAI) : idx === 0;
      const customChoice = GameState.setupChoices[idx] || (idx === 0 ? {
        faction: GameState.selectedFaction || "goblin",
        leader: GameState.selectedLeader,
        objective: GameState.drawnObjective
      } : null);

      const facId = customChoice?.faction || availableFactions.shift() || allFactions[idx];
      const fac = DB.factions[facId];
      const leader = customChoice?.leader || fac.leaders[Math.floor(Math.random() * fac.leaders.length)];
      const objective = customChoice?.objective || fac.objectives[Math.floor(Math.random() * fac.objectives.length)];
      const deck = DB.buildDeckForFaction(facId);
      const hand = deck.splice(0, 5);
      const defaultNames = [GameState.playerName || "P1", "P2", "P3", "P4"];

      return {
        index: idx,
        name: slotInfo?.name || defaultNames[idx],
        isAI: !isHuman,
        faction: facId,
        leader,
        objective,
        objectiveProgress: 0,
        hp: 20,
        maxHp: 20,
        pc: 5,
        deck,
        hand,
        awakened: false,
        eliminated: false,
        playedThisRound: false,
        attacksTakenThisRound: 0,
        usedLeaderThisRound: false,
        actionsPlayedThisTurn: 0,
        wonClashThisRound: false,
        lastDamagedBy: null,
        buffNextAttack: 0,
        buffNextDefense: 0,
        halfNextAttackDamage: false,
        shieldSlamActive: false,
        forbidAttackTarget: null
      };
    });

    if (GameState.options.arenasEnabled) {
      GameState.currentArena = DB.arenas[Math.floor(Math.random() * DB.arenas.length)];
    }

    GameState.round = 1;
    GameState.baseOrder = [0, 1, 2, 3];
    GameState.activePlayerIndex = 0;
    GameState.lastAttackerIndex = null;
    GameState.slotAtkCard = null;
    GameState.slotDifCard = null;
    GameState.currentAttackingPlayerIdx = null;
    GameState.currentDefendingPlayerIdx = null;
    GameState.waitingForDefenseFromP1 = false;

    this.takeRoundStartSnapshot();
    UI.setPersistentStatus(`È il turno di <b>${GameState.players[0].name}</b>`);
    UI.renderTable();
  },

  takeRoundStartSnapshot() {
    GameState.roundStartSnapshot = {};
    GameState.players.forEach((p) => {
      GameState.roundStartSnapshot[p.index] = {
        hp: p.hp,
        pc: p.pc,
        hand: p.hand.length
      };
    });
  },

  getAlivePlayers() {
    return GameState.players.filter((p) => !p.eliminated);
  },

  isFinalDuel1v1() {
    return this.getAlivePlayers().length === 2;
  },

  getMaxAttacksPerRound() {
    return this.isFinalDuel1v1() ? 2 : 1;
  },

  getMaxPcCap() {
    if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.maxPcCap) {
      return GameState.currentArena.modifier.maxPcCap;
    }
    return 10;
  },

  getPlayerHandLimit(player) {
    return player.leader.id === "ldr_eldoria" ? (player.awakened ? 9 : 8) : 7;
  },

  getObjectiveProgressText(p) {
    const id = p.objective.id;
    if (id === "obj_gob_1") return `Progresso attuale: ${p.objectiveProgress || 0}/2 scontri con 5+ danni`;
    if (id === "obj_gob_2") return `Progresso attuale: ${p.objectiveProgress || 0}/3 difese subendo danni`;
    if (id === "obj_gob_3") return `Stato attuale: Tu hai ${p.pc}/0 PC richiesti per il colpo di grazia`;
    if (id === "obj_vik_1") return `Progresso attuale: ${p.objectiveProgress || 0}/4 difese a 0 danni`;
    if (id === "obj_vik_2") return `Progresso attuale: ${p.objectiveProgress || 0}/1 eliminazioni per danno riflesso`;
    if (id === "obj_vik_3") return `Stato attuale: ${p.pc}/10 PC • ${p.hand.length}/7 Carte • Scontro vinto nel Round: ${p.wonClashThisRound ? "Sì" : "No"}`;
    if (id === "obj_mag_1") return `Stato attuale: ${p.hand.length}/11 Carte in mano • ${p.hp}/15 PV`;
    if (id === "obj_mag_2") return `Progresso attuale: ${p.objectiveProgress || 0}/3 scontri vinti in svantaggio stat`;
    if (id === "obj_mag_3") {
      const zeroPcEnemies = this.getAlivePlayers().filter((e) => e.index !== p.index && e.pc === 0).length;
      const totalEnemies = this.getAlivePlayers().length - 1;
      return `Stato attuale: ${zeroPcEnemies}/${totalEnemies} avversari a 0 PC`;
    }
    if (id === "obj_mut_1") return `Progresso attuale: ${p.objectiveProgress || 0}/1 eliminazioni copiando il nemico`;
    if (id === "obj_mut_2") return `Round attuale: ${GameState.round}/4+ (Richiede stessi PV e PC di un nemico a fine Round)`;
    if (id === "obj_mut_3") return `Progresso attuale: ${(p.copiedFactions || []).length}/3 Fazioni copiate`;
    return `Progresso attuale: ${p.objectiveProgress || 0}`;
  },

  getEffectiveCardCost(player, card) {
    let cost = card.cost;
    if (card.type === "action") {
      if (player.leader.id === "ldr_eldoria" && player.actionsPlayedThisTurn === 0) {
        cost -= player.awakened ? 2 : 1;
      }
      if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.actionDiscount) {
        cost = Math.max(1, cost - 1);
      }
    }
    if (card.type === "creature") {
      if (player.leader.id === "ldr_vaelen" && player.awakened && card.cost >= 5) cost -= 1;
      if (player.leader.id === "ldr_ragnar" && player.awakened) cost -= 1;
      if (card.effectCode === "vik_giant" && player.pc >= 8) cost -= 2;
    }
    return Math.max(0, cost);
  },

  drawCards(player, count, isStartOfRoundDraw = false) {
    const handLimit = this.getPlayerHandLimit(player);
    if (isStartOfRoundDraw && player.hand.length >= handLimit) return 0;

    let drawn = 0;
    for (let i = 0; i < count; i++) {
      if (player.deck.length === 0) {
        this.applyDirectDamage(player, 1, null, true);
      } else {
        player.hand.push(player.deck.shift());
        drawn++;
      }
    }
    return drawn;
  },

  applyDirectDamage(target, amount, sourcePlayer = null, isDeckOutDamage = false) {
    if (amount <= 0 || target.eliminated) return;
    if (target.leader.id === "ldr_grim" && target.awakened && amount > 1) amount -= 1;

    target.hp = Math.max(0, target.hp - amount);
    if (sourcePlayer && sourcePlayer.index !== target.index) target.lastDamagedBy = sourcePlayer.index;
    if (target.leader.id === "ldr_grim" && target.hp > 0) this.gainPc(target, 1);

    if (GameState.options.awakeningEnabled && !target.awakened && target.hp > 0 && target.hp <= target.leader.threshold) {
      target.awakened = true;
      target.maxHp = 12;
      if (!isDeckOutDamage) this.gainPc(target, 1);
    }

    if (target.hp === 0 && !target.eliminated) {
      target.eliminated = true;
      const doubleBounty = GameState.options.arenasEnabled && GameState.currentArena?.modifier?.doubleBounty;
      if (sourcePlayer) this.gainPc(sourcePlayer, doubleBounty ? 4 : 2);
      if (target.lastDamagedBy !== null && target.lastDamagedBy !== sourcePlayer?.index) {
        const assistPlayer = GameState.players[target.lastDamagedBy];
        if (assistPlayer && !assistPlayer.eliminated) this.healPlayer(assistPlayer, doubleBounty ? 6 : 3);
      }
      this.checkSurvivalVictory();
    }
  },

  healPlayer(player, amount) {
    if (player.eliminated || amount <= 0) return;
    player.hp = Math.min(player.maxHp, player.hp + amount);
  },

  gainPc(player, amount) {
    if (amount === 0) return;
    player.pc = Math.min(this.getMaxPcCap(), Math.max(0, player.pc + amount));
  },

  shiftArena() {
    if (!GameState.options.arenasEnabled) return;
    const others = DB.arenas.filter((a) => a.id !== GameState.currentArena?.id);
    GameState.currentArena = others[Math.floor(Math.random() * others.length)];
  },

  getValidTargetsForAction(player, effectCode) {
    const enemies = this.getAlivePlayers().filter((p) => p.index !== player.index);
    const targetedEffects = [
      "act_gob_sabotage", "act_vik_taunt", "act_mag_bolt",
      "act_mag_amnesia", "act_mut_balance", "act_mut_equality"
    ];
    if (!targetedEffects.includes(effectCode)) return null;
    if (effectCode === "act_gob_sabotage" || effectCode === "act_mag_amnesia") {
      const withPc = enemies.filter((e) => e.pc > 0);
      return (withPc.length > 0 ? withPc : enemies).map((e) => e.index);
    }
    return enemies.map((e) => e.index);
  },

  handlePendingTargetClick(targetIdx) {
    const pending = GameState.pendingTargetSelection;
    if (!pending || !pending.validTargets.includes(targetIdx)) return;
    GameState.pendingTargetSelection = null;
    pending.onSelect(targetIdx);
  },

  // Gestisce la scelta manuale della carta da scartare (es. Catalizzatore Magico o Leader Squik)
  confirmManualDiscard(discardedCardUid) {
    const pending = GameState.pendingDiscardSelection;
    if (!pending) return;
    GameState.pendingDiscardSelection = null;
    pending.onDiscard(discardedCardUid);
  },

  initiateActionPlay(playerIdx, cardUid, onAfterConfirm = null) {
    const player = GameState.players[playerIdx];
    const card = player.hand.find((c) => c.uid === cardUid);
    if (!card) return;
    const cost = this.getEffectiveCardCost(player, card);
    if (player.pc < cost) return;

    if (!player.isAI && card.effectCode === "act_mag_catalyst") {
      const otherCards = player.hand.filter((c) => c.uid !== card.uid);
      if (otherCards.length === 0) {
        UI.setPersistentStatus("⚠️ Non hai altre carte in mano da scartare!");
        return;
      }
      GameState.pendingDiscardSelection = {
        sourceCardUid: card.uid,
        onDiscard: (discardUid) => {
          if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
            Multiplayer.sendClientAction({ kind: "PLAY_ACTION_CARD", cardUid: card.uid, targetIdx: null, discardUid });
          } else {
            this.executeActionCardEffect(player, card, null, onAfterConfirm, discardUid);
          }
        }
      };
      UI.setPersistentStatus(`🗑️ Apri una carta dalla tua mano e premi <b>"Scarta questa carta"</b> per attivare ${card.name}`);
      UI.renderTable();
      return;
    }

    const validTargets = this.getValidTargetsForAction(player, card.effectCode);
    if (!player.isAI && validTargets && validTargets.length > 0) {
      GameState.pendingTargetSelection = {
        validTargets,
        onSelect: (chosenTargetIdx) => {
          if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
            Multiplayer.sendClientAction({ kind: "PLAY_ACTION_CARD", cardUid: card.uid, targetIdx: chosenTargetIdx, discardUid: null });
          } else {
            this.executeActionCardEffect(player, card, chosenTargetIdx, onAfterConfirm);
          }
        }
      };
      UI.setPersistentStatus(`🎯 Scegli a sinistra l'avversario bersaglio per <b>${card.name}</b>`);
      UI.renderTable();
    } else {
      if (!player.isAI && Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "PLAY_ACTION_CARD", cardUid: card.uid, targetIdx: null, discardUid: null });
        return;
      }
      const aiTargetIdx = validTargets && validTargets.length > 0
        ? validTargets[Math.floor(Math.random() * validTargets.length)]
        : null;
      this.executeActionCardEffect(player, card, aiTargetIdx, onAfterConfirm);
    }
  },

  executeActionCardEffect(player, card, targetIdx = null, onAfterConfirm = null, manualDiscardUid = null) {
    const cost = this.getEffectiveCardCost(player, card);
    this.gainPc(player, -cost);
    player.hand = player.hand.filter((c) => c.uid !== card.uid);

    if (player.leader.id === "ldr_eldoria" && player.awakened && player.actionsPlayedThisTurn === 0) {
      this.healPlayer(player, 1);
    }
    player.actionsPlayedThisTurn++;

    const targetEnemy = targetIdx !== null ? GameState.players[targetIdx] : null;

    switch (card.effectCode) {
      case "act_gob_pact":
        this.applyDirectDamage(player, 2, player);
        this.drawCards(player, 2);
        break;
      case "act_gob_adrenaline":
        player.buffNextAttack += 3;
        this.applyDirectDamage(player, 1, player);
        break;
      case "act_gob_ritual":
        this.applyDirectDamage(player, 3, player);
        this.gainPc(player, 4);
        break;
      case "act_gob_sabotage":
        if (targetEnemy) {
          this.gainPc(targetEnemy, -2);
          player.forbidAttackTarget = targetEnemy.index;
        }
        break;
      case "act_vik_shieldbuff":
        player.buffNextDefense += 3;
        break;
      case "act_vik_mead":
        this.healPlayer(player, 3);
        this.drawCards(player, 1);
        break;
      case "act_vik_prep":
        this.gainPc(player, 1);
        this.drawCards(player, 1);
        break;
      case "act_vik_taunt":
        this.drawCards(player, 1);
        if (targetEnemy) targetEnemy.forcedTargetByIdx = player.index;
        break;
      case "act_vik_shieldslam":
        player.shieldSlamActive = true;
        break;
      case "act_mag_meditate":
        this.drawCards(player, 2);
        break;
      case "act_mag_catalyst":
        if (manualDiscardUid) {
          player.hand = player.hand.filter((c) => c.uid !== manualDiscardUid);
        } else if (player.hand.length > 0) {
          player.hand.pop();
        }
        this.gainPc(player, 2);
        break;
      case "act_mag_barrier":
        this.healPlayer(player, 1);
        player.halfNextAttackDamage = true;
        break;
      case "act_mag_bolt":
        if (targetEnemy) this.applyDirectDamage(targetEnemy, 2, player);
        break;
      case "act_mag_amnesia":
        if (targetEnemy) {
          this.gainPc(targetEnemy, -2);
          if (targetEnemy.hand.length > 0) targetEnemy.hand.pop();
        }
        break;
      case "act_mut_molt":
        this.drawCards(player, 1);
        this.gainPc(player, 1);
        break;
      case "act_mut_mindtheft":
        player.buffNextAttack += 2;
        player.buffNextDefense += 2;
        break;
      case "act_mut_balance":
        if (targetEnemy && player.hp < targetEnemy.hp) {
          this.healPlayer(player, 2);
          this.applyDirectDamage(targetEnemy, 1, player);
        } else {
          this.drawCards(player, 2);
        }
        break;
      case "act_mut_mirror":
        player.buffNextDefense += 3;
        break;
      case "act_mut_equality":
        if (targetEnemy) this.gainPc(player, targetEnemy.pc - player.pc);
        break;
    }

    if (card.shift) this.shiftArena();

    UI.setPersistentStatus(`✨ <b>${player.name}</b> gioca carta azione${targetEnemy ? ` su <b>${targetEnemy.name}</b>` : ""}`);
    UI.renderTable();
    Multiplayer.broadcastFullStateFromHost();

    setTimeout(() => {
      const summaryHTML = `
        <div class="text-xs font-bold uppercase tracking-widest text-amber-300">${player.name} gioca una Carta Azione</div>
        ${targetEnemy ? `<div class="px-3 py-0.5 rounded-full bg-rose-500/30 border border-rose-400 text-xs font-black text-rose-200">🎯 Bersaglio: ${targetEnemy.name}</div>` : ""}
        ${UI.buildCustomCardHTML(card)}
      `;
      GameState.sharedModalState = {
        id: "act_" + Date.now(),
        type: "ACTION_TIMED",
        html: summaryHTML,
        durationMs: 10000
      };
      GameState.lastRenderedModalId = GameState.sharedModalState.id;
      Multiplayer.broadcastFullStateFromHost();

      UI.showTimedSummaryModal(summaryHTML, 10000, () => {
        GameState.sharedModalState = null;
        GameState.lastRenderedModalId = null;
        UI.renderTable();
        Multiplayer.broadcastFullStateFromHost();
        if (onAfterConfirm) onAfterConfirm();
      });
    }, 2000);
  },

  registerActionSkipVote(slotIdx) {
    if (!GameState.skipVotes.includes(slotIdx)) GameState.skipVotes.push(slotIdx);
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const btn = document.getElementById("btn-skip-timer");
    if (btn) btn.textContent = `Salta (${GameState.skipVotes.length}/${totalHumans}) ➔`;
    Multiplayer.broadcastFullStateFromHost();
  },

  activateLeaderSkill(playerIdx) {
    const player = GameState.players[playerIdx];
    if (GameState.activePlayerIndex !== playerIdx || player.usedLeaderThisRound) return;
    if (player.leader.skillType !== "active") return;

    if (player.leader.id === "ldr_zarok") {
      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "ACTIVATE_LEADER", targetIdx: null, discardUid: null });
      } else {
        this.executeLeaderSkillOnHost(playerIdx, null, null);
        Multiplayer.broadcastFullStateFromHost();
      }
    } else if (player.leader.id === "ldr_squik") {
      if (player.hand.length === 0) return;
      GameState.pendingDiscardSelection = {
        sourceCardUid: null,
        onDiscard: (discardUid) => {
          if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
            Multiplayer.sendClientAction({ kind: "ACTIVATE_LEADER", targetIdx: null, discardUid });
          } else {
            this.executeLeaderSkillOnHost(playerIdx, null, discardUid);
            Multiplayer.broadcastFullStateFromHost();
          }
        }
      };
      UI.setPersistentStatus(`🗑️ Apri una carta dalla tua mano e premi <b>"Scarta questa carta"</b> per il potere di Squik`);
      UI.renderTable();
    } else if (player.leader.id === "ldr_malakor") {
      const minPc = player.awakened ? 3 : 4;
      const valid = this.getAlivePlayers().filter((p) => p.index !== player.index && p.pc >= minPc).map((p) => p.index);
      if (valid.length === 0) return;
      GameState.pendingTargetSelection = {
        validTargets: valid,
        onSelect: (tIdx) => {
          if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
            Multiplayer.sendClientAction({ kind: "ACTIVATE_LEADER", targetIdx: tIdx, discardUid: null });
          } else {
            this.executeLeaderSkillOnHost(playerIdx, tIdx, null);
            Multiplayer.broadcastFullStateFromHost();
          }
        }
      };
      UI.setPersistentStatus(`🎯 Scegli a sinistra da quale avversario rubare con Malakor`);
      UI.renderTable();
    } else if (player.leader.id === "ldr_morphos") {
      const valid = this.getAlivePlayers()
        .filter((p) => p.index !== player.index && (player.awakened ? (p.hp > player.hp || p.pc > player.pc) : (p.hp > player.hp && p.pc > player.pc)))
        .map((p) => p.index);
      if (valid.length === 0) return;
      GameState.pendingTargetSelection = {
        validTargets: valid,
        onSelect: (tIdx) => {
          if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
            Multiplayer.sendClientAction({ kind: "ACTIVATE_LEADER", targetIdx: tIdx, discardUid: null });
          } else {
            this.executeLeaderSkillOnHost(playerIdx, tIdx, null);
            Multiplayer.broadcastFullStateFromHost();
          }
        }
      };
      UI.setPersistentStatus(`🎯 Scegli a sinistra da quale avversario assorbire con Morphos`);
      UI.renderTable();
    }
  },

  executeLeaderSkillOnHost(playerIdx, targetIdx = null, discardUid = null) {
    const player = GameState.players[playerIdx];
    if (!player || player.usedLeaderThisRound) return;
    player.usedLeaderThisRound = true;

    if (player.leader.id === "ldr_zarok") {
      if (!player.awakened) this.applyDirectDamage(player, 2, player);
      player.buffNextAttack += 3;
    } else if (player.leader.id === "ldr_squik") {
      if (discardUid) player.hand = player.hand.filter((c) => c.uid !== discardUid);
      else if (player.hand.length > 0) player.hand.pop();
      this.drawCards(player, 2);
      if (player.awakened) this.gainPc(player, 1);
    } else if (player.leader.id === "ldr_malakor" && targetIdx !== null) {
      const target = GameState.players[targetIdx];
      this.gainPc(target, -1);
      this.gainPc(player, 1);
      if (player.awakened) {
        this.applyDirectDamage(target, 1, player);
        this.healPlayer(player, 1);
      }
    } else if (player.leader.id === "ldr_morphos" && targetIdx !== null) {
      const target = GameState.players[targetIdx];
      this.healPlayer(player, 1);
      this.gainPc(player, 1);
      this.applyDirectDamage(target, 1, player);
    }
    UI.setPersistentStatus(`👑 <b>${player.name}</b> ha attivato il potere di <b>${player.leader.name}</b>`);
    UI.renderTable();
  },

  isValidAttackTarget(attackerIdx, targetIdx) {
    if (attackerIdx === targetIdx) return false;
    const attacker = GameState.players[attackerIdx];
    const target = GameState.players[targetIdx];
    if (target.eliminated) return false;
    if (attacker.forbidAttackTarget === targetIdx) return false;
    if (target.attacksTakenThisRound >= this.getMaxAttacksPerRound()) return false;
    if (!this.isFinalDuel1v1() && GameState.lastAttackerIndex === targetIdx) return false;
    return true;
  },

  placeCardInAtkSlot(cardUid) {
    const mySlot = Multiplayer.myOnlineSlot || 0;
    const me = GameState.players[mySlot] || GameState.players[0];
    const card = me.hand.find((c) => c.uid === cardUid);
    if (!card || card.type !== "creature") return;
    if (me.pc < this.getEffectiveCardCost(me, card)) return;

    GameState.slotAtkCard = card;
    GameState.currentAttackingPlayerIdx = me.index;
    UI.setPersistentStatus(`🎯 Scegli a sinistra l'avversario illuminato da attaccare!`);
    UI.renderTable();

    if (Multiplayer.networkMode === "ONLINE") {
      if (Multiplayer.isOnlineHost) Multiplayer.broadcastFullStateFromHost();
      else Multiplayer.sendClientAction({ kind: "STAGE_ATK_CARD", cardUid: card.uid });
    }
  },

  confirmTargetForDraggedAttack(targetIdx) {
    const mySlot = Multiplayer.myOnlineSlot || 0;
    if (!this.isValidAttackTarget(mySlot, targetIdx) || !GameState.slotAtkCard) return;
    if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
      Multiplayer.sendClientAction({ kind: "DECLARE_ATTACK", targetIdx, cardUid: GameState.slotAtkCard.uid });
      return;
    }
    this.resolveCombat(mySlot, targetIdx, GameState.slotAtkCard);
  },

  placeCardInDifSlot(cardUid) {
    const mySlot = Multiplayer.myOnlineSlot || 0;
    const me = GameState.players[mySlot] || GameState.players[0];
    const card = me.hand.find((c) => c.uid === cardUid);
    if (!card || card.type !== "creature") return;
    if (me.pc < this.getEffectiveCardCost(me, card)) return;

    GameState.waitingForDefenseFromIdx = null;
    GameState.waitingForDefenseFromP1 = false;
    GameState.slotDifCard = card;
    UI.hideTargetingArrow();
    UI.renderTable();

    if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
      Multiplayer.sendClientAction({ kind: "SUBMIT_DEFENSE", cardUid: card.uid });
      return;
    }
    this.finishCombatResolution(GameState.currentAttackingPlayerIdx, mySlot, GameState.slotAtkCard, card);
  },

  // Fase 1 Scontro: Sincronizza l'attacco con tutti i dispositivi, mantiene la freccia visibile e attende la difesa di Umani (anche P2/P3/P4!) o Bot
  resolveCombat(attackerIdx, defenderIdx, atkCard) {
    const attacker = GameState.players[attackerIdx];
    const defender = GameState.players[defenderIdx];

    GameState.currentAttackingPlayerIdx = attackerIdx;
    GameState.currentDefendingPlayerIdx = defenderIdx;
    GameState.slotAtkCard = atkCard;
    GameState.slotDifCard = null;
    GameState.waitingForDefenseFromIdx = null;

    const atkCost = this.getEffectiveCardCost(attacker, atkCard);
    this.gainPc(attacker, -atkCost);
    attacker.hand = attacker.hand.filter((c) => c.uid !== atkCard.uid);

    if (attacker.leader.id === "ldr_vaelen" && atkCard.cost >= 5) {
      this.drawCards(attacker, 1);
      if (attacker.awakened) this.gainPc(attacker, 1);
    }

    UI.setPersistentStatus(`⚔️ <b>${attacker.name}</b> attacca <b>${defender.name}</b>`);
    UI.renderTable();
    Multiplayer.broadcastFullStateFromHost();

    // Se il difensore è un Giocatore Umano (sia Host che Ospite P2/P3/P4!)
    if (!defender.isAI) {
      const canDefend = defender.hand.some((c) => c.type === "creature" && defender.pc >= this.getEffectiveCardCost(defender, c));
      if (canDefend) {
        GameState.waitingForDefenseFromIdx = defenderIdx;
        const mySlot = Multiplayer.myOnlineSlot || 0;
        UI.setPersistentStatus(
          defenderIdx === mySlot
            ? `🛡️ <b>${attacker.name}</b> ti attacca! Scegli una Creatura per difenderti o premi "SUBISCI"`
            : `⚔️ <b>${attacker.name}</b> attacca <b>${defender.name}</b> (In attesa della difesa di ${defender.name}...)`
        );
        UI.renderTable();
        Multiplayer.broadcastFullStateFromHost();
        return; // Si ferma qui (con la freccia attiva!) finché il difensore umano non sceglie la carta o clicca SUBISCI
      }
    }

    // Se il difensore è un Bot (o un umano senza carte giocabili), mostra la freccia per 4 secondi mentre sceglie la difesa
    UI.setPersistentStatus(`⚔️ <b>${attacker.name}</b> attacca <b>${defender.name}</b> (${defender.name} sceglie la difesa...)`);
    UI.renderTable();
    Multiplayer.broadcastFullStateFromHost();

    setTimeout(() => {
      let defCard = null;
      if (defender.isAI) {
        const affordableDefenders = defender.hand.filter(
          (c) => c.type === "creature" && defender.pc >= this.getEffectiveCardCost(defender, c)
        );
        if (affordableDefenders.length > 0) {
          affordableDefenders.sort((a, b) => (Number(b.dif) || 4) - (Number(a.dif) || 4));
          defCard = affordableDefenders[0];
        }
      }
      this.finishCombatResolution(attackerIdx, defenderIdx, atkCard, defCard);
    }, 4000);
  },

  // Fase 2 Scontro: Nasconde la freccia, calcola i danni e blocca il gioco sul Riepilogo finché TUTTI non premono Conferma
  finishCombatResolution(attackerIdx, defenderIdx, atkCard, defCard) {
    const attacker = GameState.players[attackerIdx];
    const defender = GameState.players[defenderIdx];
    const appliedCombatEffects = [];

    GameState.waitingForDefenseFromIdx = null;
    GameState.waitingForDefenseFromP1 = false;
    UI.hideTargetingArrow();

    if (defCard) {
      const defCost = this.getEffectiveCardCost(defender, defCard);
      this.gainPc(defender, -defCost);
      defender.hand = defender.hand.filter((c) => c.uid !== defCard.uid);
      GameState.slotDifCard = defCard;
    }

    let atkVal = atkCard.atk === "?" ? 2 : Number(atkCard.atk);
    let difVal = defCard ? (defCard.dif === "?" ? 2 : Number(defCard.dif)) : 0;

    if (attacker.shieldSlamActive) {
      atkVal = atkCard.dif === "?" ? 4 : Number(atkCard.dif);
      attacker.shieldSlamActive = false;
    }

    if (atkCard.effectCode === "mut_larva" && defCard) {
      atkVal = Math.min(4, Math.max(2, defCard.cost));
      appliedCombatEffects.push(`${atkCard.name}: ATK diventa ${atkVal}`);
    }
    if (defCard?.effectCode === "mut_larva") {
      difVal = Math.min(4, Math.max(2, atkCard.cost));
      appliedCombatEffects.push(`${defCard.name}: DIF diventa ${difVal}`);
    }
    if (atkCard.effectCode === "mut_doppel" && defCard) {
      atkVal = Math.max(3, Number(defCard.atk) || 3);
      appliedCombatEffects.push(`${atkCard.name}: copia ATK (${atkVal})`);
    }
    if (defCard?.effectCode === "mut_doppel") {
      difVal = Math.max(3, atkVal);
      appliedCombatEffects.push(`${defCard.name}: copia DIF (${difVal})`);
    }
    if (atkCard.effectCode === "mut_abomination") {
      atkVal = Math.min(9, Math.max(4, 20 - defender.hp));
      appliedCombatEffects.push(`${atkCard.name}: ATK pari a ${atkVal}`);
    }
    if (defCard?.effectCode === "mut_abomination") {
      difVal = Math.min(9, Math.max(4, 20 - attacker.hp));
      appliedCombatEffects.push(`${defCard.name}: DIF pari a ${difVal}`);
    }
    if (atkCard.effectCode === "mag_sage") {
      atkVal += attacker.hand.length;
      appliedCombatEffects.push(`${atkCard.name}: +${attacker.hand.length} ATK per le carte in mano`);
    }
    if (defCard?.effectCode === "mag_sage") {
      difVal += defender.hand.length;
      appliedCombatEffects.push(`${defCard.name}: +${defender.hand.length} DIF per le carte in mano`);
    }
    if (atkCard.effectCode === "mag_channeler" && attacker.actionsPlayedThisTurn > 0) {
      const bonus = attacker.actionsPlayedThisTurn * 2;
      atkVal += bonus;
      appliedCombatEffects.push(`${atkCard.name}: +${bonus} ATK per le Azioni giocate`);
    }
    if (atkCard.effectCode === "vik_berserker" && attacker.attacksTakenThisRound > 0) {
      atkVal += 3;
      appliedCombatEffects.push(`${atkCard.name}: +3 ATK per Contrattacco`);
    }

    atkVal += attacker.buffNextAttack;
    attacker.buffNextAttack = 0;
    if (defCard) {
      difVal += defender.buffNextDefense;
      defender.buffNextDefense = 0;
      if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.defBonus) {
        difVal += GameState.currentArena.modifier.defBonus;
      }
    }
    if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.lowCostAtkBonus && atkCard.cost <= 3) {
      atkVal += 1;
    }
    if (defender.halfNextAttackDamage) {
      atkVal = Math.floor(atkVal / 2);
      defender.halfNextAttackDamage = false;
      this.drawCards(defender, 1);
    }

    if (atkCard.effectCode === "gob_goliath") {
      this.applyDirectDamage(attacker, 2, attacker);
      appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} perde 2 PV`);
    }
    if (atkCard.effectCode === "mag_apprentice") {
      this.gainPc(attacker, 1);
      appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} guadagna +1 PC`);
    }
    if (defCard?.effectCode === "mag_apprentice") {
      this.gainPc(defender, 1);
      appliedCombatEffects.push(`${defCard.name}: ${defender.name} guadagna +1 PC`);
    }
    if (atkCard.effectCode === "vik_runepriest") {
      this.healPlayer(attacker, 2);
      appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} recupera +2 PV`);
    }
    if (defCard?.effectCode === "vik_runepriest") {
      this.healPlayer(defender, 2);
      appliedCombatEffects.push(`${defCard.name}: ${defender.name} recupera +2 PV`);
    }
    if (defCard?.effectCode === "gob_bomber") {
      this.applyDirectDamage(attacker, 2, defender);
      appliedCombatEffects.push(`${defCard.name}: infligge 2 danni diretti prima del calcolo`);
    }
    if (atkCard.effectCode === "mag_phantom" && defCard) {
      difVal = Math.max(0, difVal - 4);
      appliedCombatEffects.push(`${atkCard.name}: ignora fino a 4 DIF`);
    }
    if (defCard?.effectCode === "mag_mirage") {
      atkVal = Math.min(3, atkVal);
      appliedCombatEffects.push(`${defCard.name}: riduce l'ATK nemico a ${atkVal}`);
    }

    let damage = Math.max(0, atkVal - difVal);
    if (atkCard.effectCode === "gob_grinder" && damage < 2) {
      damage = 2;
      appliedCombatEffects.push(`${atkCard.name}: Perforazione garantisce 2 danni`);
    }
    if (defCard?.effectCode === "vik_huscarl" && damage > 2) {
      damage = 2;
      appliedCombatEffects.push(`${defCard.name}: riduce il danno massimo subito a 2`);
    }

    if (damage > 0) {
      if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.extraAttackDamage) {
        damage += 1;
      }
      this.applyDirectDamage(defender, damage, attacker);
      attacker.wonClashThisRound = true;
      if (atkCard.effectCode === "gob_kamikaze") {
        this.applyDirectDamage(attacker, 1, attacker);
        appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} subisce 1 danno`);
      }
      if (atkCard.effectCode === "gob_shaman") {
        this.healPlayer(attacker, 2);
        appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} recupera +2 PV`);
      }
      if (atkCard.effectCode === "gob_raider" && defender.pc > 0) {
        this.gainPc(defender, -1);
        this.gainPc(attacker, 1);
        appliedCombatEffects.push(`${atkCard.name}: ruba 1 PC a ${defender.name}`);
      }
      if (attacker.leader.id === "ldr_zarok" && attacker.awakened) this.healPlayer(attacker, 1);
      if (attacker.objective.id === "obj_gob_1" && damage >= 5) {
        attacker.objectiveProgress++;
        if (attacker.objectiveProgress >= 2) this.triggerVictory(attacker, "Obiettivo Furia Cieca completato!");
      }
      if (defender.objective.id === "obj_gob_2" && defender.hp > 0) {
        defender.objectiveProgress = (defender.objectiveProgress || 0) + 1;
        if (defender.objectiveProgress >= 3) this.triggerVictory(defender, "Obiettivo Carne da Macello completato!");
      }
    } else if (defCard) {
      defender.wonClashThisRound = true;
      if (defCard.effectCode === "vik_shieldbearer") {
        this.gainPc(defender, 1);
        appliedCombatEffects.push(`${defCard.name}: ${defender.name} guadagna +1 PC`);
      }
      if (defCard.effectCode === "vik_jarl" && difVal > atkVal) {
        const refl = difVal - atkVal;
        this.applyDirectDamage(attacker, refl, defender);
        appliedCombatEffects.push(`${defCard.name}: riflette ${refl} danni su ${attacker.name}`);
      }
      if (defender.leader.id === "ldr_freya") {
        this.applyDirectDamage(attacker, defender.awakened ? 3 : 2, defender);
        if (defender.awakened && attacker.pc > 0) this.gainPc(attacker, -1);
      }
      if (defender.objective.id === "obj_vik_1") {
        defender.objectiveProgress++;
        if (defender.objectiveProgress >= 4) this.triggerVictory(defender, "Obiettivo Muro di Ferro completato!");
      }
    }

    this.drawCards(attacker, 1);
    if (defCard) this.drawCards(defender, 1);

    attacker.playedThisRound = true;
    defender.attacksTakenThisRound++;
    GameState.lastAttackerIndex = attackerIdx;

    atkCard.computedAtk = atkVal;
    if (defCard) defCard.computedDif = difVal;
    UI.renderTable();

    const atkWins = damage > 0;
    const effectsHTML = appliedCombatEffects.length > 0
      ? appliedCombatEffects.map((ef) => `<span class="px-2.5 py-1 rounded-lg bg-black/45 border border-white/15 text-[11px] font-bold text-amber-200">✨ ${ef}</span>`).join("")
      : `<span class="text-[11px] text-white/50">Nessun effetto secondario attivato nello scontro</span>`;

    const clashHTML = `
      <div class="text-base font-black uppercase tracking-wider ${atkWins ? "text-rose-400" : "text-sky-400"}">
        ${atkWins ? `💥 Danni Inflitti: ${damage} PV a ${defender.name}` : `🛡️ Difesa Vincente: 0 Danni Subiti`}
      </div>
      <div class="flex items-center justify-center gap-3 my-1">
        ${UI.buildCustomCardHTML(atkCard, atkWins ? "clash-winner" : "clash-loser")}
        <div class="text-sm font-black text-white/50">VS</div>
        ${defCard ? UI.buildCustomCardHTML(defCard, !atkWins ? "clash-winner" : "clash-loser") : `<div class="w-[180px] h-[140px] rounded-2xl border border-dashed border-white/20 flex items-center justify-center text-xs text-white/40">Nessuna Difesa</div>`}
      </div>
      <div class="flex flex-wrap items-center justify-center gap-1.5 max-w-xl mt-1">
        ${effectsHTML}
      </div>
    `;

    GameState.sharedModalState = {
      id: "clash_" + Date.now(),
      type: "CLASH_CONFIRM",
      html: clashHTML
    };
    GameState.lastRenderedModalId = GameState.sharedModalState.id;
    Multiplayer.broadcastFullStateFromHost();

    // Nessuna barra del tempo: attende che tutti premano Conferma, poi passa direttamente al turno successivo!
    UI.showClashConfirmModal(clashHTML, () => {
      GameState.sharedModalState = null;
      GameState.lastRenderedModalId = null;
      GameState.slotAtkCard = null;
      GameState.slotDifCard = null;
      GameState.currentAttackingPlayerIdx = null;
      GameState.currentDefendingPlayerIdx = null;
      UI.renderTable();
      this.advanceTurn(defenderIdx);
      Multiplayer.broadcastFullStateFromHost();
    });
  },

  registerClashConfirmation(slotIdx, localCallback = null) {
    if (!GameState.clashConfirmVotes.includes(slotIdx)) GameState.clashConfirmVotes.push(slotIdx);
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const btn = document.getElementById("btn-confirm-clash");
    if (btn) btn.textContent = `Conferma (${GameState.clashConfirmVotes.length}/${totalHumans}) ➔`;

    if (GameState.clashConfirmVotes.length >= totalHumans) {
      UI.closeModal();
      if (localCallback) {
        localCallback();
      } else {
        const defIdx = GameState.currentDefendingPlayerIdx;
        GameState.sharedModalState = null;
        GameState.lastRenderedModalId = null;
        GameState.slotAtkCard = null;
        GameState.slotDifCard = null;
        GameState.currentAttackingPlayerIdx = null;
        GameState.currentDefendingPlayerIdx = null;
        UI.renderTable();
        this.advanceTurn(defIdx);
      }
    }
    Multiplayer.broadcastFullStateFromHost();
  },

  executePassTurn(playerIdx) {
    const player = GameState.players[playerIdx];
    player.playedThisRound = true;

    if (player.leader.id === "ldr_ragnar") {
      this.gainPc(player, player.awakened ? 3 : 2);
      this.healPlayer(player, player.awakened ? 2 : 1);
    }
    if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.passPenaltyHp) {
      this.applyDirectDamage(player, 1, player);
    }

    GameState.slotAtkCard = null;
    GameState.slotDifCard = null;
    GameState.currentAttackingPlayerIdx = null;
    GameState.currentDefendingPlayerIdx = null;

    UI.setPersistentStatus(`⏭️ <b>${player.name}</b> passa il turno`);
    UI.renderTable();
    Multiplayer.broadcastFullStateFromHost();

    // Nessun recap di fine turno singolo: passa direttamente al giocatore successivo dopo 1.2s
    setTimeout(() => {
      this.advanceTurn(null);
      Multiplayer.broadcastFullStateFromHost();
    }, 1200);
  },

  registerNewRoundConfirmation(slotIdx, localCallback = null) {
    if (!GameState.newRoundVotes.includes(slotIdx)) GameState.newRoundVotes.push(slotIdx);
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const btn = document.getElementById("btn-confirm-round");
    if (btn) btn.textContent = `Conferma (${GameState.newRoundVotes.length}/${totalHumans}) ➔`;
    if (GameState.newRoundVotes.length >= totalHumans) {
      GameState.sharedModalState = null;
      GameState.lastRenderedModalId = null;
      UI.closeModal();
      const firstIdx = GameState.activePlayerIndex;
      UI.setPersistentStatus(`È il turno di <b>${GameState.players[firstIdx].name}</b>`);
      UI.renderTable();
      if (GameState.players[firstIdx]?.isAI) {
        setTimeout(() => this.runAITurn(firstIdx), 900);
      }
    }
    Multiplayer.broadcastFullStateFromHost();
  },

  advanceTurn(attackedPlayerIdx) {
    if (GameState.gameOver) return;

    let nextIdx = null;
    if (
      attackedPlayerIdx !== null &&
      attackedPlayerIdx !== undefined &&
      !GameState.players[attackedPlayerIdx]?.eliminated &&
      !GameState.players[attackedPlayerIdx]?.playedThisRound
    ) {
      nextIdx = attackedPlayerIdx;
    } else {
      nextIdx = GameState.baseOrder.find(
        (idx) => !GameState.players[idx].eliminated && !GameState.players[idx].playedThisRound
      );
    }

    if (nextIdx === undefined || nextIdx === null) {
      this.startNewGlobalRound();
    } else {
      GameState.activePlayerIndex = nextIdx;
      GameState.players[nextIdx].actionsPlayedThisTurn = 0;
      GameState.players[nextIdx].forbidAttackTarget = null;

      UI.setPersistentStatus(`È il turno di <b>${GameState.players[nextIdx].name}</b>`);
      UI.renderTable();
      Multiplayer.broadcastFullStateFromHost();

      if (GameState.players[nextIdx].isAI) {
        setTimeout(() => this.runAITurn(nextIdx), 1000);
      }
    }
  },

  // A fine Round mostra il Bilancio del Round appena concluso + la Rigenerazione del Nuovo Round in 4 righe
  startNewGlobalRound() {
    this.getAlivePlayers().forEach((p) => {
      if (p.objective.id === "obj_mag_1" && p.hand.length >= 11 && p.hp >= 15) {
        this.triggerVictory(p, "Obiettivo Onniscienza Arcana completato!");
      }
      if (p.objective.id === "obj_vik_3" && p.pc >= 10 && p.hand.length >= 7 && p.wonClashThisRound) {
        this.triggerVictory(p, "Obiettivo Bottino del Valhalla completato!");
      }
    });
    if (GameState.gameOver) return;

    GameState.round++;
    GameState.baseOrder.push(GameState.baseOrder.shift());
    GameState.lastAttackerIndex = null;

    const pcRegen =
      GameState.options.arenasEnabled && GameState.currentArena?.modifier?.roundPcRegen
        ? GameState.currentArena.modifier.roundPcRegen
        : 3;

    const summaryLines = [];
    const fmtDelta = (val, unit, posCol, negCol) => {
      if (val > 0) return `<span class="${posCol} font-bold">+${val} ${unit}</span>`;
      if (val < 0) return `<span class="${negCol} font-bold">${val} ${unit}</span>`;
      return `<span class="text-white/50">0 ${unit}</span>`;
    };

    GameState.players.forEach((p) => {
      if (p.eliminated) {
        summaryLines.push(`💀 <b>${p.name}</b>: Eliminato`);
        return;
      }
      // 1. Calcola il bilancio del Round appena terminato rispetto a roundStartSnapshot
      const snap = GameState.roundStartSnapshot?.[p.index] || { hp: p.hp, pc: p.pc, hand: p.hand.length };
      const roundHpDiff = p.hp - snap.hp;
      const roundPcDiff = p.pc - snap.pc;
      const roundCardsDiff = p.hand.length - snap.hand;

      // 2. Applica la rigenerazione del Nuovo Round
      p.playedThisRound = false;
      p.attacksTakenThisRound = 0;
      p.usedLeaderThisRound = false;
      p.wonClashThisRound = false;

      const beforePc = p.pc;
      this.gainPc(p, pcRegen);
      const gainedPc = p.pc - beforePc;
      const drawnCount = this.drawCards(p, 1, true);

      summaryLines.push(
        `<div><b>${p.name}</b> — <i>Bilancio Round:</i> ${fmtDelta(roundHpDiff, "PV", "text-emerald-300", "text-rose-300")}, ${fmtDelta(roundPcDiff, "PC", "text-cyan-300", "text-amber-300")}, ${fmtDelta(roundCardsDiff, "Carte", "text-purple-300", "text-orange-300")} <br><span class="text-[11px] text-white/80">↳ <b>Nuovo Round:</b> <span class="text-cyan-300 font-bold">+${gainedPc} PC</span> (${p.pc} tot) • <span class="text-purple-300 font-bold">+${drawnCount} Carta</span> (${p.hand.length} in mano) • <b>${p.hp} PV</b></span></div>`
      );
    });

    GameState.roundSummaryLines = summaryLines;
    const firstIdx = GameState.baseOrder.find((idx) => !GameState.players[idx].eliminated);
    GameState.activePlayerIndex = firstIdx;
    this.takeRoundStartSnapshot();
    UI.renderTable();

    GameState.sharedModalState = {
      id: "round_" + Date.now(),
      type: "NEW_ROUND",
      roundNumber: GameState.round,
      firstPlayerName: GameState.players[firstIdx].name,
      lines: summaryLines
    };
    GameState.lastRenderedModalId = GameState.sharedModalState.id;
    Multiplayer.broadcastFullStateFromHost();

    UI.showNewRoundModal(GameState.round, GameState.players[firstIdx].name, summaryLines);
  },

  runAITurn(aiIdx) {
    if (GameState.gameOver) return;
    const ai = GameState.players[aiIdx];

    UI.setPersistentStatus(`💭 <b>${ai.name}</b> sta pensando...`);
    UI.renderTable();
    Multiplayer.broadcastFullStateFromHost();

    setTimeout(() => {
      if (GameState.gameOver) return;

      const proceedToAttackOrPass = () => {
        UI.setPersistentStatus(`💭 <b>${ai.name}</b> sta pensando...`);
        UI.renderTable();
        Multiplayer.broadcastFullStateFromHost();

        setTimeout(() => {
          if (GameState.gameOver) return;
          const playableCreatures = ai.hand.filter(
            (c) => c.type === "creature" && ai.pc >= this.getEffectiveCardCost(ai, c)
          );
          const validTargets = [0, 1, 2, 3].filter((tIdx) => this.isValidAttackTarget(aiIdx, tIdx));

          if (playableCreatures.length > 0 && validTargets.length > 0) {
            playableCreatures.sort((a, b) => (Number(b.atk) || 4) - (Number(a.atk) || 4));
            const targetIdx = validTargets[Math.floor(Math.random() * validTargets.length)];
            this.resolveCombat(aiIdx, targetIdx, playableCreatures[0]);
          } else {
            this.executePassTurn(aiIdx);
          }
        }, 4000);
      };

      const playableActions = ai.hand.filter(
        (c) => c.type === "action" && ai.pc >= this.getEffectiveCardCost(ai, c)
      );
      if (playableActions.length > 0 && ai.pc >= 4) {
        this.initiateActionPlay(aiIdx, playableActions[0].uid, proceedToAttackOrPass);
      } else {
        const playableCreatures = ai.hand.filter(
          (c) => c.type === "creature" && ai.pc >= this.getEffectiveCardCost(ai, c)
        );
        const validTargets = [0, 1, 2, 3].filter((tIdx) => this.isValidAttackTarget(aiIdx, tIdx));

        if (playableCreatures.length > 0 && validTargets.length > 0) {
          playableCreatures.sort((a, b) => (Number(b.atk) || 4) - (Number(a.atk) || 4));
          const targetIdx = validTargets[Math.floor(Math.random() * validTargets.length)];
          this.resolveCombat(aiIdx, targetIdx, playableCreatures[0]);
        } else {
          this.executePassTurn(aiIdx);
        }
      }
    }, 4000);
  },

  checkSurvivalVictory() {
    const alive = this.getAlivePlayers();
    if (alive.length === 1) {
      this.triggerVictory(alive[0], "Vittoria per Sopravvivenza (Ultimo Giocatore in vita)!");
    }
  },

  triggerVictory(winner, reason) {
    GameState.gameOver = true;
    UI.showModal("🏆 VITTORIA!", `${winner.name} ha vinto!`, `${reason}\n\nFazione: ${DB.factions[winner.faction].name} • Leader: ${winner.leader.name}`);
  }
};

window.addEventListener("DOMContentLoaded", () => UI.init());