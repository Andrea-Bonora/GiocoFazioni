/* ============================================================================
   FAZIONI — MOTORE DI GIOCO (PATCH 1.4) & CONTROLLER INTERFACCIA iOS
   ============================================================================ */

const GameState = {
  roomCode: "SOLO",
  playerName: "Giocatore 1",
  options: {
    arenasEnabled: true,
    awakeningEnabled: true
  },
  round: 1,
  baseOrder: [0, 1, 2, 3],
  activePlayerIndex: 0,
  lastAttackerIndex: null,
  currentArena: null,
  selectedFaction: null,
  drawnObjective: null,
  selectedLeader: null,
  selectedCardUid: null,
  // --- NUOVE VARIABILI PER SLOT ATK/DIF E DIFESA ATTIVA ---
  currentAttackingPlayerIdx: null,
  currentDefendingPlayerIdx: null,
  slotAtkCard: null,
  slotDifCard: null,
  waitingForDefenseFromP1: false,
  // --------------------------------------------------------
  pendingTargetSelection: null, // { validTargets: [], onSelect: fn, label: "" }
  inspectedHandIndex: null,     // Indice della carta in mano aperta per lo swipe
  lobbyPlayers: [],             // Giocatori connessi nella stanza
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

  createOrJoinRoom() {
    const name = this.validateUsername();
    if (!name) return;

    const codeInput = document.getElementById("room-code-input")?.value.trim().toUpperCase();
    if (!codeInput) {
      this.showToastPopup("⚠️ Inserisci un Codice Stanza (es. NORD)!", 1800);
      return;
    }
    GameState.roomCode = codeInput;

    const lobbyBox = document.getElementById("lobby-box");
    lobbyBox.classList.remove("hidden");
    lobbyBox.classList.add("flex");
    document.getElementById("lobby-room-label").textContent = codeInput;

    Multiplayer.joinRoom(codeInput, { name, id: Date.now() + "_" + Math.random().toString(36).slice(2, 6) });
  },

  updateLobbyList(playersList) {
    GameState.lobbyPlayers = playersList;
    const listEl = document.getElementById("lobby-players-list");
    const countEl = document.getElementById("lobby-count-label");
    if (!listEl || !countEl) return;
    countEl.textContent = `${playersList.length}/4 Giocatori`;
    listEl.innerHTML = playersList
      .map((p, i) => `<div class="flex items-center justify-between">
        <span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-emerald-400"></span>${i + 1}. ${p.name}</span>
        ${p.isHost ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-300 font-bold">HOST</span>` : ""}
      </div>`)
      .join("");
  },

  // Gestisce lo stato del bottone "Scegli Fazione e Inizia" (cliccabile solo dall'Host se online)
  updateStartButtonState() {
    const btn = document.getElementById("btn-main-start");
    const txt = document.getElementById("btn-main-start-text");
    if (!btn || !txt) return;

    if (Multiplayer.isOnlineRoom && !Multiplayer.isHost) {
      btn.disabled = true;
      btn.classList.add("opacity-40", "pointer-events-none");
      txt.textContent = "In attesa che l'Host avvii la partita...";
    } else {
      btn.disabled = false;
      btn.classList.remove("opacity-40", "pointer-events-none");
      txt.textContent = "Scegli Fazione e Inizia";
    }
  },

  handleStartButtonClick() {
    const name = this.validateUsername();
    if (!name) return;

    if (Multiplayer.isOnlineRoom && !Multiplayer.isHost) return;
    if (Multiplayer.isOnlineRoom && Multiplayer.isHost) {
      GameState.options.arenasEnabled = document.getElementById("toggle-arenas").checked;
      GameState.options.awakeningEnabled = document.getElementById("toggle-awakening").checked;
      Multiplayer.hostTriggerSetup();
    }
    this.goToSetup(false);
  },

  goToSetup(fromRemoteHost = false) {
    if (!fromRemoteHost) {
      const name = this.validateUsername();
      if (!name) return;
      GameState.options.arenasEnabled = document.getElementById("toggle-arenas").checked;
      GameState.options.awakeningEnabled = document.getElementById("toggle-awakening").checked;
    }

    document.getElementById("btn-setup-back").classList.remove("hidden");
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

  // Colora ogni Fazione nella schermata di selezione con il suo colore specifico!
  renderFactionSelection() {
    const grid = document.getElementById("faction-grid");
    grid.innerHTML = "";
    Object.values(DB.factions).forEach((fac) => {
      const btn = document.createElement("button");
      btn.className = `liquid-glass ${fac.cardClass} p-4 text-left flex flex-col gap-1.5 transition active:scale-95 hover:brightness-110`;
      btn.onclick = () => this.selectFaction(fac.id);
      btn.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-base font-black tracking-wide text-white drop-shadow">${fac.name}</span>
          <i data-lucide="${fac.icon}" class="w-5 h-5 text-white"></i>
        </div>
        <span class="text-[11px] text-white/85 leading-tight">${fac.tagline}</span>
      `;
      grid.appendChild(btn);
    });
    lucide.createIcons();
  },

  backToMenu() {
    document.getElementById("screen-setup").classList.add("hidden");
    document.getElementById("screen-setup").classList.remove("flex");
    document.getElementById("screen-menu").classList.remove("hidden");
  },

  selectFaction(factionId) {
    GameState.selectedFaction = factionId;
    GameState.selectedLeader = null;
    const fac = DB.factions[factionId];

    // 1. Nasconde le altre fazioni e il pulsante indietro (scelta irreversibile!)
    document.getElementById("faction-grid").classList.add("hidden");
    document.getElementById("btn-setup-back").classList.add("hidden");
    document.getElementById("setup-header-title").textContent = `Fazione: ${fac.name}`;

    // 2. Avvia l'animazione di estrazione dell'Obiettivo Segreto
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
    document.getElementById("screen-setup").classList.add("hidden");
    document.getElementById("screen-setup").classList.remove("flex");
    const table = document.getElementById("screen-table");
    table.classList.remove("hidden");
    table.classList.add("flex");

    Engine.setupMatch();
  },

  // Nuovo Layout Dettaglio Carta (Sinistra: Nome + Artwork | Destra: Costo, ATK+Spada, DIF+Scudo, Effetto)
  buildCustomCardHTML(card, extraClass = "") {
    if (!card) return "";
    const isCreature = card.type === "creature";
    const factionClass = DB.factions[card.faction]?.cardClass || "";
    const artSvg = card.svgArt.replace("h-16", "h-32");

    return `
      <div class="liquid-glass ${factionClass} ${extraClass} p-3.5 rounded-2xl w-full max-w-[360px] grid grid-cols-12 gap-3 text-left items-center">
        <!-- Colonna Sinistra (5 col): Nome Carta sopra e Artwork sotto -->
        <div class="col-span-5 flex flex-col gap-1.5">
          <div class="text-xs font-black text-white uppercase tracking-wide leading-tight text-center bg-black/40 py-1 px-1.5 rounded-lg border border-white/15">
            ${card.name}
          </div>
          <div class="w-full h-32 rounded-xl overflow-hidden border border-white/20 shadow-inner">
            ${artSvg}
          </div>
        </div>

        <!-- Colonna Destra (7 col): Costo, Attacco + Spada, Difesa + Scudo, sotto Effetto -->
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

  // Popup automatico ("Tocca a..." / "Nuovo round...")
  showToastPopup(text, duration = 1500) {
    const pop = document.getElementById("turn-popup");
    const txt = document.getElementById("turn-popup-text");
    if (!pop || !txt) return;
    txt.textContent = text;
    pop.classList.remove("hidden");
    setTimeout(() => pop.classList.add("hidden"), duration);
  },

  setBanner(msg) {
    // Mantenuto per retrocompatibilità: mostra un toast rapido
    this.showToastPopup(msg.replace(/<[^>]*>?/gm, ''), 1600);
  },

  renderMiniSlot(slotId, card, placeholder) {
    const el = document.getElementById(slotId);
    if (!card) {
      el.innerHTML = `<span>${placeholder}</span>`;
      return;
    }
    el.innerHTML = `
      <div class="relative w-full h-full rounded-xl overflow-hidden">
        <div class="absolute inset-0">${card.svgArt.replace("h-16", "h-full")}</div>
        <div class="absolute bottom-0 inset-x-0 bg-black/80 px-1.5 py-0.5 flex justify-between text-[10px] font-black">
          <span class="text-rose-300">⚔️${card.computedAtk ?? card.atk}</span>
          <span class="text-sky-300">🛡️${card.computedDif ?? card.dif}</span>
        </div>
      </div>
    `;
  },

  renderTable() {
    const p1 = GameState.players[0];
    const attackOverlay = document.getElementById("under-attack-overlay");
    if (attackOverlay) attackOverlay.classList.toggle("hidden", !GameState.waitingForDefenseFromP1);

    // 1. Colonna Sinistra: I 3 Avversari con ID per Floating Numbers, Badge Buff e Selezione Bersaglio
    const oppCol = document.getElementById("opponents-col");
    oppCol.innerHTML = "";
    GameState.players.slice(1).forEach((opp) => {
      const isTurn = GameState.activePlayerIndex === opp.index && GameState.currentDefendingPlayerIdx === null;
      const isBeingAttacked = GameState.currentDefendingPlayerIdx === opp.index;
      const isImmune = opp.attacksTakenThisRound >= Engine.getMaxAttacksPerRound();
      const isSelectableTarget = GameState.pendingTargetSelection?.validTargets.includes(opp.index);

      let borderClass = "";
      if (isSelectableTarget) borderClass = "target-selectable-glow";
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
        } else if (GameState.activePlayerIndex === 0 && GameState.slotAtkCard && GameState.currentDefendingPlayerIdx === null) {
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

    // 2. Zona Centrale Superiore: Slot ATK e DIF
    const atkName = GameState.currentAttackingPlayerIdx !== null ? GameState.players[GameState.currentAttackingPlayerIdx].name : "";
    const difName = GameState.currentDefendingPlayerIdx !== null ? GameState.players[GameState.currentDefendingPlayerIdx].name : "";
    document.getElementById("atk-player-label").textContent = atkName ? `⚔️ ${atkName}` : "";
    document.getElementById("dif-player-label").textContent = difName ? `🛡️ ${difName}` : "";

    this.renderMiniSlot("slot-attacker", GameState.slotAtkCard, "Zona ATK");
    this.renderMiniSlot("slot-defender", GameState.slotDifCard, "Zona DIF");

    // 3. Pulsante Centrale: "Passa" / "Subisci" / "Annulla Bersaglio"
    const passBtn = document.getElementById("btn-pass-turn");
    if (GameState.waitingForDefenseFromP1) {
      passBtn.textContent = "Subisci (No Difesa)";
      passBtn.disabled = false;
      passBtn.classList.remove("opacity-40");
    } else {
      passBtn.textContent = "Passa";
      const canPass = GameState.activePlayerIndex === 0 && GameState.currentDefendingPlayerIdx === null && !GameState.pendingTargetSelection;
      passBtn.disabled = !canPass;
      passBtn.classList.toggle("opacity-40", !canPass);
    }

    // 4. Colonna Destra: HP, PC, Badge Buff P1, Contatore Mano (X/Max), Obiettivo, Arena, Leader
    document.getElementById("p1-hp").textContent = p1.hp;
    document.getElementById("p1-pc").textContent = p1.pc;
    document.getElementById("p1-buff-row").innerHTML = this.buildBuffBadgesHTML(p1);
    document.getElementById("p1-hand-counter").textContent = `${p1.hand.length}/${Engine.getPlayerHandLimit(p1)}`;
    document.getElementById("arena-badge").classList.toggle("hidden", !GameState.options.arenasEnabled);
    document.getElementById("p1-leader-name").textContent = p1.leader.name;
    document.getElementById("my-leader-art").innerHTML = DB.generateUniqueCardArt(p1.leader.name, p1.faction, "creature").replace("h-16", "h-full");

    // 5. Mano del Giocatore (con supporto Touch Drag & Drop + Tap per Ispezione con Swipe)
    const handContainer = document.getElementById("player-hand");
    handContainer.innerHTML = "";
    p1.hand.forEach((card, handIdx) => {
      const effectiveCost = Engine.getEffectiveCardCost(p1, card);
      const mini = document.createElement("div");
      mini.className = `hand-card-mini ${DB.factions[card.faction].cardClass}`;
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

  // Ispezione Carta con SWIPE ORIZZONTALE (e frecce) per scorrere la mano senza chiudere il modal
  inspectCard(card, fromHand = false, handIdx = null) {
    if (!card) return;
    const p1 = GameState.players[0];
    if (fromHand) {
      GameState.inspectedHandIndex = handIdx !== null ? handIdx : p1.hand.findIndex((c) => c.uid === card.uid);
    } else {
      GameState.inspectedHandIndex = null;
    }

    const view = document.getElementById("modal-custom-view");
    const actions = document.getElementById("modal-actions");

    const navHint = fromHand && p1.hand.length > 1
      ? `<div class="flex items-center justify-between w-full max-w-[360px] text-[10px] text-white/60 px-2 mb-1">
           <button onclick="UI.navigateInspectedHand(-1)" class="liquid-pill px-2.5 py-1 rounded-lg font-bold">◀ Prec</button>
           <span>Scorri col dito (${GameState.inspectedHandIndex + 1}/${p1.hand.length})</span>
           <button onclick="UI.navigateInspectedHand(1)" class="liquid-pill px-2.5 py-1 rounded-lg font-bold">Succ ▶</button>
         </div>`
      : "";

    view.innerHTML = `<div class="flex flex-col items-center w-full">${navHint}${this.buildCustomCardHTML(card)}</div>`;

    // Listener Swipe Orizzontale con il dito sul modale
    let touchStartX = 0;
    view.ontouchstart = (e) => { touchStartX = e.changedTouches[0].screenX; };
    view.ontouchend = (e) => {
      if (!fromHand || p1.hand.length <= 1) return;
      const diff = e.changedTouches[0].screenX - touchStartX;
      if (Math.abs(diff) > 40) {
        this.navigateInspectedHand(diff < 0 ? 1 : -1);
      }
    };

    let extraBtn = "";
    if (fromHand && GameState.activePlayerIndex === 0 && !GameState.waitingForDefenseFromP1 && card.type === "action") {
      extraBtn = `<button onclick="UI.closeModal(); Engine.initiateActionPlay(0, '${card.uid}')" class="liquid-btn-primary px-6 py-2 rounded-xl text-xs font-bold">Usa Azione</button>`;
    } else if (fromHand && GameState.activePlayerIndex === 0 && !GameState.waitingForDefenseFromP1 && card.type === "creature" && !GameState.slotAtkCard) {
      extraBtn = `<button onclick="UI.closeModal(); Engine.placeCardInAtkSlot('${card.uid}')" class="liquid-btn-gold px-6 py-2 rounded-xl text-xs font-bold">Metti in Zona ATK</button>`;
    } else if (fromHand && GameState.waitingForDefenseFromP1 && card.type === "creature") {
      extraBtn = `<button onclick="UI.closeModal(); Engine.placeCardInDifSlot('${card.uid}')" class="liquid-btn-primary px-6 py-2 rounded-xl text-xs font-bold">Difendi in Zona DIF</button>`;
    }
    actions.innerHTML = `${extraBtn}<button onclick="UI.closeModal()" class="liquid-pill px-6 py-2 rounded-xl text-xs font-bold">Chiudi</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();
  },

  navigateInspectedHand(direction) {
    const p1 = GameState.players[0];
    if (GameState.inspectedHandIndex === null || p1.hand.length === 0) return;
    const nextIdx = (GameState.inspectedHandIndex + direction + p1.hand.length) % p1.hand.length;
    this.inspectCard(p1.hand[nextIdx], true, nextIdx);
  },

  // Dettaglio Giocatore/Leader con lista Immunità e Boost Attivi
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

  // Tracker Dinamico dei Progressi dell'Obiettivo Segreto
  toggleObjectiveModal() {
    const p1 = GameState.players[0];
    const progressText = Engine.getObjectiveProgressText(p1);
    const factionClass = DB.factions[p1.faction].cardClass;
    const view = document.getElementById("modal-custom-view");
    view.innerHTML = `
      <div class="liquid-glass ${factionClass} p-5 rounded-2xl max-w-md w-full flex flex-col items-center gap-2">
        <div class="text-[10px] font-bold uppercase tracking-widest text-amber-300">Il Tuo Obiettivo Segreto</div>
        <h3 class="text-xl font-black text-white">${p1.objective.name}</h3>
        <p class="text-xs text-white/90 leading-relaxed">${p1.objective.desc}</p>
        <div class="mt-2 px-4 py-1.5 rounded-xl bg-black/45 border border-amber-400/50 text-xs font-black text-amber-300">
          ${progressText}
        </div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `<button onclick="UI.closeModal()" class="liquid-pill px-8 py-2 rounded-xl text-xs font-bold">Chiudi</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
  },

  inspectSlot(type) {
    const card = type === "atk" ? GameState.slotAtkCard : GameState.slotDifCard;
    if (card) this.inspectCard(card, false);
  },

  // Modale simbolico di Nuovo Round con richiesta di Conferma per tutti
  showNewRoundModal(roundNumber, firstPlayerName, onConfirmCallback) {
    const view = document.getElementById("modal-custom-view");
    view.innerHTML = `
      <div class="flex flex-col items-center gap-3 py-3">
        <div class="w-20 h-20 rounded-full liquid-pill border-2 border-amber-400 flex items-center justify-center text-amber-300 shadow-2xl round-emblem-anim">
          <i data-lucide="swords" class="w-10 h-10"></i>
        </div>
        <div class="text-xs font-bold uppercase tracking-widest text-cyan-300">Fine del Round Precedente</div>
        <h3 class="text-2xl font-black tracking-wide text-white">NUOVO ROUND ${roundNumber}</h3>
        <p class="text-sm text-amber-200 font-bold">Primo ad iniziare: ${firstPlayerName}</p>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `
      <button id="btn-confirm-round" class="liquid-btn-gold px-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider">
        Conferma
      </button>
    `;
    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();

    document.getElementById("btn-confirm-round").onclick = () => {
      this.closeModal();
      if (onConfirmCallback) onConfirmCallback();
    };
  },

  inspectMyLeader() {
    const p1 = GameState.players[0];
    this.inspectPlayer(p1);
    if (p1.leader.skillType === "active" && GameState.activePlayerIndex === 0 && !p1.usedLeaderThisRound) {
      document.getElementById("modal-actions").innerHTML = `
        <button onclick="UI.closeModal(); Engine.activateLeaderSkill(0)" class="liquid-btn-gold px-6 py-2 rounded-xl text-xs font-bold">Attiva Potere Leader</button>
        <button onclick="UI.closeModal()" class="liquid-pill px-6 py-2 rounded-xl text-xs font-bold">Chiudi</button>
      `;
    }
  },

  toggleArenaModal() {
    if (!GameState.currentArena) return;
    const art = DB.generateUniqueCardArt(GameState.currentArena.name, "maghi", "action").replace("h-16", "h-28");
    const view = document.getElementById("modal-custom-view");
    view.innerHTML = `
      <div class="flex flex-col items-center gap-2 max-w-sm">
        <div class="text-xs font-bold uppercase tracking-widest text-cyan-300">Campo di Battaglia Attivo</div>
        <div class="text-lg font-black">${GameState.currentArena.name}</div>
        <div class="w-48 rounded-xl overflow-hidden">${art}</div>
        <div class="text-xs text-white/85 mt-1">${GameState.currentArena.desc}</div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `<button onclick="UI.closeModal()" class="liquid-pill px-8 py-2 rounded-xl text-xs font-bold">Chiudi</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
  },

  showActionConfirmModal(player, card, onConfirmCallback, targetName = null) {
    const view = document.getElementById("modal-custom-view");
    const targetBadge = targetName ? `<div class="px-3 py-1 rounded-full bg-rose-500/30 border border-rose-400 text-xs font-black text-rose-200">🎯 Bersaglio: ${targetName}</div>` : "";
    view.innerHTML = `
      <div class="flex flex-col items-center gap-2">
        <div class="text-xs font-bold uppercase tracking-widest text-amber-300">${player.name} gioca una Carta Azione</div>
        ${targetBadge}
        ${this.buildCustomCardHTML(card)}
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `<button id="btn-confirm-action" class="liquid-btn-primary px-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider">Conferma</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
    lucide.createIcons();
    document.getElementById("btn-confirm-action").onclick = () => {
      this.closeModal();
      if (onConfirmCallback) onConfirmCallback();
    };
  },

  showClashSummaryModal(attacker, defender, atkCard, defCard, damage, onConfirmCallback) {
    const atkWins = damage > 0;
    const view = document.getElementById("modal-custom-view");
    view.innerHTML = `
      <div class="flex flex-col items-center gap-3 w-full">
        <div class="text-sm font-black uppercase tracking-wider ${atkWins ? "text-rose-400" : "text-sky-400"}">
          ${atkWins ? `💥 ${attacker.name} vince lo scontro! (${damage} Danni a ${defender.name})` : `🛡️ ${defender.name} para il colpo! (0 Danni)`}
        </div>
        <div class="flex items-center justify-center gap-4">
          <div class="flex flex-col items-center gap-1">
            <span class="text-[10px] font-bold text-rose-300">⚔️ ${attacker.name}</span>
            ${this.buildCustomCardHTML(atkCard, atkWins ? "clash-winner" : "clash-loser")}
          </div>
          <div class="text-lg font-black text-white/50">VS</div>
          <div class="flex flex-col items-center gap-1">
            <span class="text-[10px] font-bold text-sky-300">🛡️ ${defender.name}</span>
            ${defCard ? this.buildCustomCardHTML(defCard, !atkWins ? "clash-winner" : "clash-loser") : `<div class="w-[250px] h-[226px] rounded-2xl border border-dashed border-white/20 flex items-center justify-center text-xs text-white/40">Nessuna Difesa</div>`}
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-actions").innerHTML = `<button id="btn-confirm-clash" class="liquid-btn-gold px-10 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider">Conferma</button>`;
    document.getElementById("glass-modal").classList.remove("hidden");
    document.getElementById("btn-confirm-clash").onclick = () => {
      this.closeModal();
      if (onConfirmCallback) onConfirmCallback();
    };
    lucide.createIcons();
  },

  passTurn() {
    if (GameState.waitingForDefenseFromP1) {
      // Se P1 clicca "Subisci (No Difesa)" mentre viene attaccato
      GameState.waitingForDefenseFromP1 = false;
      Engine.finishCombatResolution(GameState.currentAttackingPlayerIdx, 0, GameState.slotAtkCard, null);
      return;
    }
    if (GameState.activePlayerIndex === 0) {
      Engine.executePassTurn(0);
    }
  },

  showModal(badge, title, body) {
    const view = document.getElementById("modal-custom-view");
    view.innerHTML = `
      <div class="flex flex-col items-center gap-2 max-w-sm">
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

  // Mostra i numeri fluttuanti (-3 PV in rosso, +2 PC in azzurro) sopra il riquadro del giocatore
  spawnFloatingText(playerIdx, text, colorClass = "text-rose-400") {
    const container = playerIdx === 0
      ? document.getElementById("p1-resource-box")
      : document.getElementById(`opp-box-${playerIdx}`);
    if (!container) return;

    const floatEl = document.createElement("div");
    floatEl.className = `floating-number ${colorClass}`;
    floatEl.textContent = text;
    container.appendChild(floatEl);
    setTimeout(() => floatEl.remove(), 1350);
  },

  // Mostra l'animazione centrale temporanea ("Marco attacca Ragnar_99")
  bannerQueue: [],
  isShowingBanner: false,

  showCenterActionBanner(htmlText, duration = 1350, borderColorClass = "border-rose-400/80") {
    this.bannerQueue.push({ htmlText, duration, borderColorClass });
    if (!this.isShowingBanner) this.processNextBanner();
  },

  processNextBanner() {
    if (this.bannerQueue.length === 0) {
      this.isShowingBanner = false;
      return;
    }
    this.isShowingBanner = true;
    const item = this.bannerQueue.shift();
    const banner = document.getElementById("center-action-banner");
    const content = document.getElementById("center-action-content");
    if (!banner || !content) {
      this.isShowingBanner = false;
      return;
    }

    content.className = `liquid-glass px-7 py-3 rounded-3xl border-2 ${item.borderColorClass} text-sm font-black tracking-wide text-white shadow-2xl flex items-center gap-2.5 animate-pop`;
    content.innerHTML = item.htmlText;
    banner.classList.remove("hidden");

    setTimeout(() => {
      banner.classList.add("hidden");
      setTimeout(() => this.processNextBanner(), 150);
    }, item.duration);
  },

  // Genera i badge visivi dei buff temporanei attivi su un giocatore
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
  },

};

/* ============================================================================
   2. MOTORE DELLE REGOLE (PATCH 1.4 COMPLETA)
   ============================================================================ */
const Engine = {
  setupMatch() {
    const allFactions = ["goblin", "vichinghi", "maghi", "mutaformi"];
    const p1Faction = GameState.selectedFaction || "goblin";
    const remainingFactions = allFactions.filter((f) => f !== p1Faction);

    // Crea i 4 Giocatori (1 Umano + 3 Avversari/Dispositivi)
    GameState.players = [p1Faction, ...remainingFactions].map((facId, idx) => {
      const fac = DB.factions[facId];
      const leader = idx === 0 ? GameState.selectedLeader : fac.leaders[Math.floor(Math.random() * fac.leaders.length)];
      const objective = idx === 0 ? GameState.drawnObjective : fac.objectives[Math.floor(Math.random() * fac.objectives.length)];
      const deck = DB.buildDeckForFaction(facId);
      const hand = deck.splice(0, 5); // 5 carte iniziali
      const defaultNames = [GameState.playerName || "P1", " P2", "P3", "P4"];

      return {
        index: idx,
        name: defaultNames[idx],
        isAI: idx !== 0,
        faction: facId,
        leader: leader,
        objective: objective,
        objectiveProgress: 0,
        hp: 20,
        maxHp: 20, // Scende a 12 con la Cicatrice del Risveglio!
        pc: 5,
        deck: deck,
        hand: hand,
        awakened: false,
        eliminated: false,
        playedThisRound: false,
        attacksTakenThisRound: 0,
        usedLeaderThisRound: false,
        actionsPlayedThisTurn: 0,
        wonClashThisRound: false,
        lastDamagedBy: null, // Per l'Assist della Taglia di Eliminazione
        buffNextAttack: 0,
        buffNextDefense: 0,
        halfNextAttackDamage: false,
        shieldSlamActive: false,
        forbidAttackTarget: null
      };
    });

    // Attiva un Campo di Battaglia iniziale se il modulo è attivo
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

    UI.renderTable();
    UI.showToastPopup("Nuovo round: primo ad iniziare " + GameState.players[0].name, 1800);
  },

  getAlivePlayers() {
    return GameState.players.filter((p) => !p.eliminated);
  },

  isFinalDuel1v1() {
    return this.getAlivePlayers().length === 2;
  },

  getMaxAttacksPerRound() {
    return this.isFinalDuel1v1() ? 2 : 1; // Sale a 2 nel Duello Finale 1v1 (Patch 1.2)
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
      // Eldoria (Maghi)
      if (player.leader.id === "ldr_eldoria" && player.actionsPlayedThisTurn === 0) {
        cost -= player.awakened ? 2 : 1;
      }
      // Arena Santuario Etereo
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

  // Pescata con regola Soft Cap e danno da Esaurimento Mazzo (Patch 1.3)
  drawCards(player, count, isStartOfRoundDraw = false) {
    const handLimit = player.leader.id === "ldr_eldoria" ? (player.awakened ? 9 : 8) : 7;
    if (isStartOfRoundDraw && player.hand.length >= handLimit) return;

    for (let i = 0; i < count; i++) {
      if (player.deck.length === 0) {
        // Esaurimento del Mazzo: 1 danno diretto per carta non pescata
        this.applyDirectDamage(player, 1, null, true);
      } else {
        player.hand.push(player.deck.shift());
      }
    }
  },

  // Applica danno agli HP, verifica Risveglio + Cicatrice (12 HP) + Ultima Fiamma (+1 PC)
  applyDirectDamage(target, amount, sourcePlayer = null, isDeckOutDamage = false) {
    if (amount <= 0 || target.eliminated) return;

    // Grim Risvegliato riduce i danni di 1 (minimo 1)
    if (target.leader.id === "ldr_grim" && target.awakened && amount > 1) {
      amount -= 1;
    }

    target.hp = Math.max(0, target.hp - amount);
    UI.spawnFloatingText(target.index, `-${amount} PV`, "text-rose-400");
    UI.showCenterActionBanner(
      `💔 <span>${target.name}</span> <span class="text-rose-400">perde ${amount} PV</span> <span class="text-xs text-white/70">(${target.hp}/${target.maxHp} PV)</span>`,
      1150,
      "border-rose-500/80"
    );
    if (sourcePlayer && sourcePlayer.index !== target.index) {
      target.lastDamagedBy = sourcePlayer.index;
    }

    // Passiva di Grim (Goblin): +1 PC ogni volta che subisce danni
    if (target.leader.id === "ldr_grim" && target.hp > 0) {
      this.gainPc(target, 1);
    }

    // Check Risveglio (Patch 1.4: Soglia dinamica, Cicatrice 12 HP, Ultima Fiamma +1 PC)
    if (
      GameState.options.awakeningEnabled &&
      !target.awakened &&
      target.hp > 0 &&
      target.hp <= target.leader.threshold
    ) {
      target.awakened = true;
      target.maxHp = 12; // Cicatrice di Battaglia
      if (!isDeckOutDamage) {
        this.gainPc(target, 1); // Protezione Ultima Fiamma
      }
      UI.setBanner(`🔥 RISVEGLIO! ${target.name} attiva il potere supremo di ${target.leader.name} (Cicatrice Max 12 HP)!`);
    }

    // Check Eliminazione e Taglia (Kill +2 PC, Assist +3 HP)
    if (target.hp === 0 && !target.eliminated) {
      target.eliminated = true;
      const doubleBounty = GameState.options.arenasEnabled && GameState.currentArena?.modifier?.doubleBounty;
      if (sourcePlayer) {
        this.gainPc(sourcePlayer, doubleBounty ? 4 : 2);
        // Check Obiettivo Bancarotta del Sangue
        if (sourcePlayer.objective.id === "obj_gob_3" && sourcePlayer.pc === (doubleBounty ? 4 : 2)) {
          this.triggerVictory(sourcePlayer, "Obiettivo Bancarotta del Sangue completato!");
        }
      }
      if (target.lastDamagedBy !== null && target.lastDamagedBy !== sourcePlayer?.index) {
        const assistPlayer = GameState.players[target.lastDamagedBy];
        if (assistPlayer && !assistPlayer.eliminated) {
          this.healPlayer(assistPlayer, doubleBounty ? 6 : 3);
        }
      }
      this.checkSurvivalVictory();
    }
  },

  healPlayer(player, amount) {
    if (player.eliminated || amount <= 0) return;
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + amount);
    const healed = player.hp - before;
    if (healed > 0) {
      UI.spawnFloatingText(player.index, `+${healed} PV`, "text-emerald-400");
      UI.showCenterActionBanner(
        `💚 <span>${player.name}</span> <span class="text-emerald-400">recupera +${healed} PV</span> <span class="text-xs text-white/70">(${player.hp}/${player.maxHp} PV)</span>`,
        1150,
        "border-emerald-400/80"
      );
    }
  },

  gainPc(player, amount, showVideoLog = true) {
    if (amount === 0) return;
    const before = player.pc;
    player.pc = Math.min(this.getMaxPcCap(), Math.max(0, player.pc + amount));
    const diff = player.pc - before;
    if (diff !== 0) {
      UI.spawnFloatingText(player.index, `${diff > 0 ? "+" : ""}${diff} PC`, diff > 0 ? "text-cyan-300" : "text-amber-400");
      if (showVideoLog) {
        UI.showCenterActionBanner(
          `⚡ <span>${player.name}</span> <span class="${diff > 0 ? "text-cyan-300" : "text-amber-300"}">${diff > 0 ? `recupera +${diff} PC` : `spende/perde ${Math.abs(diff)} PC`}</span> <span class="text-xs text-white/70">(${player.pc} PC)</span>`,
          1050,
          diff > 0 ? "border-cyan-400/80" : "border-amber-400/80"
        );
      }
    }
  },

  shiftArena() {
    if (!GameState.options.arenasEnabled) return;
    const others = DB.arenas.filter((a) => a.id !== GameState.currentArena?.id);
    GameState.currentArena = others[Math.floor(Math.random() * others.length)];
    UI.setBanner(`🌋 [Spostamento]! Il Campo di Battaglia muta in: ${GameState.currentArena.name}!`);
  },

  // Click su una carta della mano di P1
  onCardClick(card) {
    if (GameState.activePlayerIndex !== 0 || GameState.gameOver) return;
    const p1 = GameState.players[0];
    const cost = this.getEffectiveCardCost(p1, card);

    if (p1.pc < cost) {
      UI.setBanner(`⚠️ Punti Costo insufficienti (${p1.pc}/${cost} PC) per giocare ${card.name}.`);
      return;
    }

    if (card.type === "action") {
      this.playActionCard(p1, card);
    } else {
      // Seleziona la creatura per attaccare
      GameState.selectedCardUid = GameState.selectedCardUid === card.uid ? null : card.uid;
      UI.setBanner(
        GameState.selectedCardUid
          ? `⚔️ Hai selezionato <b>${card.name}</b>. Tocca il pannello di un Avversario in alto per attaccarlo!`
          : `Selezione annullata.`
      );
      UI.renderTable();
    }
  },

  // Verifica se una Carta Azione richiede di scegliere un bersaglio avversario
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
    if (!pending || !pending.validTargets.includes(targetIdx)) {
      UI.showToastPopup("Seleziona uno dei giocatori evidenziati in azzurro!", 1400);
      return;
    }
    GameState.pendingTargetSelection = null;
    pending.onSelect(targetIdx);
  },

  initiateActionPlay(playerIdx, cardUid, onAfterConfirm = null) {
    const player = GameState.players[playerIdx];
    const card = player.hand.find((c) => c.uid === cardUid);
    if (!card) return;
    const cost = this.getEffectiveCardCost(player, card);
    if (player.pc < cost) {
      UI.showToastPopup("PC insufficienti per questa Carta Azione!", 1400);
      return;
    }

    const validTargets = this.getValidTargetsForAction(player, card.effectCode);
    if (playerIdx === 0 && validTargets && validTargets.length > 0) {
      GameState.pendingTargetSelection = {
        validTargets,
        onSelect: (chosenTargetIdx) => {
          this.executeActionCardEffect(player, card, chosenTargetIdx, onAfterConfirm);
        }
      };
      UI.renderTable();
      UI.showToastPopup(`Scegli a sinistra l'avversario bersaglio per ${card.name}!`, 1800);
    } else {
      const aiTargetIdx = validTargets && validTargets.length > 0
        ? validTargets[Math.floor(Math.random() * validTargets.length)]
        : null;
      this.executeActionCardEffect(player, card, aiTargetIdx, onAfterConfirm);
    }
  },

  executeActionCardEffect(player, card, targetIdx = null, onAfterConfirm = null) {
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
        if (player.hand.length > 0) player.hand.pop();
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
    UI.renderTable();
    UI.showActionConfirmModal(player, card, () => {
      UI.renderTable();
      if (onAfterConfirm) onAfterConfirm();
    }, targetEnemy?.name || null);
  },

  activateLeaderSkill(playerIdx) {
    const player = GameState.players[playerIdx];
    if (GameState.activePlayerIndex !== playerIdx || player.usedLeaderThisRound) {
      UI.showToastPopup("Abilità Leader già usata in questo Round o non è il tuo turno!");
      return;
    }
    if (player.leader.skillType !== "active") return;

    if (player.leader.id === "ldr_zarok") {
      player.usedLeaderThisRound = true;
      if (!player.awakened) this.applyDirectDamage(player, 2, player);
      player.buffNextAttack += 3;
      UI.renderTable();
    } else if (player.leader.id === "ldr_squik") {
      player.usedLeaderThisRound = true;
      if (player.hand.length > 0) player.hand.pop();
      this.drawCards(player, 2);
      if (player.awakened) this.gainPc(player, 1);
      UI.renderTable();
    } else if (player.leader.id === "ldr_malakor") {
      const minPc = player.awakened ? 3 : 4;
      const valid = this.getAlivePlayers().filter((p) => p.index !== player.index && p.pc >= minPc).map((p) => p.index);
      if (valid.length === 0) {
        UI.showToastPopup(`Nessun avversario ha almeno ${minPc} PC!`, 1500);
        return;
      }
      GameState.pendingTargetSelection = {
        validTargets: valid,
        onSelect: (tIdx) => {
          player.usedLeaderThisRound = true;
          const target = GameState.players[tIdx];
          this.gainPc(target, -1);
          this.gainPc(player, 1);
          if (player.awakened) {
            this.applyDirectDamage(target, 1, player);
            this.healPlayer(player, 1);
          }
          UI.renderTable();
        }
      };
      UI.renderTable();
      UI.showToastPopup("Scegli a sinistra da quale avversario rubare con Malakor!", 1700);
    } else if (player.leader.id === "ldr_morphos") {
      const valid = this.getAlivePlayers()
        .filter((p) => p.index !== player.index && (player.awakened ? (p.hp > player.hp || p.pc > player.pc) : (p.hp > player.hp && p.pc > player.pc)))
        .map((p) => p.index);
      if (valid.length === 0) {
        UI.showToastPopup("Nessun avversario soddisfa i requisiti di Morphos!", 1500);
        return;
      }
      GameState.pendingTargetSelection = {
        validTargets: valid,
        onSelect: (tIdx) => {
          player.usedLeaderThisRound = true;
          const target = GameState.players[tIdx];
          this.healPlayer(player, 1);
          this.gainPc(player, 1);
          this.applyDirectDamage(target, 1, player);
          UI.renderTable();
        }
      };
      UI.renderTable();
      UI.showToastPopup("Scegli a sinistra da quale avversario assorbire con Morphos!", 1700);
    }
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

  handlePlayerTargetClick(targetIdx) {
    if (!this.isValidAttackTarget(0, targetIdx)) {
      UI.setBanner(`⚠️ Non puoi attaccare questo giocatore (Immune nel round o ti ha appena attaccato).`);
      return;
    }
    const p1 = GameState.players[0];
    const card = p1.hand.find((c) => c.uid === GameState.selectedCardUid);
    if (!card) return;

    GameState.selectedCardUid = null;
    this.resolveCombat(0, targetIdx, card);
  },

  // Drag & Drop sugli slot ATK e DIF
  onSlotDrop(event, slotType) {
    event.preventDefault();
    const cardUid = event.dataTransfer.getData("text/plain");
    if (slotType === "atk" && GameState.activePlayerIndex === 0 && !GameState.waitingForDefenseFromP1) {
      this.placeCardInAtkSlot(cardUid);
    } else if (slotType === "dif" && GameState.waitingForDefenseFromP1) {
      this.placeCardInDifSlot(cardUid);
    }
  },

  placeCardInAtkSlot(cardUid) {
    const p1 = GameState.players[0];
    const card = p1.hand.find((c) => c.uid === cardUid);
    if (!card || card.type !== "creature") return;
    if (p1.pc < this.getEffectiveCardCost(p1, card)) {
      UI.showToastPopup("PC insufficienti per questa Creatura!", 1400);
      return;
    }
    GameState.slotAtkCard = card;
    GameState.currentAttackingPlayerIdx = 0;
    UI.renderTable();
    UI.showToastPopup("Ora clicca a sinistra l'avversario da attaccare!", 1500);
  },

  confirmTargetForDraggedAttack(targetIdx) {
    if (!this.isValidAttackTarget(0, targetIdx) || !GameState.slotAtkCard) {
      UI.showToastPopup("Bersaglio non valido o immune in questo Round!", 1400);
      return;
    }
    this.resolveCombat(0, targetIdx, GameState.slotAtkCard);
  },

  placeCardInDifSlot(cardUid) {
    const p1 = GameState.players[0];
    const card = p1.hand.find((c) => c.uid === cardUid);
    if (!card || card.type !== "creature") return;
    if (p1.pc < this.getEffectiveCardCost(p1, card)) {
      UI.showToastPopup("PC insufficienti per difendere con questa Creatura!", 1400);
      return;
    }
    GameState.waitingForDefenseFromP1 = false;
    GameState.slotDifCard = card;
    UI.renderTable();
    this.finishCombatResolution(GameState.currentAttackingPlayerIdx, 0, GameState.slotAtkCard, card);
  },

  // Fase 1 Scontro: Pone la carta in Zona ATK e illumina di rosso chi deve difendersi
  resolveCombat(attackerIdx, defenderIdx, atkCard) {
    const attacker = GameState.players[attackerIdx];
    const defender = GameState.players[defenderIdx];

    const atkCost = this.getEffectiveCardCost(attacker, atkCard);
    this.gainPc(attacker, -atkCost);
    attacker.hand = attacker.hand.filter((c) => c.uid !== atkCard.uid);

    if (attacker.leader.id === "ldr_vaelen" && atkCard.cost >= 5) {
      this.drawCards(attacker, 1);
      if (attacker.awakened) this.gainPc(attacker, 1);
    }

    GameState.currentAttackingPlayerIdx = attackerIdx;
    GameState.currentDefendingPlayerIdx = defenderIdx;
    GameState.slotAtkCard = atkCard;
    GameState.slotDifCard = null;
    UI.renderTable();
    // Se attaccano un altro giocatore, mostra chi attacca chi. Se attaccano ME (defenderIdx === 0), evita il doppio banner!
    if (defenderIdx !== 0) {
      UI.showCenterActionBanner(
        `⚔️ <span>${attacker.name}</span> <span class="text-rose-400">attacca</span> <span>${defender.name}!</span>`,
        1500,
        "border-rose-400/80"
      );
    }

    if (defenderIdx === 0) {
      const canDefend = defender.hand.some((c) => c.type === "creature" && defender.pc >= this.getEffectiveCardCost(defender, c));
      if (canDefend) {
        GameState.waitingForDefenseFromP1 = true;
        UI.renderTable();
        UI.showToastPopup(`⚔️ ${attacker.name} ti attacca! Apri una Creatura dalla mano per difenderti o clicca 'Subisci'`, 2400);
        return;
      } else {
        UI.showToastPopup(`⚔️ ${attacker.name} ti attacca! (Nessuna Creatura utilizzabile in difesa)`, 1800);
      }
    }

    // Se il difensore è un avversario (o P1 non ha difese), sceglie la carta difensiva e la mostra in Zona DIF
    let defCard = null;
    if (defenderIdx !== 0) {
      const affordableDefenders = defender.hand.filter(
        (c) => c.type === "creature" && defender.pc >= this.getEffectiveCardCost(defender, c)
      );
      if (affordableDefenders.length > 0) {
        affordableDefenders.sort((a, b) => (Number(b.dif) || 4) - (Number(a.dif) || 4));
        defCard = affordableDefenders[0];
      }
    }

    setTimeout(() => {
      this.finishCombatResolution(attackerIdx, defenderIdx, atkCard, defCard);
    }, 700);
  },

  // Fase 2 Scontro: Calcola i danni e apre il Tab Visivo Riassuntivo con animazione
  finishCombatResolution(attackerIdx, defenderIdx, atkCard, defCard) {
    const attacker = GameState.players[attackerIdx];
    const defender = GameState.players[defenderIdx];

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

    if (atkCard.effectCode === "mut_larva" && defCard) atkVal = Math.min(4, Math.max(2, defCard.cost));
    if (defCard?.effectCode === "mut_larva") difVal = Math.min(4, Math.max(2, atkCard.cost));
    if (atkCard.effectCode === "mut_doppel" && defCard) atkVal = Math.max(3, Number(defCard.atk) || 3);
    if (defCard?.effectCode === "mut_doppel") difVal = Math.max(3, atkVal);
    if (atkCard.effectCode === "mut_abomination") atkVal = Math.min(9, Math.max(4, 20 - defender.hp));
    if (defCard?.effectCode === "mut_abomination") difVal = Math.min(9, Math.max(4, 20 - attacker.hp));
    if (atkCard.effectCode === "mag_sage") atkVal += attacker.hand.length;
    if (defCard?.effectCode === "mag_sage") difVal += defender.hand.length;
    if (atkCard.effectCode === "mag_channeler") atkVal += attacker.actionsPlayedThisTurn * 2;
    if (atkCard.effectCode === "vik_berserker" && attacker.attacksTakenThisRound > 0) atkVal += 3;

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

    if (atkCard.effectCode === "gob_goliath") this.applyDirectDamage(attacker, 2, attacker);
    if (atkCard.effectCode === "mag_apprentice") this.gainPc(attacker, 1);
    if (defCard?.effectCode === "mag_apprentice") this.gainPc(defender, 1);
    if (atkCard.effectCode === "vik_runepriest") this.healPlayer(attacker, 2);
    if (defCard?.effectCode === "vik_runepriest") this.healPlayer(defender, 2);
    if (defCard?.effectCode === "gob_bomber") this.applyDirectDamage(attacker, 2, defender);
    if (atkCard.effectCode === "mag_phantom") difVal = Math.max(0, difVal - 4);
    if (defCard?.effectCode === "mag_mirage") atkVal = Math.min(3, atkVal);

    let damage = Math.max(0, atkVal - difVal);
    if (atkCard.effectCode === "gob_grinder") damage = Math.max(2, damage);
    if (defCard?.effectCode === "vik_huscarl") damage = Math.min(2, damage);

    if (damage > 0) {
      if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.extraAttackDamage) {
        damage += 1;
      }
      this.applyDirectDamage(defender, damage, attacker);
      attacker.wonClashThisRound = true;
      if (atkCard.effectCode === "gob_kamikaze") this.applyDirectDamage(attacker, 1, attacker);
      if (atkCard.effectCode === "gob_shaman") this.healPlayer(attacker, 2);
      if (atkCard.effectCode === "gob_raider" && defender.pc > 0) {
        defender.pc--;
        this.gainPc(attacker, 1);
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
      if (defCard.effectCode === "vik_shieldbearer") this.gainPc(defender, 1);
      if (defCard.effectCode === "vik_jarl" && difVal > atkVal) {
        this.applyDirectDamage(attacker, difVal - atkVal, defender);
      }
      if (defender.leader.id === "ldr_freya") {
        this.applyDirectDamage(attacker, defender.awakened ? 3 : 2, defender);
        if (defender.awakened && attacker.pc > 0) attacker.pc--;
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

    // Mostra il Tab Visivo Riassuntivo dello scontro e attende Conferma per passare al turno successivo
    UI.showClashSummaryModal(attacker, defender, atkCard, defCard, damage, () => {
      GameState.slotAtkCard = null;
      GameState.slotDifCard = null;
      GameState.currentAttackingPlayerIdx = null;
      GameState.currentDefendingPlayerIdx = null;
      UI.renderTable();
      this.advanceTurn(defenderIdx);
    });
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
    this.advanceTurn(null);
  },

  advanceTurn(attackedPlayerIdx) {
    if (GameState.gameOver) return;

    let nextIdx = null;
    if (
      attackedPlayerIdx !== null &&
      !GameState.players[attackedPlayerIdx].eliminated &&
      !GameState.players[attackedPlayerIdx].playedThisRound
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
      UI.renderTable();
      UI.showToastPopup(`Tocca a ${GameState.players[nextIdx].name}`, 1400);

      if (GameState.players[nextIdx].isAI) {
        setTimeout(() => this.runAITurn(nextIdx), 1500);
      }
    }
  },

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

    this.getAlivePlayers().forEach((p) => {
      p.playedThisRound = false;
      p.attacksTakenThisRound = 0;
      p.usedLeaderThisRound = false;
      p.wonClashThisRound = false;
      this.gainPc(p, pcRegen, false);
      this.drawCards(p, 1, true);
    });

    const firstIdx = GameState.baseOrder.find((idx) => !GameState.players[idx].eliminated);
    GameState.activePlayerIndex = firstIdx;
    UI.renderTable();
    UI.showNewRoundModal(GameState.round, GameState.players[firstIdx].name, () => {
      if (GameState.players[firstIdx].isAI) {
        setTimeout(() => this.runAITurn(firstIdx), 900);
      }
    });
  },

  runAITurn(aiIdx) {
    if (GameState.gameOver) return;
    const ai = GameState.players[aiIdx];

    const proceedToAttackOrPass = () => {
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
    };

    // Se l'avversario gioca una Carta Azione, mostra il Tab Visivo e attende il tuo click su "Conferma"
    const playableActions = ai.hand.filter(
      (c) => c.type === "action" && ai.pc >= this.getEffectiveCardCost(ai, c)
    );
    if (playableActions.length > 0 && ai.pc >= 4) {
      this.initiateActionPlay(aiIdx, playableActions[0].uid, proceedToAttackOrPass);
    } else {
      proceedToAttackOrPass();
    }
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
  },
  
  
};

window.addEventListener("DOMContentLoaded", () => UI.init());