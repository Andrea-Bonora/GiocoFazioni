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
  roundEndVotes: [],
  newRoundVotes: [],
  skipVotes: [],
  readingTimerInterval: null,
  pendingActionAfterCallback: null, // Salva la callback post-Carta Azione (così l'AI non si blocca mai quando si clicca Salta!)    
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
  wakeLockSentinel: null,

  init() {
    lucide.createIcons();
    this.renderFactionSelection();
    this.enableScreenLockAndWake();
    this.setupAppleTouchIconFromSVG();
  },

  // Converte il Logo SVG delle 4 Fazioni in icona PNG 512x512 per "Aggiungi a schermata Home" su iOS
  setupAppleTouchIconFromSVG() {
    const svgEl = document.getElementById("app-logo-svg");
    if (!svgEl) return;
    try {
      const xml = new XMLSerializer().serializeToString(svgEl);
      const svg64 = btoa(unescape(encodeURIComponent(xml)));
      const image64 = "data:image/svg+xml;base64," + svg64;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 512, 512);
        const pngUrl = canvas.toDataURL("image/png");
        const appleLink = document.getElementById("apple-touch-icon-link");
        const favLink = document.getElementById("favicon-link");
        if (appleLink) appleLink.href = pngUrl;
        if (favLink) favLink.href = pngUrl;
      };
      img.src = image64;
    } catch (e) {}
  },

  // Mostra il blocco di pausa se un giocatore umano si scollega o se stai rientrando in partita
  syncDisconnectOverlayUI() {
    const overlay = document.getElementById("overlay-disconnect-pause");
    if (!overlay) return;
    if (Multiplayer.networkMode !== "ONLINE" || GameState.currentScreen === "MENU") {
      overlay.classList.add("hidden");
      return;
    }
    Multiplayer.syncMyIdentity();
    const missingAny = Multiplayer.isRoomMissingPlayers();
    const iHaveNoSlot = Multiplayer.myOnlineSlot === null || Multiplayer.myOnlineSlot === undefined;

    if (missingAny || iHaveNoSlot) {
      document.getElementById("disconnect-room-code").textContent = Multiplayer.roomCode;
      const container = document.getElementById("rejoin-slots-container");
      container.innerHTML = "";

      Object.values(Multiplayer.lobbySlots).forEach((slot) => {
        // Mostra gli slot che erano umani nella partita
        if (!slot.wasHuman && GameState.currentScreen === "TABLE") return;
        const isMine = slot.occupiedBy === Multiplayer.myPeerId;
        const isTaken = !!slot.occupiedBy && !isMine;
        const pName = GameState.players?.[slot.index]?.name || slot.name || `Giocatore ${slot.index + 1}`;

        const btn = document.createElement("button");
        btn.className = `p-3 rounded-2xl border text-left transition ${
          isMine
            ? "bg-emerald-500/25 border-emerald-400 text-white"
            : isTaken
            ? "bg-white/5 border-amber-400/40 text-white/80"
            : "bg-amber-500/20 border-amber-400 text-white animate-pulse"
        }`;
        btn.innerHTML = `
          <div class="text-xs font-black">P${slot.index + 1} • ${pName}</div>
          <div class="text-[10px] font-bold mt-0.5 ${isMine ? "text-emerald-300" : isTaken ? "text-amber-300" : "text-cyan-300"}">
            ${isMine ? "✓ Tu (Connesso)" : isTaken ? "🔄 Occupato (Tocca per sostituire)" : "⚡ Scollegato (Tocca per entrare)"}
          </div>
        `;
        if (!isMine) {
          btn.onclick = () => Multiplayer.claimSlot(slot.index);
        }
        container.appendChild(btn);
      });
      overlay.classList.remove("hidden");
    } else {
      overlay.classList.add("hidden");
    }
  },

  enableScreenLockAndWake() {
    const requestWake = async () => {
      try {
        if ("wakeLock" in navigator && !this.wakeLockSentinel) {
          this.wakeLockSentinel = await navigator.wakeLock.request("screen");
          this.wakeLockSentinel.addEventListener("release", () => {
            this.wakeLockSentinel = null;
          });
        }
        if (screen.orientation && screen.orientation.lock) {
          await screen.orientation.lock("landscape").catch(() => {});
        }
      } catch (e) {}
    };
    document.addEventListener("click", requestWake, { passive: true });
    document.addEventListener("touchstart", requestWake, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") requestWake();
    });
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

  clearModalSwipeListeners() {
    const view = document.getElementById("modal-custom-view");
    if (view) {
      view.ontouchstart = null;
      view.ontouchend = null;
    }
    GameState.inspectedHandIndex = null;
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
    this.clearModalSwipeListeners();
    const isImmune = opp.attacksTakenThisRound >= Engine.getMaxAttacksPerRound();
    const leaderArt = DB.generateUniqueCardArt(opp.leader.name, opp.faction, "creature").replace("h-16", "h-28");
    const factionClass = DB.factions[opp.faction].cardClass;
    const view = document.getElementById("modal-custom-view");

    const activeEffects = [];

    if (opp.olafTauntActive) activeEffects.push("🛡️ Provocazione di Olaf attiva");
    if (opp.leader.id === "ldr_nyx" && opp.nyxCopiedLeader) {
      activeEffects.push(`🎭 Copia Leader: ${opp.nyxCopiedLeader.name}`);
    }
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
    this.clearModalSwipeListeners();
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
    if (bar) {
    if (GameState.slotAtkCard && GameState.currentAttackingPlayerIdx !== null && GameState.currentDefendingPlayerIdx === null) {
        const atkPlayer = GameState.players[GameState.currentAttackingPlayerIdx];
        bar.innerHTML = GameState.currentAttackingPlayerIdx === me.index
        ? `🎯 Scegli a sinistra l'avversario illuminato da attaccare!`
        : `⚔️ <b>${atkPlayer.name}</b> sta decidendo chi attaccare...`;
    } else if (GameState.persistentStatusText) {
        bar.innerHTML = GameState.persistentStatusText;
    }
    }

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

  showTimedSummaryModal(summaryHTML, durationMs = 10000, onFinishCallback = null) {
    this.clearModalSwipeListeners();
    if (GameState.readingTimerInterval) clearInterval(GameState.readingTimerInterval);
    if (onFinishCallback) GameState.pendingActionAfterCallback = onFinishCallback;

    const view = document.getElementById("modal-custom-view");
    const actions = document.getElementById("modal-actions");

    view.innerHTML = `
      <div class="flex flex-col items-center gap-2.5 w-full max-w-2xl">
        ${summaryHTML}
        <div class="w-full max-w-lg h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/20 mt-1">
          <div id="reading-bar-fill" class="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 reading-progress-fill" style="width: 100%"></div>
        </div>
      </div>
    `;

    const totalHumans = Multiplayer.getHumanSlotsCount();
    const mySlot = Multiplayer.myOnlineSlot ?? 0;
    const alreadyVoted = (GameState.skipVotes || []).includes(mySlot);

    actions.innerHTML = `
      <button id="btn-skip-timer" ${alreadyVoted ? "disabled" : ""} class="liquid-btn-gold px-8 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${alreadyVoted ? "opacity-50 pointer-events-none" : ""}">
        Salta (${(GameState.skipVotes || []).length}/${totalHumans}) ➔
      </button>
    `;

    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();

    document.getElementById("btn-skip-timer").onclick = (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.classList.add("opacity-50", "pointer-events-none");

      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        if (!GameState.skipVotes.includes(mySlot)) GameState.skipVotes.push(mySlot);
        btn.textContent = `Salta (${GameState.skipVotes.length}/${totalHumans}) ➔`;
        Multiplayer.sendClientAction({ kind: "VOTE_SKIP_SUMMARY" });
      } else {
        Engine.registerActionSkipVote(mySlot);
      }
    };

    let elapsed = 0;
    const step = 100;
    GameState.readingTimerInterval = setInterval(() => {
      if (Multiplayer.isRoomMissingPlayers()) return; // In pausa se qualcuno è scollegato
      elapsed += step;
      const pct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      const bar = document.getElementById("reading-bar-fill");
      if (bar) bar.style.width = `${pct}%`;

      if (elapsed >= durationMs) {
        Engine.finishActionSummaryNow();
      }
    }, step);
  },

  showClashConfirmModal(clashHTML, onAllConfirmedCallback = null) {
    this.clearModalSwipeListeners();
    if (GameState.readingTimerInterval) {
      clearInterval(GameState.readingTimerInterval);
      GameState.readingTimerInterval = null;
    }
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const mySlot = Multiplayer.myOnlineSlot ?? 0;
    const alreadyVoted = (GameState.clashConfirmVotes || []).includes(mySlot);
    //const alreadyVoted = false; //FIX TEMPORANEO

    const view = document.getElementById("modal-custom-view");
    const actions = document.getElementById("modal-actions");

    view.innerHTML = `<div class="flex flex-col items-center gap-2.5 w-full max-w-2xl">${clashHTML}</div>`;
    actions.innerHTML = `
      <button id="btn-confirm-clash" ${alreadyVoted ? "disabled" : ""} class="liquid-btn-gold px-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider pointer-events-none ${alreadyVoted ? "opacity-50" : ""}">
        Conferma (${(GameState.clashConfirmVotes || []).length}/${totalHumans}) ➔
      </button>
    `;

    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();

    const btnEl = document.getElementById("btn-confirm-clash");
    if (btnEl && !alreadyVoted) {
      setTimeout(() => btnEl.classList.remove("pointer-events-none"), 250);
    }

    btnEl.onclick = (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.classList.add("opacity-50", "pointer-events-none");

      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        if (!GameState.clashConfirmVotes.includes(mySlot)) GameState.clashConfirmVotes.push(mySlot);
        btn.textContent = `Conferma (${GameState.clashConfirmVotes.length}/${totalHumans}) ➔`;
        Multiplayer.sendClientAction({ kind: "CONFIRM_CLASH" });
      } else {
        Engine.registerClashConfirmation(mySlot, onAllConfirmedCallback);
      }
    };
  },

  showRoundEndSummaryModal(endedRoundNumber, balanceLines, onConfirmCallback = null) {
    this.clearModalSwipeListeners();
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const mySlot = Multiplayer.myOnlineSlot ?? 0;
    const alreadyVoted = (GameState.roundEndVotes || []).includes(mySlot);
    const view = document.getElementById("modal-custom-view");

    const linesHTML = (balanceLines || []).map((line) => `
      <div class="liquid-pill px-3 py-1.5 rounded-xl text-xs text-left text-white/95 flex items-center justify-between">
        ${line}
      </div>
    `).join("");

    view.innerHTML = `
      <div class="liquid-glass p-4 rounded-3xl w-full max-w-lg flex flex-col items-center gap-2">
        <div class="text-[10px] font-black uppercase tracking-widest text-amber-300">Bilancio Risorse</div>
        <h3 class="text-lg font-black tracking-wide text-white">RIEPILOGO FINE ROUND ${endedRoundNumber}</h3>
        <div class="w-full flex flex-col gap-1.5 mt-1">${linesHTML}</div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `
      <button id="btn-confirm-round-end" ${alreadyVoted ? "disabled" : ""} class="liquid-btn-primary px-8 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${alreadyVoted ? "opacity-50 pointer-events-none" : ""}">
        Vai al Nuovo Round (${(GameState.roundEndVotes || []).length}/${totalHumans}) ➔
      </button>
    `;
    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();

    document.getElementById("btn-confirm-round-end").onclick = (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.classList.add("opacity-50", "pointer-events-none");

      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        if (!GameState.roundEndVotes.includes(mySlot)) GameState.roundEndVotes.push(mySlot);
        btn.textContent = `Vai al Nuovo Round (${GameState.roundEndVotes.length}/${totalHumans}) ➔`;
        Multiplayer.sendClientAction({ kind: "CONFIRM_ROUND_END" });
      } else {
        Engine.registerRoundEndConfirmation(mySlot, onConfirmCallback);
      }
    };
  },

  showNewRoundModal(roundNumber, firstPlayerName, regenLines, onConfirmCallback = null) {
    this.clearModalSwipeListeners();
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const mySlot = Multiplayer.myOnlineSlot ?? 0;
    const alreadyVoted = (GameState.newRoundVotes || []).includes(mySlot);
    const view = document.getElementById("modal-custom-view");

    const linesHTML = (regenLines || []).map((line) => `
      <div class="liquid-pill px-3 py-1.5 rounded-xl text-xs text-left text-white/95 flex items-center justify-between">
        ${line}
      </div>
    `).join("");

    view.innerHTML = `
      <div class="liquid-glass p-4 rounded-3xl w-full max-w-lg flex flex-col items-center gap-2">
        <div class="w-10 h-10 rounded-full liquid-pill border-2 border-amber-400 flex items-center justify-center text-amber-300 shadow-xl round-emblem-anim">
          <i data-lucide="swords" class="w-5 h-5"></i>
        </div>
        <h3 class="text-lg font-black tracking-wide text-white">NUOVO ROUND ${roundNumber}</h3>
        <p class="text-xs text-amber-300 font-bold">Primo ad iniziare: ${firstPlayerName}</p>
        <div class="w-full flex flex-col gap-1.5 mt-0.5">${linesHTML}</div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `
      <button id="btn-confirm-round" ${alreadyVoted ? "disabled" : ""} class="liquid-btn-gold px-8 py-2 rounded-xl text-xs font-black uppercase tracking-wider ${alreadyVoted ? "opacity-50 pointer-events-none" : ""}">
        Inizia Round ${roundNumber} (${(GameState.newRoundVotes || []).length}/${totalHumans}) ➔
      </button>
    `;
    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();

    document.getElementById("btn-confirm-round").onclick = (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.classList.add("opacity-50", "pointer-events-none");

      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        if (!GameState.newRoundVotes.includes(mySlot)) GameState.newRoundVotes.push(mySlot);
        btn.textContent = `Inizia Round ${roundNumber} (${GameState.newRoundVotes.length}/${totalHumans}) ➔`;
        Multiplayer.sendClientAction({ kind: "CONFIRM_NEW_ROUND" });
      } else {
        Engine.registerNewRoundConfirmation(mySlot, onConfirmCallback);
      }
    };
  },

  syncSharedModalOnClient() {
    const modal = GameState.sharedModalState;
    const totalHumans = Multiplayer.getHumanSlotsCount();

    if (!modal) {
      if (GameState.lastRenderedModalId !== null) {
        GameState.lastRenderedModalId = null;
        this.closeModal(true);
      }
      return;
    }

    if (GameState.lastRenderedModalId === modal.id) {
      const clashBtn = document.getElementById("btn-confirm-clash");
      if (clashBtn) clashBtn.textContent = `Conferma (${(GameState.clashConfirmVotes || []).length}/${totalHumans}) ➔`;
      const rEndBtn = document.getElementById("btn-confirm-round-end");
      if (rEndBtn) rEndBtn.textContent = `Vai al Nuovo Round (${(GameState.roundEndVotes || []).length}/${totalHumans}) ➔`;
      const roundBtn = document.getElementById("btn-confirm-round");
      if (roundBtn) roundBtn.textContent = `Inizia Round ${modal.roundNumber || ""} (${(GameState.newRoundVotes || []).length}/${totalHumans}) ➔`;
      const skipBtn = document.getElementById("btn-skip-timer");
      if (skipBtn) skipBtn.textContent = `Salta (${(GameState.skipVotes || []).length}/${totalHumans}) ➔`;
      return;
    }

    GameState.lastRenderedModalId = modal.id;
    if (modal.type === "ACTION_TIMED") {
      this.showTimedSummaryModal(modal.html, modal.durationMs || 10000, null);
    } else if (modal.type === "CLASH_CONFIRM") {
      this.showClashConfirmModal(modal.html, null);
    } else if (modal.type === "ROUND_END_SUMMARY") {
      this.showRoundEndSummaryModal(modal.endedRoundNumber, modal.lines, null);
    } else if (modal.type === "NEW_ROUND") {
      this.showNewRoundModal(modal.roundNumber, modal.firstPlayerName, modal.lines, null);
    } else if (modal.type === "VICTORY") {
      this.showModal(modal.badge, modal.title, modal.body);
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

    const effLeader = Engine.getEffectiveLeader(me);
    const isMyTurn = GameState.activePlayerIndex === me.index && !GameState.waitingForDefenseFromP1;
    const isDefendingWithXylar = effLeader.id === "ldr_xylar" && GameState.waitingForDefenseFromP1;

    if (
      effLeader.skillType === "active" &&
      !me.usedLeaderThisRound &&
      !GameState.pendingDiscardSelection &&
      (isMyTurn || isDefendingWithXylar)
    ) {
      document.getElementById("modal-actions").innerHTML = `
        <button onclick="UI.closeModal(); Engine.activateLeaderSkill(${me.index})" class="liquid-btn-gold px-6 py-2 rounded-xl text-xs font-bold">
          Attiva Potere (${effLeader.name.split(" ")[0]})
        </button>
        <button onclick="UI.closeModal()" class="liquid-pill px-6 py-2 rounded-xl text-xs font-bold">Chiudi</button>
      `;
    }
  },

  toggleArenaModal() {
    this.clearModalSwipeListeners();
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

  closeModal(forceClose = false) {
    this.clearModalSwipeListeners();
    // Se un giocatore stava chiudendo l'ispezione di una carta ma nel frattempo è apparso uno scontro, mostra lo scontro!
    if (!forceClose && GameState.sharedModalState) {
      GameState.lastRenderedModalId = null;
      this.syncSharedModalOnClient();
      return;
    }
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
      badges.push(
        `<button onclick="event.stopPropagation(); UI.showProvocationDetails(${p.index})" class="px-2 py-0.5 rounded-md bg-amber-500/40 border border-amber-300 text-[9px] font-black text-amber-100 shadow cursor-pointer active:scale-95 transition animate-pulse">
           🎯 Provocato ℹ️
         </button>`
      );
    }
    return badges.join("");
  },

  showProvocationDetails(playerIdx) {
    const p = GameState.players[playerIdx];
    if (!p || p.forcedTargetByIdx === null || p.forcedTargetByIdx === undefined) return;
    const taunter = GameState.players[p.forcedTargetByIdx];
    const sourceText = taunter?.olafTauntActive
      ? `dal potere Leader di <b>${taunter.name} (Olaf Muro-di-Scudi)</b>`
      : `dalla Carta Azione Vichinga di <b>${taunter?.name || "un avversario"}</b>`;

    const isForcedValid =
      taunter &&
      !taunter.eliminated &&
      p.forbidAttackTarget !== taunter.index &&
      taunter.attacksTakenThisRound < Engine.getMaxAttacksPerRound() &&
      (Engine.isFinalDuel1v1() || GameState.lastAttackerIndex !== taunter.index);

    const statusExplanation = isForcedValid
      ? `⚠️ <b>Obbligo Attivo:</b> Se decidi di attaccare in questo turno, sei <b>obbligato ad attaccare ${taunter.name}</b> (puoi comunque giocare Carte Azione o Passare il turno).`
      : `✅ <b>Obbligo Decaduto:</b> Sei stato provocato da ${taunter?.name}, ma poiché in questo momento <b>${taunter?.name} è Immune</b> (ha già subito il limite di attacchi nel Round o ti ha appena attaccato), sei libero di attaccare gli altri avversari!`;

    this.showModal(
      "🎯 STATO PROVOCAZIONE",
      `${p.name} è Provocato!`,
      `Sei stato provocato ${sourceText}.\n\n${statusExplanation.replace(/<[^>]*>?/gm, "")}`
    );
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

  // Restituisce il Leader effettivo del giocatore (gestisce la copia dinamica di Nyx!)
  getEffectiveLeader(player) {
    if (!player) return null;
    if (player.leader.id === "ldr_nyx" && player.nyxCopiedLeader) {
      return player.nyxCopiedLeader;
    }
    return player.leader;
  },

  // Controlla se il potere del Leader (o del Leader copiato da Nyx) deve usare la versione Risvegliata
  isLeaderAwakenedForSkill(player) {
    if (!player) return false;
    if (player.leader.id === "ldr_nyx" && player.nyxCopiedLeader) {
      return player.awakened && !!player.nyxCopiedTargetAwakened;
    }
    return !!player.awakened;
  },

  // All'inizio di ogni Round, Nyx copia un Leader nemico vivo (diverso da quello del round precedente)
  assignNyxCopyForRound() {
    GameState.players.forEach((p) => {
      if (p.eliminated || p.leader.id !== "ldr_nyx") return;
      let candidates = this.getAlivePlayers().filter(
        (o) => o.index !== p.index && o.leader.id !== p.nyxLastCopiedLeaderId
      );
      if (candidates.length === 0) {
        candidates = this.getAlivePlayers().filter((o) => o.index !== p.index);
      }
      if (candidates.length > 0) {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        p.nyxCopiedLeader = chosen.leader;
        p.nyxLastCopiedLeaderId = chosen.leader.id;
        p.nyxCopiedTargetAwakened = chosen.awakened;
      }
    });
  },

  setupMatch() {
    GameState.gameOver = false;
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
        wonAnyClash: false, // Inizializzato correttamente
        copiedFactions: [], // Inizializzato come array
        lastDamagedBy: null,
        buffNextAttack: 0,
        buffNextDefense: 0,
        halfNextAttackDamage: false,
        shieldSlamActive: false,
        forbidAttackTarget: null,
        pendingEndTurnDamage: 0,
        olafTauntActive: false,
        xylarBonusDif: 0,
        nyxCopiedLeader: null,
        nyxLastCopiedLeaderId: null,
        nyxCopiedTargetAwakened: false,
        wonAnyClash: false,
        copiedFactions: []
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
    this.assignNyxCopyForRound();
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
    const effLeader = this.getEffectiveLeader(player);
    const isAwk = this.isLeaderAwakenedForSkill(player);
    return effLeader.id === "ldr_eldoria" ? (isAwk ? 9 : 8) : 7;
  },

  getObjectiveProgressText(p) {
    const id = p.objective.id;
    if (id === "obj_gob_1") return `Progresso attuale: ${p.objectiveProgress || 0}/3 scontri con 5+ danni`;
    if (id === "obj_gob_2") return `Progresso attuale: ${p.objectiveProgress || 0}/4 difese subendo danni`;
    if (id === "obj_gob_3") {
      return `Stato attuale: ${p.objectiveProgress || 0}/2 scontri vinti in attacco restando a 0 PC • (Oppure elimina un nemico avendo 0-1 PC: ora hai ${p.pc} PC)`;
    }
    if (id === "obj_vik_1") return `Progresso attuale: ${p.objectiveProgress || 0}/4 difese a 0 danni`;
    if (id === "obj_vik_2") return `Progresso attuale: ${p.objectiveProgress || 0}/3 attivazioni o eliminazione riflessa`;
    if (id === "obj_vik_3") return `Stato attuale: ${p.pc}/7+ PC • ${p.hand.length}/5+ Carte • Scontro vinto: ${p.wonAnyClash ? "Sì" : "No"}`;
    if (id === "obj_mag_1") return `Stato attuale: ${p.hand.length}/8+ Carte in mano • ${p.hp}/12+ PV`;
    if (id === "obj_mag_2") return `Progresso attuale: ${p.objectiveProgress || 0}/3 scontri vinti in svantaggio stat`;
    if (id === "obj_mag_3") return `Stato attuale: Avversari a 0-1 PC`;
    if (id === "obj_mut_1") return `Progresso attuale: ${p.objectiveProgress || 0}/3 vittorie copiando tratti nemici`;
    if (id === "obj_mut_2") return `Round attuale: ${GameState.round}/4+ (Richiede stessi PV o PC di un nemico)`;
    if (id === "obj_mut_3") return `Progresso attuale: ${(p.copiedFactions || []).length}/3 Fazioni sconfitte con copia in attacco`;
    return `Progresso attuale: ${p.objectiveProgress || 0}`;
  },

  getEffectiveCardCost(player, card) {
    let cost = card.cost;
    const effLeader = this.getEffectiveLeader(player);
    const isAwk = this.isLeaderAwakenedForSkill(player);

    if (card.type === "action") {
      if (effLeader.id === "ldr_eldoria" && player.actionsPlayedThisTurn === 0) {
        cost -= isAwk ? 2 : 1;
      }
      if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.actionDiscount) {
        cost = Math.max(1, cost - 1);
      }
    }
    if (card.type === "creature") {
      if (effLeader.id === "ldr_vaelen" && isAwk && card.cost >= 5) cost -= 1;
      if (effLeader.id === "ldr_ragnar" && isAwk) cost -= 1;
      if (card.effectCode === "vik_giant" && player.pc >= 7) cost -= 2;
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
    if (this.getEffectiveLeader(target).id === "ldr_grim" && target.awakened && amount > 1) amount -= 1;

    target.hp = Math.max(0, target.hp - amount);
    if (sourcePlayer && sourcePlayer.index !== target.index) target.lastDamagedBy = sourcePlayer.index;
    if (this.getEffectiveLeader(target).id === "ldr_grim" && target.hp > 0) this.gainPc(target, 1);

    if (GameState.options.awakeningEnabled && !target.awakened && target.hp > 0 && target.hp <= target.leader.threshold) {
      target.awakened = true;
      target.maxHp = 12;
      if (!isDeckOutDamage) this.gainPc(target, 1);
    }

    if (target.hp === 0 && !target.eliminated) {
      target.eliminated = true;
      if (sourcePlayer && sourcePlayer.objective.id === "obj_gob_3" && sourcePlayer.pc <= 1) {
        this.triggerVictory(sourcePlayer, "Obiettivo Bancarotta del Sangue completato!");
      }
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
      "act_gob_sab_2pc", "act_gob_sab_1pc", "act_gob_sab_2hp",
      "act_vik_taunt_draw", "act_vik_taunt_def",
      "act_mag_bolt_hp", "act_mag_bolt_mix", "act_mag_amnesia",
      "act_mut_balance", "act_mut_equality"
    ];
    if (!targetedEffects.includes(effectCode)) return null;
    if (effectCode === "act_gob_sab_2pc" || effectCode === "act_gob_sab_1pc" || effectCode === "act_mag_amnesia") {
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

  confirmManualDiscard(discardedCardUid) {
    const pending = GameState.pendingDiscardSelection;
    if (!pending) return;
    GameState.pendingDiscardSelection = null;
    pending.onDiscard(discardedCardUid);
  },

  initiateActionPlay(playerIdx, cardUid, onAfterConfirm = null) {
    if (GameState.gameOver) return;
    const player = GameState.players[playerIdx];
    const card = player.hand.find((c) => c.uid === cardUid);
    if (!card) return;
    const cost = this.getEffectiveCardCost(player, card);
    if (player.pc < cost) return;

    if (!player.isAI && (card.effectCode === "act_mag_catalyst" || card.effectCode === "act_mag_catalyst_heal")) {
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
    if (GameState.gameOver) return;
    const cost = this.getEffectiveCardCost(player, card);
    this.gainPc(player, -cost);
    player.hand = player.hand.filter((c) => c.uid !== card.uid);

    if (this.getEffectiveLeader(player).id === "ldr_eldoria" && this.isLeaderAwakenedForSkill(player) && player.actionsPlayedThisTurn === 0) {
      this.healPlayer(player, 1);
    }
    player.actionsPlayedThisTurn++;

    const targetEnemy = targetIdx !== null ? GameState.players[targetIdx] : null;

    switch (card.effectCode) {
      case "act_gob_pact_2_2":
        this.applyDirectDamage(player, 2, player);
        this.drawCards(player, 2);
        break;
      case "act_gob_pact_2_3":
        this.applyDirectDamage(player, 2, player);
        this.drawCards(player, 3);
        break;
      case "act_gob_pact_1_1":
        this.applyDirectDamage(player, 1, player);
        this.drawCards(player, 1);
        break;
      case "act_gob_adr_atk2_dmg1":
      case "act_gob_adr_atk2_self1":
        player.buffNextAttack += 2;
        player.pendingEndTurnDamage = (player.pendingEndTurnDamage || 0) + 1;
        break;
      case "act_gob_adr_def2":
        player.buffNextDefense += 2;
        break;
      case "act_gob_adr_atk2":
        player.buffNextAttack += 2;
        break;
      case "act_gob_ritual_2_4":
        this.applyDirectDamage(player, 2, player);
        this.gainPc(player, 4);
        break;
      case "act_gob_ritual_3_4":
        this.applyDirectDamage(player, 3, player);
        this.gainPc(player, 4);
        break;
      case "act_gob_ritual_heal2":
        this.healPlayer(player, 2);
        this.gainPc(player, 1);
        break;
      case "act_gob_sab_2pc":
        if (targetEnemy) {
          this.gainPc(targetEnemy, -2);
          player.forbidAttackTarget = targetEnemy.index;
        }
        break;
      case "act_gob_sab_1pc":
        if (targetEnemy) {
          this.gainPc(targetEnemy, -1);
          player.forbidAttackTarget = targetEnemy.index;
        }
        break;
      case "act_gob_sab_2hp":
        if (targetEnemy) {
          this.applyDirectDamage(targetEnemy, 2, player);
          player.forbidAttackTarget = targetEnemy.index;
        }
        break;
      case "act_vik_buff_3":
        player.buffNextDefense += 3;
        break;
      case "act_vik_buff_2_heal1":
        player.buffNextDefense += 2;
        this.healPlayer(player, 1);
        break;
      case "act_vik_mead_3_1":
        this.healPlayer(player, 3);
        this.drawCards(player, 1);
        break;
      case "act_vik_mead_2_pc1":
        this.healPlayer(player, 2);
        this.gainPc(player, 1);
        break;
      case "act_vik_prep_pc":
        this.gainPc(player, 1);
        this.drawCards(player, 1);
        break;
      case "act_vik_prep_hp":
        this.healPlayer(player, 1);
        this.drawCards(player, 1);
        break;
      case "act_vik_taunt_draw":
        this.drawCards(player, 1);
        if (targetEnemy) targetEnemy.forcedTargetByIdx = player.index;
        break;
      case "act_vik_taunt_def":
        player.buffNextDefense += 2;
        if (targetEnemy) targetEnemy.forcedTargetByIdx = player.index;
        break;
      case "act_vik_shieldslam":
        player.shieldSlamActive = true;
        break;
      case "act_mag_meditate_2":
        this.drawCards(player, 2);
        break;
      case "act_mag_meditate_3":
        this.drawCards(player, 2);
        this.healPlayer(player, 1);
        break;
      case "act_mag_catalyst":
        if (manualDiscardUid) player.hand = player.hand.filter((c) => c.uid !== manualDiscardUid);
        else if (player.hand.length > 0) player.hand.pop();
        this.gainPc(player, 2);
        break;
      case "act_mag_catalyst_heal":
        if (manualDiscardUid) player.hand = player.hand.filter((c) => c.uid !== manualDiscardUid);
        else if (player.hand.length > 0) player.hand.pop();
        this.gainPc(player, 1);
        this.healPlayer(player, 2);
        break;
      case "act_mag_barrier":
        this.healPlayer(player, 1);
        player.halfNextAttackDamage = true;
        break;
      case "act_mag_bolt_hp":
        if (targetEnemy) this.applyDirectDamage(targetEnemy, 2, player);
        break;
      case "act_mag_bolt_mix":
        if (targetEnemy) {
          this.applyDirectDamage(targetEnemy, 1, player);
          this.gainPc(targetEnemy, -1);
        }
        break;
      case "act_mag_amnesia":
        if (targetEnemy) {
          this.gainPc(targetEnemy, -2);
          if (targetEnemy.hand.length > 0) targetEnemy.hand.pop();
        }
        break;
      case "act_mut_molt_pc":
        this.drawCards(player, 1);
        this.gainPc(player, 1);
        break;
      case "act_mut_molt_hp":
        this.drawCards(player, 1);
        this.healPlayer(player, 1);
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

    // SE L'AZIONE HA FATTO VINCERE LA PARTITA, FERMA TUTTO SUBITO SENZA APRIRE IL BANNER DELL'AZIONE!
    if (GameState.gameOver) return;

    if (card.shift) this.shiftArena();

    const targetBannerLog = targetEnemy
      ? `✨ <b>${player.name}</b> usa <b>${card.name}</b> contro 🎯 <b>${targetEnemy.name}</b>!`
      : `✨ <b>${player.name}</b> gioca la carta azione <b>${card.name}</b>`;

    UI.setPersistentStatus(targetBannerLog);
    UI.renderTable();
    Multiplayer.broadcastFullStateFromHost();

    // Comparsa velocizzata a 400ms (0,4 secondi)
    setTimeout(() => {
      if (GameState.gameOver) return;
      GameState.skipVotes = [];
      GameState.pendingActionAfterCallback = onAfterConfirm || null;

      const summaryHTML = `
        <div class="liquid-pill px-4 py-1.5 rounded-2xl border border-amber-400/50 text-xs font-black uppercase tracking-wider text-amber-300 shadow-lg">
          ✨ ${player.name} gioca ${card.name}
        </div>
        ${
          targetEnemy
            ? `<div class="liquid-pill px-5 py-1.5 rounded-2xl bg-rose-500/35 border-2 border-rose-400 text-sm font-black text-white shadow-xl animate-pulse">
                 🎯 Bersaglio Scelto: <span class="text-amber-300 underline">${targetEnemy.name}</span>
               </div>`
            : ""
        }
        ${UI.buildCustomCardHTML(card)}
      `;
      GameState.sharedModalState = {
        id: "act_" + Date.now(),
        type: "ACTION_TIMED",
        html: summaryHTML,
        durationMs: 10000
      };
      GameState.lastRenderedModalId = GameState.sharedModalState.id;

      UI.showTimedSummaryModal(summaryHTML, 10000, onAfterConfirm);
      Multiplayer.broadcastFullStateFromHost();
    }, 400);
  },

  finishActionSummaryNow() {
    if (GameState.readingTimerInterval) {
      clearInterval(GameState.readingTimerInterval);
      GameState.readingTimerInterval = null;
    }
    GameState.sharedModalState = null;
    GameState.lastRenderedModalId = null;
    UI.closeModal(true);
    UI.renderTable();
    Multiplayer.broadcastFullStateFromHost();

    const cb = GameState.pendingActionAfterCallback;
    GameState.pendingActionAfterCallback = null;
    if (cb && !GameState.gameOver) {
      cb();
    }
  },

  registerActionSkipVote(slotIdx) {
    if (!GameState.skipVotes.includes(slotIdx)) GameState.skipVotes.push(slotIdx);
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const btn = document.getElementById("btn-skip-timer");
    if (btn) btn.textContent = `Salta (${GameState.skipVotes.length}/${totalHumans}) ➔`;

    if (GameState.skipVotes.length >= totalHumans) {
      this.finishActionSummaryNow();
    } else {
      Multiplayer.broadcastFullStateFromHost();
    }
  },

  activateLeaderSkill(playerIdx) {
    const player = GameState.players[playerIdx];
    const effLeader = this.getEffectiveLeader(player);
    const isAwk = this.isLeaderAwakenedForSkill(player);
    if (player.usedLeaderThisRound || effLeader.skillType !== "active") return;

    // Costo extra di +1 PC se Nyx non è risvegliata e usa un'abilità attiva copiata
    const nyxExtraPcCost = player.leader.id === "ldr_nyx" && !player.awakened ? 1 : 0;
    if (player.pc < nyxExtraPcCost) {
      UI.setPersistentStatus(`⚠️ Ti serve ${nyxExtraPcCost} PC extra per attivare il potere copiato da Nyx!`);
      return;
    }

    // XYLAR DAI MILLE VOLTI (Attivabile durante la propria difesa!)
    if (effLeader.id === "ldr_xylar") {
      if (GameState.waitingForDefenseFromIdx !== playerIdx) {
        UI.setPersistentStatus(`⚠️ Puoi attivare il potere di Xylar solo mentre ti stai difendendo!`);
        return;
      }
      const xylarPcCost = (isAwk ? 0 : 1) + nyxExtraPcCost;
      if (player.pc < xylarPcCost) {
        UI.setPersistentStatus(`⚠️ PC insufficienti (${xylarPcCost} PC richiesti) per attivare Xylar!`);
        return;
      }
      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "ACTIVATE_LEADER", targetIdx: null, discardUid: null });
      } else {
        this.executeLeaderSkillOnHost(playerIdx, null, null);
        Multiplayer.broadcastFullStateFromHost();
      }
      return;
    }

    // Tutti gli altri Leader attivi si usano nel proprio turno
    if (GameState.activePlayerIndex !== playerIdx) return;

    if (effLeader.id === "ldr_zarok" || effLeader.id === "ldr_olaf") {
      if (effLeader.id === "ldr_olaf" && !isAwk && player.hp <= 1) {
        UI.setPersistentStatus(`⚠️ Non hai abbastanza PV per attivare la Provocazione di Olaf!`);
        return;
      }
      if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) {
        Multiplayer.sendClientAction({ kind: "ACTIVATE_LEADER", targetIdx: null, discardUid: null });
      } else {
        this.executeLeaderSkillOnHost(playerIdx, null, null);
        Multiplayer.broadcastFullStateFromHost();
      }
    } else if (effLeader.id === "ldr_squik") {
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
    } else if (effLeader.id === "ldr_malakor") {
      const minPc = isAwk ? 3 : 4;
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
    } else if (effLeader.id === "ldr_morphos") {
      const valid = this.getAlivePlayers()
        .filter((p) => p.index !== player.index && (isAwk ? (p.hp > player.hp || p.pc > player.pc) : (p.hp > player.hp && p.pc > player.pc)))
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
    const effLeader = this.getEffectiveLeader(player);
    const isAwk = this.isLeaderAwakenedForSkill(player);
    const nyxExtraPcCost = player.leader.id === "ldr_nyx" && !player.awakened ? 1 : 0;

    if (player.pc < nyxExtraPcCost) return;
    if (nyxExtraPcCost > 0) this.gainPc(player, -nyxExtraPcCost);
    player.usedLeaderThisRound = true;

    if (effLeader.id === "ldr_zarok") {
      if (!isAwk) this.applyDirectDamage(player, 2, player);
      player.buffNextAttack += 3;
    } else if (effLeader.id === "ldr_olaf") {
      if (!isAwk) this.applyDirectDamage(player, 1, player);
      else player.buffNextDefense += 2;
      player.olafTauntActive = true;
      // Devia il prossimo attacco avversario su Olaf!
      this.getAlivePlayers().forEach((enemy) => {
        if (enemy.index !== player.index && !enemy.playedThisRound) {
          enemy.forcedTargetByIdx = player.index;
        }
      });
    } else if (effLeader.id === "ldr_xylar") {
      const cost = isAwk ? 0 : 1;
      this.gainPc(player, -cost);
      player.buffNextDefense += isAwk ? 2 : 1; // Corretto da 0 a 1
      this.drawCards(player, 1);
    } else if (effLeader.id === "ldr_squik") {
      if (discardUid) player.hand = player.hand.filter((c) => c.uid !== discardUid);
      else if (player.hand.length > 0) player.hand.pop();
      const handBefore = player.hand.length;
      this.drawCards(player, 2);
      const drawnCards = player.hand.slice(handBefore);
      if (isAwk) {
        this.gainPc(player, 1);
      } else if (drawnCards.some((c) => c.type === "action")) {
        // Fix Squik Base: subisci 1 danno se tra le carte pescate c'è un'Azione!
        this.applyDirectDamage(player, 1, player);
      }
    } else if (effLeader.id === "ldr_malakor" && targetIdx !== null) {
      const target = GameState.players[targetIdx];
      this.gainPc(target, -1);
      this.gainPc(player, 1);
      if (isAwk) {
        this.applyDirectDamage(target, 1, player);
        this.healPlayer(player, 1);
      }
    } else if (effLeader.id === "ldr_morphos" && targetIdx !== null) {
      const target = GameState.players[targetIdx];
      this.healPlayer(player, 1);
      this.gainPc(player, 1);
      this.applyDirectDamage(target, 1, player);
    }
    UI.setPersistentStatus(`👑 <b>${player.name}</b> ha attivato il potere di <b>${effLeader.name}</b>`);
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

    if (attacker.forcedTargetByIdx !== null && attacker.forcedTargetByIdx !== undefined) {
      const taunter = GameState.players[attacker.forcedTargetByIdx];
      if (
        taunter &&
        !taunter.eliminated &&
        attacker.forbidAttackTarget !== taunter.index &&
        taunter.attacksTakenThisRound < this.getMaxAttacksPerRound() &&
        (this.isFinalDuel1v1() || GameState.lastAttackerIndex !== taunter.index)
      ) {
        return targetIdx === attacker.forcedTargetByIdx;
      }
    }
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
    UI.setPersistentStatus(`⚔️ <b>${me.name}</b> sta decidendo chi attaccare...`);
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

    if (this.getEffectiveLeader(attacker).id === "ldr_vaelen" && atkCard.cost >= 5) {
      this.drawCards(attacker, 1);
      if (this.isLeaderAwakenedForSkill(attacker)) this.gainPc(attacker, 1);
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
      GameState.clashConfirmVotes = [];
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

  finishCombatResolution(attackerIdx, defenderIdx, atkCard, defCard) {
    if (GameState.gameOver) return;
    const attacker = GameState.players[attackerIdx];
    const defender = GameState.players[defenderIdx];
    const appliedCombatEffects = [];

    GameState.waitingForDefenseFromIdx = null;
    GameState.waitingForDefenseFromP1 = false;
    attacker.forcedTargetByIdx = null;
    UI.hideTargetingArrow();

    if (defCard) {
      const defCost = this.getEffectiveCardCost(defender, defCard);
      this.gainPc(defender, -defCost);
      defender.hand = defender.hand.filter((c) => c.uid !== defCard.uid);
      GameState.slotDifCard = defCard;
    }

    let atkEff = atkCard.effectCode;
    let defEff = defCard ? defCard.effectCode : null;

    const protectDef = GameState.options.arenasEnabled && GameState.currentArena?.modifier?.protectDefenderEffects;
    const cancelDefEffects = (atkEff === "vik_legend" || atkEff === "mag_archmage") && !protectDef;
    const cancelAtkEffects = defEff === "vik_legend" || defEff === "mag_archmage" || defEff === "mag_mirage_3";

    if (cancelDefEffects && defEff) {
      appliedCombatEffects.push(`${atkCard.name}: annulla l'effetto di ${defCard.name}`);
      defEff = null;
    }
    if (cancelAtkEffects && atkEff) {
      appliedCombatEffects.push(`${defCard.name}: annulla l'effetto di ${atkCard.name}`);
      atkEff = null;
    }

    let atkCopiedEnemy = false;
    let defCopiedEnemy = false;
    if ((atkEff === "mut_stealer" || atkEff === "mut_primordial") && defEff) {
      atkCopiedEnemy = true;
      if (atkEff === "mut_stealer") {
        atkEff = defEff;
        appliedCombatEffects.push(`${atkCard.name}: copia l'effetto di ${defCard.name}`);
      }
    }
    if ((defEff === "mut_stealer" || defEff === "mut_primordial") && atkEff) {
      defCopiedEnemy = true;
      if (defEff === "mut_stealer") {
        defEff = atkEff;
        appliedCombatEffects.push(`${defCard.name}: copia l'effetto di ${atkCard.name}`);
      }
    }

    const rawBaseAtk = atkCard.atk === "?" ? 2 : Number(atkCard.atk);
    const rawBaseDif = defCard ? (defCard.dif === "?" ? 2 : Number(defCard.dif)) : 0;
    let atkVal = rawBaseAtk;
    let difVal = rawBaseDif;

    if (attacker.shieldSlamActive) {
      atkVal = atkCard.dif === "?" ? 4 : Number(atkCard.dif);
      attacker.shieldSlamActive = false;
      appliedCombatEffects.push(`Colpo di Scudo: usa DIF (${atkVal}) come ATK`);
    }

    // Mutaformi
    if (atkEff === "mut_larva" && defCard) {
      atkVal = Math.min(4, Math.max(2, defCard.cost));
      atkCopiedEnemy = true;
      appliedCombatEffects.push(`${atkCard.name}: ATK diventa ${atkVal}`);
    }
    if (defEff === "mut_larva") {
      difVal = Math.min(4, Math.max(2, atkCard.cost));
      defCopiedEnemy = true;
      appliedCombatEffects.push(`${defCard.name}: DIF diventa ${difVal}`);
    }
    if (atkEff === "mut_doppel" && defCard) {
      atkVal = Math.max(3, rawBaseAtk, Number(defCard.atk) || 3);
      atkCopiedEnemy = true;
      appliedCombatEffects.push(`${atkCard.name}: copia ATK (${atkVal})`);
    }
    if (defEff === "mut_doppel") {
      difVal = Math.max(3, rawBaseDif, atkVal);
      defCopiedEnemy = true;
      appliedCombatEffects.push(`${defCard.name}: copia DIF (${difVal})`);
    }
    if (atkEff === "mut_parasite") {
      atkVal += defender.pc;
      atkCopiedEnemy = true;
      appliedCombatEffects.push(`${atkCard.name}: +${defender.pc} ATK per i PC nemici`);
    }
    if (defEff === "mut_parasite" && defCard) {
      difVal += attacker.pc;
      defCopiedEnemy = true;
      appliedCombatEffects.push(`${defCard.name}: +${attacker.pc} DIF per i PC nemici`);
    }
    if (atkEff === "mut_assimilator") {
      atkVal += 2;
      if (defCard) difVal = Math.max(0, difVal - 2);
      atkCopiedEnemy = true;
      appliedCombatEffects.push(`${atkCard.name}: assorbe 2 punti stat dal nemico`);
    }
    if (defEff === "mut_assimilator" && defCard) {
      difVal += 2;
      atkVal = Math.max(0, atkVal - 2);
      defCopiedEnemy = true;
      appliedCombatEffects.push(`${defCard.name}: assorbe 2 punti ATK dal nemico`);
    }
    if (atkEff === "mut_shaper" && defender.pc >= attacker.pc + 2) {
      const temp = attacker.pc;
      attacker.pc = defender.pc;
      defender.pc = temp;
      atkCopiedEnemy = true;
      appliedCombatEffects.push(`${atkCard.name}: scambia i PC con ${defender.name}`);
    }
    if (defEff === "mut_shaper" && attacker.pc >= defender.pc + 2) {
      const temp = defender.pc;
      defender.pc = attacker.pc;
      attacker.pc = temp;
      defCopiedEnemy = true;
      appliedCombatEffects.push(`${defCard.name}: scambia i PC con ${attacker.name}`);
    }
    if (atkEff === "mut_abomination") {
      atkVal = Math.min(9, Math.max(4, 20 - defender.hp));
      atkCopiedEnemy = true;
      appliedCombatEffects.push(`${atkCard.name}: ATK pari a ${atkVal}`);
    }
    if (defEff === "mut_abomination") {
      difVal = Math.min(9, Math.max(4, 20 - attacker.hp));
      defCopiedEnemy = true;
      appliedCombatEffects.push(`${defCard.name}: DIF pari a ${difVal}`);
    }
    if (atkCard.effectCode === "mut_primordial" && defCard) {
      const enemyAtkNum = defCard.atk === "?" ? 2 : Number(defCard.atk) || 4;
      const bonus = Math.floor((Number(enemyAtkNum) || 4) / 2);
      atkVal += bonus;
      atkEff = defEff; // Copia l'effetto della carta nemica
      atkCopiedEnemy = true;
      appliedCombatEffects.push(`${atkCard.name}: +${bonus} ATK e copia effetto da ${defCard.name}`);
    }
    if (defCard?.effectCode === "mut_primordial") {
      const bonus = Math.floor(atkVal / 2);
      difVal += bonus;
      defEff = atkEff; // Copia l'effetto della carta nemica
      defCopiedEnemy = true;
      appliedCombatEffects.push(`${defCard.name}: +${bonus} DIF e copia effetto da ${atkCard.name}`);
    }
    // Maghi e Vichinghi
    if (atkEff === "mag_sage") {
      atkVal += attacker.hand.length;
      appliedCombatEffects.push(`${atkCard.name}: +${attacker.hand.length} ATK per le carte in mano`);
    }
    if (defEff === "mag_sage") {
      difVal += defender.hand.length;
      appliedCombatEffects.push(`${defCard.name}: +${defender.hand.length} DIF per le carte in mano`);
    }
    if (atkEff === "mag_channeler" && attacker.actionsPlayedThisTurn > 0) {
      const bonus = attacker.actionsPlayedThisTurn * 2;
      atkVal += bonus;
      appliedCombatEffects.push(`${atkCard.name}: +${bonus} ATK per le Azioni giocate`);
    }
    if (atkEff === "vik_berserker_atk" && (attacker.attacksTakenThisRound > 0 || !defender.hasAttackedPlayer?.[attackerIdx])) {
      atkVal += 3;
      appliedCombatEffects.push(`${atkCard.name}: +3 ATK Furia Berserker`);
    }
    if (atkEff === "vik_berserker_heal" && attacker.attacksTakenThisRound > 0) {
      atkVal += 2;
      this.healPlayer(attacker, 1);
      appliedCombatEffects.push(`${atkCard.name}: +2 ATK e +1 PV per Contrattacco`);
    }
    if (atkEff === "mag_golem" && defCard) {
      const red = Math.min(4, defCard.cost);
      difVal = Math.max(0, difVal - red);
      appliedCombatEffects.push(`${atkCard.name}: riduce DIF nemica di ${red}`);
    }
    if (defEff === "mag_golem") {
      const red = Math.min(4, atkCard.cost);
      atkVal = Math.max(0, atkVal - red);
      appliedCombatEffects.push(`${defCard.name}: riduce ATK nemico di ${red}`);
    }

    // Buff e Arena
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
      appliedCombatEffects.push(`Barriera Arcana: ATK nemico dimezzato a ${atkVal}`);
    }

    // Effetti Pre-Calcolo Danni (Goblin, Maghi, Vichinghi)
    if (atkEff === "gob_goliath_all" || atkEff === "gob_goliath_atk") {
      this.applyDirectDamage(attacker, 2, attacker);
      appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} perde 2 PV`);
    }
    if (defEff === "gob_goliath_all") {
      this.applyDirectDamage(defender, 2, defender);
      appliedCombatEffects.push(`${defCard.name}: ${defender.name} perde 2 PV`);
    }
    if (atkEff === "gob_piercer_2hp" && defCard && attacker.hp > 2) {
      this.applyDirectDamage(attacker, 2, attacker);
      difVal = Math.max(0, difVal - 2);
      appliedCombatEffects.push(`${atkCard.name}: paga 2 PV e ignora 2 DIF`);
    }
    if (atkEff === "gob_piercer_1hp" && defCard && attacker.hp > 1) {
      this.applyDirectDamage(attacker, 1, attacker);
      difVal = Math.max(0, difVal - 2);
      appliedCombatEffects.push(`${atkCard.name}: paga 1 PV e ignora 2 DIF`);
    }
    if (atkEff === "mag_app_pc") {
      this.gainPc(attacker, 1);
      appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} guadagna +1 PC`);
    }
    if (defEff === "mag_app_pc") {
      this.gainPc(defender, 1);
      appliedCombatEffects.push(`${defCard.name}: ${defender.name} guadagna +1 PC`);
    }
    if (atkEff === "mag_app_draw") {
      this.healPlayer(attacker, 1);
      appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} recupera +1 PV`);
    }
    if (defEff === "mag_app_draw") {
      this.healPlayer(defender, 1);
      appliedCombatEffects.push(`${defCard.name}: ${defender.name} recupera +1 PV`);
    }
    if (atkEff === "mag_siphon") {
      if (defender.pc > 0) {
        this.gainPc(defender, -1);
        appliedCombatEffects.push(`${atkCard.name}: ${defender.name} perde 1 PC`);
      } else {
        this.applyDirectDamage(defender, 2, attacker);
        appliedCombatEffects.push(`${atkCard.name}: ${defender.name} (0 PC) subisce 2 danni`);
      }
    }
    if (defEff === "mag_siphon") {
      if (attacker.pc > 0) {
        this.gainPc(attacker, -1);
        appliedCombatEffects.push(`${defCard.name}: ${attacker.name} perde 1 PC`);
      } else {
        this.applyDirectDamage(attacker, 2, defender);
        appliedCombatEffects.push(`${defCard.name}: ${attacker.name} (0 PC) subisce 2 danni`);
      }
    }
    if (defEff === "vik_frost_pc") {
      this.gainPc(attacker, -1);
      appliedCombatEffects.push(`${defCard.name}: ${attacker.name} perde 1 PC`);
    }
    if (defEff === "vik_frost_atk") {
      atkVal = Math.max(0, atkVal - 1);
      this.healPlayer(defender, 1);
      appliedCombatEffects.push(`${defCard.name}: -1 ATK nemico e +1 PV a ${defender.name}`);
    }
    if (atkEff === "vik_priest_hp") {
      this.healPlayer(attacker, 2);
      appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} recupera +2 PV`);
    }
    if (defEff === "vik_priest_hp") {
      this.healPlayer(defender, 2);
      appliedCombatEffects.push(`${defCard.name}: ${defender.name} recupera +2 PV`);
    }
    if (atkEff === "vik_priest_mix") {
      this.healPlayer(attacker, 1);
      this.gainPc(attacker, 1);
      appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} ottiene +1 PV e +1 PC`);
    }
    if (defEff === "vik_priest_mix") {
      this.healPlayer(defender, 1);
      this.gainPc(defender, 1);
      appliedCombatEffects.push(`${defCard.name}: ${defender.name} ottiene +1 PV e +1 PC`);
    }
    if (defEff === "gob_bomber_2") {
      this.applyDirectDamage(attacker, 2, defender);
      appliedCombatEffects.push(`${defCard.name}: infligge 2 danni diretti a ${attacker.name}`);
      if (defender.objective.id === "obj_vik_2") {
        defender.objectiveProgress = (defender.objectiveProgress || 0) + 1;
        if (attacker.hp === 0 || defender.objectiveProgress >= 3) {
          this.triggerVictory(defender, "Obiettivo Contrattacco Letale completato!");
        }
      }
    }
    if (defEff === "gob_bomber_1_pc") {
      this.applyDirectDamage(attacker, 1, defender);
      this.gainPc(attacker, -1);
      appliedCombatEffects.push(`${defCard.name}: 1 danno e -1 PC a ${attacker.name}`);
      if (defender.objective.id === "obj_vik_2") {
        defender.objectiveProgress = (defender.objectiveProgress || 0) + 1;
        if (attacker.hp === 0 || defender.objectiveProgress >= 3) {
          this.triggerVictory(defender, "Obiettivo Contrattacco Letale completato!");
        }
      }
    }
    if (atkEff === "mag_phantom" && defCard) {
      difVal = Math.max(0, difVal - 4);
      appliedCombatEffects.push(`${atkCard.name}: ignora fino a 4 DIF`);
    }
    if (defEff === "mag_mirage_3") {
      atkVal = Math.min(3, atkVal);
      appliedCombatEffects.push(`${defCard.name}: riduce l'ATK nemico a max 3`);
    }
    if (defEff === "mag_mirage_2") {
      atkVal = Math.max(0, atkVal - 2);
      appliedCombatEffects.push(`${defCard.name}: riduce di 2 l'ATK nemico`);
    }

    // Calcolo Danni
    let damage = Math.max(0, atkVal - difVal);
    if (atkEff === "gob_grinder" && damage < 2) {
      damage = 2;
      appliedCombatEffects.push(`${atkCard.name}: Perforazione garantisce 2 danni`);
    }
    if (defEff === "vik_huscarl_cap2" && damage > 2) {
      damage = 2;
      appliedCombatEffects.push(`${defCard.name}: riduce il danno massimo subito a 2`);
    }
    if (defEff === "vik_huscarl_cap1" && damage > 1) {
      damage = 1;
      appliedCombatEffects.push(`${defCard.name}: riduce il danno massimo subito a 1`);
    }

    if (damage > 0) {
      defender.olafTauntActive = false;
      if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.extraAttackDamage) {
        damage += 1;
      }
      this.applyDirectDamage(defender, damage, attacker);
      attacker.wonClashThisRound = true;
      attacker.wonAnyClash = true;

      // Progresso Obiettivi Mutaformi e Goblin in attacco vincente
      if (atkCopiedEnemy) {
        if (attacker.faction === "mutaformi") {
          if (!attacker.copiedFactions) attacker.copiedFactions = [];
          if (!attacker.copiedFactions.includes(defender.faction)) {
            attacker.copiedFactions.push(defender.faction);
            if (attacker.objective.id === "obj_mut_3" && attacker.copiedFactions.length >= 3) {
              this.triggerVictory(attacker, "Obiettivo Ladri di Identità completato!");
            }
          }
        }
        if (attacker.objective.id === "obj_mut_1") {
          attacker.objectiveProgress = (attacker.objectiveProgress || 0) + 1;
          if (defender.hp === 0 || attacker.objectiveProgress >= 3) {
            this.triggerVictory(attacker, "Obiettivo Specchio Perfetto completato!");
          }
        }
      }
      if (attacker.objective.id === "obj_gob_3" && attacker.pc === 0) {
        attacker.objectiveProgress = (attacker.objectiveProgress || 0) + 1;
        if (attacker.objectiveProgress >= 2) {
          this.triggerVictory(attacker, "Obiettivo Bancarotta del Sangue completato!");
        }
      }

      if (defender.hp > 0 && atkEff === "gob_grinder") {
        this.gainPc(attacker, -2);
        appliedCombatEffects.push(`${atkCard.name}: il bersaglio sopravvive (-2 PC)`);
      }
      if (atkEff === "gob_kamikaze_hp") {
        this.applyDirectDamage(attacker, 1, attacker);
        appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} subisce 1 danno`);
      }
      if (atkEff === "gob_kamikaze_pc") {
        this.gainPc(attacker, -1);
        appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} perde 1 PC`);
      }
      if (atkEff === "gob_shaman") {
        this.healPlayer(attacker, 2);
        appliedCombatEffects.push(`${atkCard.name}: ${attacker.name} recupera +2 PV`);
      }
      if ((atkEff === "gob_raider_pc" || atkEff === "gob_merc_pc") && defender.pc > 0) {
        this.gainPc(defender, -1);
        this.gainPc(attacker, 1);
        appliedCombatEffects.push(`${atkCard.name}: ruba 1 PC a ${defender.name}`);
      }
      if (atkEff === "gob_raider_hp" && damage >= 3) {
        this.applyDirectDamage(defender, 1, attacker);
        this.healPlayer(attacker, 1);
        appliedCombatEffects.push(`${atkCard.name}: ruba 1 PV a ${defender.name}`);
      }
      if (atkEff === "gob_merc_hp") {
        this.applyDirectDamage(defender, 2, attacker);
        this.healPlayer(attacker, 2);
        appliedCombatEffects.push(`${atkCard.name}: ruba 2 PV a ${defender.name}`);
      }
      if (atkEff === "vik_legend") {
        this.drawCards(attacker, 2);
        appliedCombatEffects.push(`${atkCard.name}: pesca 2 carte per vittoria scontro`);
      }
      if (this.getEffectiveLeader(attacker).id === "ldr_zarok" && this.isLeaderAwakenedForSkill(attacker)) {
        this.healPlayer(attacker, 1);
      }

      if (attacker.objective.id === "obj_gob_1" && damage >= 5) {
        attacker.objectiveProgress = (attacker.objectiveProgress || 0) + 1;
        if (attacker.objectiveProgress >= 3) this.triggerVictory(attacker, "Obiettivo Furia Cieca completato!");
      }
      if (defender.objective.id === "obj_gob_2" && defender.hp > 0) {
        defender.objectiveProgress = (defender.objectiveProgress || 0) + 1;
        if (defender.objectiveProgress >= 4) this.triggerVictory(defender, "Obiettivo Carne da Macello completato!");
      }
      if (attacker.objective.id === "obj_mag_2" && defCard && (atkCard.cost < defCard.cost || rawBaseAtk < rawBaseDif)) {
        attacker.objectiveProgress = (attacker.objectiveProgress || 0) + 1;
        if (attacker.objectiveProgress >= 3) this.triggerVictory(attacker, "Obiettivo Supremazia della Mente completato!");
      }
      if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.drawOnWinClash) {
        this.drawCards(attacker, 1);
      }
    } else if (defCard) {
      defender.wonClashThisRound = true;
      defender.wonAnyClash = true;

      if (defCopiedEnemy && defender.objective.id === "obj_mut_1") {
        defender.objectiveProgress = (defender.objectiveProgress || 0) + 1;
        if (defender.objectiveProgress >= 3) {
          this.triggerVictory(defender, "Obiettivo Specchio Perfetto completato!");
        }
      }
      if (defEff === "vik_shield_pc") {
        this.gainPc(defender, 1);
        appliedCombatEffects.push(`${defCard.name}: ${defender.name} guadagna +1 PC`);
      }
      if (defEff === "vik_shield_hp") {
        this.healPlayer(defender, 1);
        appliedCombatEffects.push(`${defCard.name}: ${defender.name} recupera +1 PV`);
      }
      if (defEff === "gob_merc_pc" && attacker.pc > 0) {
        this.gainPc(attacker, -1);
        this.gainPc(defender, 1);
        appliedCombatEffects.push(`${defCard.name}: ruba 1 PC a ${attacker.name}`);
      }
      if (defEff === "gob_merc_hp") {
        this.applyDirectDamage(attacker, 2, defender);
        this.healPlayer(defender, 2);
        appliedCombatEffects.push(`${defCard.name}: ruba 2 PV a ${attacker.name}`);
      }
      if (defEff === "vik_legend") {
        this.drawCards(defender, 2);
        appliedCombatEffects.push(`${defCard.name}: pesca 2 carte per vittoria scontro`);
      }

      let reflectedTotal = 0;
      if (defEff === "vik_jarl_refl" && difVal > atkVal) {
        const refl = difVal - atkVal;
        reflectedTotal += refl;
        this.applyDirectDamage(attacker, refl, defender);
        appliedCombatEffects.push(`${defCard.name}: riflette ${refl} danni su ${attacker.name}`);
      }
      if (defEff === "vik_jarl_fixed") {
        reflectedTotal += 2;
        this.applyDirectDamage(attacker, 2, defender);
        this.gainPc(defender, 1);
        appliedCombatEffects.push(`${defCard.name}: riflette 2 danni e dà +1 PC`);
      }
      if (this.getEffectiveLeader(defender).id === "ldr_freya") {
        const refl = this.isLeaderAwakenedForSkill(defender) ? 3 : 2;
        reflectedTotal += refl;
        this.applyDirectDamage(attacker, refl, defender);
        appliedCombatEffects.push(`Freya: riflette ${refl} danni su ${attacker.name}`);
        if (this.isLeaderAwakenedForSkill(defender) && attacker.pc > 0) this.gainPc(attacker, -1);
      }
      if (reflectedTotal > 0 && defender.objective.id === "obj_vik_2") {
        defender.objectiveProgress = (defender.objectiveProgress || 0) + 1;
        if (attacker.hp === 0 || defender.objectiveProgress >= 3) {
          this.triggerVictory(defender, "Obiettivo Contrattacco Letale completato!");
        }
      }
      if (defender.objective.id === "obj_vik_1") {
        defender.objectiveProgress = (defender.objectiveProgress || 0) + 1;
        if (defender.objectiveProgress >= 4) this.triggerVictory(defender, "Obiettivo Muro di Ferro completato!");
      }
      if (defender.objective.id === "obj_mag_2" && (defCard.cost < atkCard.cost || rawBaseDif < rawBaseAtk)) {
        defender.objectiveProgress = (defender.objectiveProgress || 0) + 1;
        if (defender.objectiveProgress >= 3) this.triggerVictory(defender, "Obiettivo Supremazia della Mente completato!");
      }
      if (defender.olafTauntActive) {
        defender.olafTauntActive = false;
        this.gainPc(defender, 2);
        appliedCombatEffects.push(`Olaf: Provocazione parata a 0 danni (+2 PC)`);
      }
      if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.drawOnWinClash) {
        this.drawCards(defender, 1);
      }
    }

    // Fuori dal blocco defCard (controlla sempre se il difensore ha subito 0 danni complessivi)
    if (!defCard && damage === 0 && defender.olafTauntActive) {
      defender.olafTauntActive = false;
      this.gainPc(defender, 2);
      appliedCombatEffects.push(`Olaf: Provocazione subita a 0 danni (+2 PC)`);
    } else if (defender.olafTauntActive && defCard) {
      defender.olafTauntActive = false;
    }

    if (atkEff === "mag_archmage") {
      attacker.pc = 5;
      this.drawCards(attacker, 1);
      appliedCombatEffects.push(`${atkCard.name}: riporta i PC a 5 e pesca 1 carta`);
    }
    if (defEff === "mag_archmage") {
      defender.pc = 5;
      this.drawCards(defender, 1);
      appliedCombatEffects.push(`${defCard.name}: riporta i PC a 5 e pesca 1 carta`);
    }

    this.drawCards(attacker, 1);
    if (defCard) this.drawCards(defender, 1);

    // FIX CRITICO VITTORIA: Se lo scontro ha fatto vincere un giocatore (per Obiettivo o Sopravvivenza), NON aprire il modal dello scontro e ferma il gioco!
    if (GameState.gameOver) {
      UI.renderTable();
      Multiplayer.broadcastFullStateFromHost();
      return;
    }

    if (!attacker.hasAttackedPlayer) attacker.hasAttackedPlayer = {};
    attacker.hasAttackedPlayer[defenderIdx] = true;
    attacker.playedThisRound = true;
    defender.attacksTakenThisRound++;
    GameState.lastAttackerIndex = attackerIdx;

    atkCard.computedAtk = atkVal;
    if (defCard) defCard.computedDif = difVal;
    UI.renderTable();

    const atkWins = damage > 0;
    const effectsHTML = appliedCombatEffects.length > 0
      ? appliedCombatEffects.map((ef) => `<span class="px-2 py-0.5 rounded-lg bg-black/50 border border-white/15 text-[10px] font-bold text-amber-200">✨ ${ef}</span>`).join("")
      : `<span class="text-[10px] text-white/50">Nessun effetto secondario attivato nello scontro</span>`;

    const clashHTML = `
      <div class="text-sm font-black uppercase tracking-wider ${atkWins ? "text-rose-400" : "text-sky-400"}">
        ${atkWins ? `💥 Danni Inflitti: ${damage} PV a ${defender.name}` : `🛡️ Difesa Vincente: 0 Danni Subiti`}
      </div>
      <div class="flex items-center justify-center gap-2">
        ${UI.buildCustomCardHTML(atkCard, `clash-card-compact ${atkWins ? "clash-winner" : "clash-loser"}`)}
        <div class="text-xs font-black text-white/50">VS</div>
        ${defCard ? UI.buildCustomCardHTML(defCard, `clash-card-compact ${!atkWins ? "clash-winner" : "clash-loser"}`) : `<div class="w-[150px] h-[120px] rounded-2xl border border-dashed border-white/20 flex items-center justify-center text-xs text-white/40">Nessuna Difesa</div>`}
      </div>
      <div class="flex flex-wrap items-center justify-center gap-1 max-w-xl">
        ${effectsHTML}
      </div>
    `;

    GameState.sharedModalState = {
      id: "clash_" + Date.now(),
      type: "CLASH_CONFIRM",
      html: clashHTML
    };
    GameState.lastRenderedModalId = GameState.sharedModalState.id;

    GameState.clashConfirmVotes = [];

    UI.showClashConfirmModal(clashHTML, () => {
      if (GameState.gameOver) return;
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

    Multiplayer.broadcastFullStateFromHost();
  },

  registerClashConfirmation(slotIdx, localCallback = null) {
    if (!GameState.clashConfirmVotes.includes(slotIdx)) GameState.clashConfirmVotes.push(slotIdx);
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const btn = document.getElementById("btn-confirm-clash");
    if (btn) btn.textContent = `Conferma (${GameState.clashConfirmVotes.length}/${totalHumans}) ➔`;

    if (GameState.clashConfirmVotes.length >= totalHumans) {
      UI.closeModal(true);
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

    if (this.getEffectiveLeader(player).id === "ldr_ragnar") {
      const isAwk = this.isLeaderAwakenedForSkill(player);
      this.gainPc(player, isAwk ? 3 : 2);
      this.healPlayer(player, isAwk ? 2 : 1);
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

  registerRoundEndConfirmation(slotIdx, localCallback = null) {
    if (!GameState.roundEndVotes.includes(slotIdx)) GameState.roundEndVotes.push(slotIdx);
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const btn = document.getElementById("btn-confirm-round-end");
    if (btn) btn.textContent = `Vai al Nuovo Round (${GameState.roundEndVotes.length}/${totalHumans}) ➔`;

    if (GameState.roundEndVotes.length >= totalHumans) {
      UI.closeModal(true);
      if (localCallback) localCallback();
      else this.proceedToNewRoundScreen();
    } else {
      Multiplayer.broadcastFullStateFromHost();
    }
  },

  registerNewRoundConfirmation(slotIdx, localCallback = null) {
    if (!GameState.newRoundVotes.includes(slotIdx)) GameState.newRoundVotes.push(slotIdx);
    const totalHumans = Multiplayer.getHumanSlotsCount();
    const btn = document.getElementById("btn-confirm-round");
    if (btn) btn.textContent = `Inizia Round ${GameState.round} (${GameState.newRoundVotes.length}/${totalHumans}) ➔`;

    if (GameState.newRoundVotes.length >= totalHumans) {
      GameState.sharedModalState = null;
      GameState.lastRenderedModalId = null;
      UI.closeModal(true);
      const firstIdx = GameState.activePlayerIndex;
      UI.setPersistentStatus(`È il turno di <b>${GameState.players[firstIdx].name}</b>`);
      UI.renderTable();
      Multiplayer.broadcastFullStateFromHost();

      // IMPORTANTE: Solo l'Host (o chi gioca in locale) guida l'AI!
      if (GameState.players[firstIdx]?.isAI && (Multiplayer.networkMode === "LOCAL" || Multiplayer.isOnlineHost)) {
        setTimeout(() => this.runAITurn(firstIdx), 900);
      }
    } else {
      Multiplayer.broadcastFullStateFromHost();
    }
  },

  advanceTurn(attackedPlayerIdx) {
    if (GameState.gameOver) return;
    // Se sono un Client online, attendo lo stato dall'Host senza calcolare turni autonomamente
    if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) return;

    const prevPlayer = GameState.players[GameState.activePlayerIndex];
    if (prevPlayer && !prevPlayer.eliminated && prevPlayer.pendingEndTurnDamage > 0) {
      const dmg = prevPlayer.pendingEndTurnDamage;
      prevPlayer.pendingEndTurnDamage = 0;
      this.applyDirectDamage(prevPlayer, dmg, prevPlayer);
      if (GameState.gameOver) return;
    }

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

  // STEP 1 FINE ROUND: Calcola e mostra prima il "Riepilogo Fine Round X" (Bilancio del round appena concluso)
  startNewGlobalRound() {
    if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) return;

    const aliveList = this.getAlivePlayers();
    aliveList.forEach((p) => {
      if (p.objective.id === "obj_mag_1" && p.hand.length >= 8 && p.hp >= 12) {
        this.triggerVictory(p, "Obiettivo Onniscienza Arcana completato!");
      }
      if (p.objective.id === "obj_vik_3" && p.pc >= 7 && p.hand.length >= 5 && p.wonAnyClash) {
        this.triggerVictory(p, "Obiettivo Bottino del Valhalla completato!");
      }
      if (p.objective.id === "obj_mag_3" && GameState.round >= 3) {
        const others = aliveList.filter((o) => o.index !== p.index);
        if (others.length > 0 && (others.every((o) => o.pc <= 1) || others.every((o) => p.pc >= o.pc + 5))) {
          this.triggerVictory(p, "Obiettivo Siccità di Mana completato!");
        }
      }
      if (p.objective.id === "obj_mut_2" && GameState.round >= 4) {
        const hasTwin = aliveList.some(
          (o) => o.index !== p.index && ((o.hp === p.hp && Math.abs(o.pc - p.pc) <= 1) || (o.pc === p.pc && Math.abs(o.hp - p.hp) <= 1))
        );
        if (hasTwin) {
          this.triggerVictory(p, "Obiettivo Simbiosi Totale completato!");
        }
      }
    });

    if (GameState.gameOver) return;

    const endedRound = GameState.round;
    const fmtDelta = (val, unit, posCol, negCol) => {
      if (val > 0) return `<span class="${posCol} font-black">+${val} ${unit}</span>`;
      if (val < 0) return `<span class="${negCol} font-black">${val} ${unit}</span>`;
      return `<span class="text-white/40">0 ${unit}</span>`;
    };

    const balanceLines = GameState.players.map((p) => {
      if (p.eliminated) return `<span>💀 <b>${p.name}</b></span><span class="text-rose-400 font-bold">Eliminato</span>`;
      const snap = GameState.roundStartSnapshot?.[p.index] || { hp: p.hp, pc: p.pc, hand: p.hand.length };
      const dHp = p.hp - snap.hp;
      const dPc = p.pc - snap.pc;
      const dCards = p.hand.length - snap.hand;
      return `
        <span class="font-black text-white truncate w-24">${p.name}</span>
        <span class="flex items-center gap-3 text-[11px]">
          <span>♥ ${p.hp} (${fmtDelta(dHp, "PV", "text-emerald-300", "text-rose-300")})</span>
          <span>⚡ ${p.pc} (${fmtDelta(dPc, "PC", "text-cyan-300", "text-amber-300")})</span>
          <span>🃏 ${p.hand.length} (${fmtDelta(dCards, "Carte", "text-purple-300", "text-orange-300")})</span>
        </span>
      `;
    });

    GameState.roundEndVotes = [];

    GameState.sharedModalState = {
      id: "round_end_" + Date.now(),
      type: "ROUND_END_SUMMARY",
      endedRoundNumber: endedRound,
      lines: balanceLines
    };
    GameState.lastRenderedModalId = GameState.sharedModalState.id;
    Multiplayer.broadcastFullStateFromHost();

    UI.showRoundEndSummaryModal(endedRound, balanceLines, () => {
      this.proceedToNewRoundScreen();
    });
  },

  // STEP 2 FINE ROUND: Applica la rigenerazione e mostra la schermata "Nuovo Round Y" (PC e Carte guadagnate)
  proceedToNewRoundScreen() {
    if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) return;

    GameState.round++;
    GameState.baseOrder.push(GameState.baseOrder.shift());
    GameState.lastAttackerIndex = null;

    const pcRegen =
      GameState.options.arenasEnabled && GameState.currentArena?.modifier?.roundPcRegen
        ? GameState.currentArena.modifier.roundPcRegen
        : 3;

    const regenLines = [];

    GameState.players.forEach((p) => {
      if (p.eliminated) {
        regenLines.push(`<span>💀 <b>${p.name}</b></span><span class="text-white/40">Eliminato</span>`);
        return;
      }
      
      p.playedThisRound = false;
      p.attacksTakenThisRound = 0;
      p.usedLeaderThisRound = false;
      p.wonClashThisRound = false;
      p.olafTauntActive = false;

      const beforePc = p.pc;
      this.gainPc(p, pcRegen);
      const gainedPc = p.pc - beforePc;
      const drawnCount = this.drawCards(p, 1, true);

      regenLines.push(`
        <span class="font-black text-white truncate w-24">${p.name}</span>
        <span class="flex items-center gap-3 text-[11px]">
          <span class="text-cyan-300 font-bold">+${gainedPc} PC <span class="text-white/60">(Tot: ${p.pc})</span></span>
          <span class="text-purple-300 font-bold">+${drawnCount} Carta <span class="text-white/60">(Mano: ${p.hand.length})</span></span>
        </span>
      `);
    });

    GameState.roundSummaryLines = regenLines;
    const firstIdx = GameState.baseOrder.find((idx) => !GameState.players[idx].eliminated);
    GameState.activePlayerIndex = firstIdx;
    this.assignNyxCopyForRound();
    this.takeRoundStartSnapshot();
    UI.renderTable();

    GameState.newRoundVotes = [];

    GameState.sharedModalState = {
      id: "round_new_" + Date.now(),
      type: "NEW_ROUND",
      roundNumber: GameState.round,
      firstPlayerName: GameState.players[firstIdx].name,
      lines: regenLines
    };
    GameState.lastRenderedModalId = GameState.sharedModalState.id;
    Multiplayer.broadcastFullStateFromHost();

    UI.showNewRoundModal(GameState.round, GameState.players[firstIdx].name, regenLines);
  },

  // Eseguito SOLO dall'Host in partite online, che trasmette in diretta ogni passo dell'AI agli ospiti!
  runAITurn(aiIdx) {
    if (GameState.gameOver) return;
    if (Multiplayer.networkMode === "ONLINE" && !Multiplayer.isOnlineHost) return;

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
    if (GameState.gameOver) return;
    GameState.gameOver = true;
    GameState.waitingForDefenseFromIdx = null;
    GameState.waitingForDefenseFromP1 = false;
    GameState.pendingTargetSelection = null;
    GameState.pendingDiscardSelection = null;
    if (GameState.readingTimerInterval) {
      clearInterval(GameState.readingTimerInterval);
      GameState.readingTimerInterval = null;
    }

    const badge = "🏆 PARTITA CONCLUSA!";
    const title = `${winner.name} ha vinto!`;
    const body = `${reason}\n\nFazione: ${DB.factions[winner.faction].name} • Leader: ${winner.leader.name}`;

    GameState.sharedModalState = {
      id: "victory_" + Date.now(),
      type: "VICTORY",
      badge,
      title,
      body
    };
    GameState.lastRenderedModalId = GameState.sharedModalState.id;

    UI.setPersistentStatus(`🏆 <b>${winner.name}</b> ha vinto la partita! (${reason})`);
    UI.renderTable();
    UI.showModal(badge, title, body);
    Multiplayer.broadcastFullStateFromHost();
  }
};

window.addEventListener("DOMContentLoaded", () => UI.init());