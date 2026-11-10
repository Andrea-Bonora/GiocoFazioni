/* ============================================================================
   FAZIONI — MOTORE DI GIOCO (PATCH 1.4) & CONTROLLER INTERFACCIA iOS
   ============================================================================ */

const GameState = {
  roomCode: "SOLO",
  options: {
    arenasEnabled: true,
    awakeningEnabled: true
  },
  round: 1,
  baseOrder: [0, 1, 2, 3], // Shifta di 1 a ogni nuovo Round Globale
  activePlayerIndex: 0,
  lastAttackerIndex: null, // Per vietare il contrattacco diretto (salvo 1v1)
  currentArena: null,
  selectedFaction: null,
  drawnObjective: null,
  selectedLeader: null,
  selectedCardUid: null,
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

  createOrJoinRoom() {
    const codeInput = document.getElementById("room-code-input").value.trim().toUpperCase();
    GameState.roomCode = codeInput || "NORD";
    this.showModal(
      "Stanza Multiplayer",
      `Codice Stanza: ${GameState.roomCode}`,
      `Stanza pronta! Nella Parte 4 collegheremo il canale WebSocket Supabase per sincronizzare i 4 iPhone sul codice "${GameState.roomCode}". Ora puoi scegliere la tua Fazione e testare il tavolo completo.`
    );
    this.goToSetup();
  },

  goToSetup() {
    GameState.options.arenasEnabled = document.getElementById("toggle-arenas").checked;
    GameState.options.awakeningEnabled = document.getElementById("toggle-awakening").checked;

    document.getElementById("screen-menu").classList.add("hidden");
    const setup = document.getElementById("screen-setup");
    setup.classList.remove("hidden");
    setup.classList.add("flex");
    lucide.createIcons();
  },

  backToMenu() {
    document.getElementById("screen-setup").classList.add("hidden");
    document.getElementById("screen-setup").classList.remove("flex");
    document.getElementById("screen-menu").classList.remove("hidden");
  },

  renderFactionSelection() {
    const grid = document.getElementById("faction-grid");
    grid.innerHTML = "";
    Object.values(DB.factions).forEach((fac) => {
      const btn = document.createElement("button");
      btn.className = `liquid-glass p-3.5 text-left flex flex-col gap-1.5 transition active:scale-95 border border-white/20 hover:border-white/50`;
      btn.onclick = () => this.selectFaction(fac.id, btn);
      btn.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-sm font-black tracking-wide">${fac.name}</span>
          <i data-lucide="${fac.icon}" class="w-4 h-4 text-white/80"></i>
        </div>
        <span class="text-[10px] text-white/60 leading-tight">${fac.tagline}</span>
      `;
      grid.appendChild(btn);
    });
    lucide.createIcons();
  },

  selectFaction(factionId, btnEl) {
    GameState.selectedFaction = factionId;
    GameState.selectedLeader = null;

    // Evidenzia fazione scelta
    Array.from(document.getElementById("faction-grid").children).forEach((el) => {
      el.classList.remove("ring-2", "ring-cyan-400", "bg-white/20");
    });
    btnEl.classList.add("ring-2", "ring-cyan-400", "bg-white/20");

    // Pesca 1 Carta Obiettivo casuale dal pool della Fazione (PRIMA di scegliere il Leader!)
    const fac = DB.factions[factionId];
    const randomObj = fac.objectives[Math.floor(Math.random() * fac.objectives.length)];
    GameState.drawnObjective = randomObj;

    const objBox = document.getElementById("objective-preview-box");
    objBox.classList.remove("hidden");
    document.getElementById("setup-objective-title").textContent = randomObj.name;
    document.getElementById("setup-objective-desc").textContent = randomObj.desc;

    // Mostra i 3 Leader della fazione
    const leaderBox = document.getElementById("leader-selection-box");
    const leaderList = document.getElementById("leader-list");
    leaderBox.classList.remove("hidden");
    leaderBox.classList.add("flex");
    leaderList.innerHTML = "";

    fac.leaders.forEach((ldr) => {
      const lBtn = document.createElement("button");
      lBtn.className = "liquid-pill p-3 rounded-2xl text-left transition active:scale-98 flex flex-col gap-1";
      lBtn.onclick = () => this.selectLeader(ldr, lBtn);
      lBtn.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-xs font-bold text-amber-300">${ldr.name}</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/30 border border-rose-400/40 text-rose-200 font-semibold">
            Risveglio ≤ ${ldr.threshold} HP
          </span>
        </div>
        <div class="text-[11px] text-white/80 leading-snug">${ldr.baseDesc}</div>
        ${GameState.options.awakeningEnabled ? `<div class="text-[10px] text-amber-200/80 italic mt-0.5">${ldr.awakenedDesc}</div>` : ""}
      `;
      leaderList.appendChild(lBtn);
    });

    const enterBtn = document.getElementById("btn-enter-battle");
    enterBtn.disabled = true;
    enterBtn.classList.add("opacity-40", "pointer-events-none");
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

  // Renderizza l'intero stato del tavolo su iPhone
  renderTable() {
    const p1 = GameState.players[0];

    // 1. Arena attiva e Sfondo dinamico
    const arenaBadge = document.getElementById("arena-badge");
    if (GameState.options.arenasEnabled && GameState.currentArena) {
      arenaBadge.classList.remove("hidden");
      document.getElementById("arena-name-text").textContent = GameState.currentArena.name;
      const orbs = document.querySelectorAll(".ambient-orb");
      GameState.currentArena.orbColors.forEach((col, idx) => {
        if (orbs[idx]) orbs[idx].style.background = col;
      });
    } else {
      arenaBadge.classList.add("hidden");
    }

    // 2. Round e Turno attivo
    const activeP = GameState.players[GameState.activePlayerIndex];
    document.getElementById("round-text").textContent = `Round ${GameState.round} • Turno: ${activeP.name}`;

    // 3. Renderizza i 3 Avversari (P2, P3, P4) nella Top Bar
    const oppRow = document.getElementById("opponents-row");
    oppRow.innerHTML = "";
    GameState.players.slice(1).forEach((opp) => {
      const isTurn = GameState.activePlayerIndex === opp.index;
      const canBeAttacked = Engine.isValidAttackTarget(0, opp.index);
      const pill = document.createElement("div");
      pill.className = `liquid-glass p-2.5 rounded-2xl flex flex-col justify-between transition relative ${
        opp.eliminated ? "opacity-35 grayscale pointer-events-none" : ""
      } ${isTurn ? "ring-2 ring-emerald-400" : ""} ${opp.awakened ? "awakened-glow" : ""} ${
        GameState.selectedCardUid && canBeAttacked ? "ring-2 ring-rose-400 cursor-pointer animate-pulse" : ""
      }`;

      pill.onclick = () => {
        if (GameState.activePlayerIndex === 0 && GameState.selectedCardUid) {
          Engine.handlePlayerTargetClick(opp.index);
        } else {
          this.inspectPlayer(opp);
        }
      };

      pill.innerHTML = `
        <div class="flex items-center justify-between text-[10px] font-bold">
          <span class="truncate text-white/90">${opp.name} (${DB.factions[opp.faction].name.slice(0, 3)})</span>
          ${opp.playedThisRound ? `<span class="text-[8px] px-1.5 py-0.2 bg-white/15 rounded-full text-white/60">Giocato</span>` : ""}
        </div>
        <div class="text-[9px] text-amber-200/90 truncate my-0.5">${opp.leader.name}</div>
        <div class="flex items-center justify-between text-xs font-black mt-1">
          <span class="text-rose-300 flex items-center gap-0.5">♥ ${opp.hp}<span class="text-[9px] text-white/40">/${opp.maxHp}</span></span>
          <span class="text-cyan-300 flex items-center gap-0.5">⚡ ${opp.pc}</span>
          <span class="text-white/70 text-[10px]">🃏 ${opp.hand.length}</span>
        </div>
        <div class="mt-1 flex items-center justify-between text-[8px] uppercase tracking-wider">
          <span class="${opp.attacksTakenThisRound >= Engine.getMaxAttacksPerRound() ? "text-amber-300 font-bold" : "text-white/40"}">
            ${opp.attacksTakenThisRound >= Engine.getMaxAttacksPerRound() ? "🛡️ IMMUNE ROUND" : "Bersagliabile"}
          </span>
          ${opp.awakened ? `<span class="text-amber-300 font-bold">🔥 RISVEGLIO</span>` : ""}
        </div>
      `;
      oppRow.appendChild(pill);
    });

    // 4. Cruscotto Giocatore P1
    document.getElementById("p1-hp").innerHTML = `${p1.hp}<span class="text-[10px] text-white/40">/${p1.maxHp}</span>`;
    document.getElementById("p1-pc").innerHTML = `${p1.pc}<span class="text-[10px] text-white/40">/${Engine.getMaxPcCap()}</span>`;
    document.getElementById("p1-leader-name").textContent = p1.leader.name.split(" ")[0];
    document.getElementById("p1-leader-state").textContent = p1.awakened ? "🔥 RISVEGLIATO" : `Risveglio ≤${p1.leader.threshold}`;
    const ldrBtn = document.getElementById("btn-leader-skill");
    if (p1.awakened) ldrBtn.classList.add("awakened-glow");

    document.getElementById("p1-hand-count").textContent = p1.hand.length;
    document.getElementById("p1-deck-count").textContent = p1.deck.length;

    const passBtn = document.getElementById("btn-pass-turn");
    passBtn.disabled = GameState.activePlayerIndex !== 0;
    passBtn.classList.toggle("opacity-40", GameState.activePlayerIndex !== 0);

    // 5. Mano del Giocatore (Design unico per ogni carta)
    const handContainer = document.getElementById("player-hand");
    handContainer.innerHTML = "";
    p1.hand.forEach((card) => {
      const isSelected = GameState.selectedCardUid === card.uid;
      const effectiveCost = Engine.getEffectiveCardCost(p1, card);
      const cardEl = document.createElement("div");
      cardEl.className = `game-card ${DB.factions[card.faction].cardClass} ${isSelected ? "selected-card ring-2 ring-white" : ""}`;
      cardEl.onclick = () => Engine.onCardClick(card);

      cardEl.innerHTML = `
        <div class="flex items-center justify-between z-10">
          <span class="w-5 h-5 rounded-full bg-cyan-500/90 border border-white/60 text-[11px] font-black flex items-center justify-center shadow">
            ${effectiveCost}
          </span>
          <span class="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-black/40 text-white/80">
            ${card.type === "creature" ? "Creatura" : "Azione"}
          </span>
        </div>

        <div class="my-1">${card.svgArt}</div>

        <div class="z-10 flex flex-col justify-between flex-1">
          <div class="text-[10px] font-extrabold leading-tight truncate text-white drop-shadow">${card.name}</div>
          <div class="text-[8px] text-white/80 leading-tight line-clamp-2 my-0.5">${card.effectText}</div>

          ${
            card.type === "creature"
              ? `<div class="flex items-center justify-between text-[11px] font-black mt-auto pt-0.5 border-t border-white/15">
                   <span class="text-rose-300">⚔️ ${card.atk}</span>
                   <span class="text-sky-300">🛡️ ${card.dif}</span>
                 </div>`
              : `<div class="text-[9px] font-bold text-amber-300 text-center mt-auto pt-0.5 border-t border-white/15">
                   ${card.shift ? "⚡ [Spostamento]" : "✨ Immediata"}
                 </div>`
          }
        </div>
      `;
      handContainer.appendChild(cardEl);
    });

    lucide.createIcons();
  },

  setBanner(msg) {
    document.getElementById("table-status-banner").innerHTML = msg;
  },

  renderBattleSlots(attackerCard, defenderCard, resultText = "") {
    const slotA = document.getElementById("slot-attacker");
    const slotD = document.getElementById("slot-defender");

    slotA.innerHTML = attackerCard
      ? `<div class="p-2 text-center">
           <div class="text-[10px] font-bold text-rose-300">${attackerCard.name}</div>
           <div class="my-1">${attackerCard.svgArt}</div>
           <div class="text-xs font-black">⚔️ ATK: ${attackerCard.computedAtk ?? attackerCard.atk}</div>
         </div>`
      : `<span>Attaccante</span>`;

    slotD.innerHTML = defenderCard
      ? `<div class="p-2 text-center">
           <div class="text-[10px] font-bold text-sky-300">${defenderCard.name}</div>
           <div class="my-1">${defenderCard.svgArt}</div>
           <div class="text-xs font-black">🛡️ DIF: ${defenderCard.computedDif ?? defenderCard.dif}</div>
         </div>`
      : `<span>Difensore</span>`;

    if (resultText) this.setBanner(resultText);
  },

  toggleObjectiveModal() {
    const p1 = GameState.players[0];
    this.showModal(
      "Il Tuo Obiettivo Segreto",
      p1.objective.name,
      `${p1.objective.desc}\n\nProgresso: ${p1.objectiveProgress || 0} • Vinci istantaneamente se soddisfi questa condizione o se resti l'ultimo sopravvissuto!`
    );
  },

  toggleArenaModal() {
    if (!GameState.currentArena) return;
    this.showModal(
      "Campo di Battaglia Attivo",
      GameState.currentArena.name,
      GameState.currentArena.desc
    );
  },

  inspectPlayer(opp) {
    this.showModal(
      `${opp.name} (${DB.factions[opp.faction].name})`,
      opp.leader.name,
      `${opp.awakened ? opp.leader.awakenedDesc : opp.leader.baseDesc}\n\nHP: ${opp.hp}/${opp.maxHp} • PC: ${opp.pc} • Carte in mano: ${opp.hand.length}`
    );
  },

  useLeaderAbility() {
    Engine.activateLeaderSkill(0);
  },

  passTurn() {
    if (GameState.activePlayerIndex === 0) {
      Engine.executePassTurn(0);
    }
  },

  showModal(badge, title, body) {
    document.getElementById("modal-badge").textContent = badge;
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").textContent = body;
    document.getElementById("glass-modal").classList.remove("hidden");
  },

  closeModal() {
    document.getElementById("glass-modal").classList.add("hidden");
  }
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

      return {
        index: idx,
        name: idx === 0 ? "Tu (P1)" : `P${idx + 1}`,
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

    UI.renderBattleSlots(null, null, `Partita iniziata! Tocca a te: gioca Azioni o scegli una Creatura per attaccare.`);
    UI.renderTable();
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
    if (player.eliminated) return;
    player.hp = Math.min(player.maxHp, player.hp + amount);
  },

  gainPc(player, amount) {
    player.pc = Math.min(this.getMaxPcCap(), Math.max(0, player.pc + amount));
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

  playActionCard(player, card) {
    const cost = this.getEffectiveCardCost(player, card);
    player.pc -= cost;
    player.hand = player.hand.filter((c) => c.uid !== card.uid);

    // Eldoria Risvegliata cura di 1 HP sulla prima Azione
    if (player.leader.id === "ldr_eldoria" && player.awakened && player.actionsPlayedThisTurn === 0) {
      this.healPlayer(player, 1);
    }
    player.actionsPlayedThisTurn++;

    const enemies = this.getAlivePlayers().filter((p) => p.index !== player.index);
    const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];

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
        if (randomEnemy) {
          randomEnemy.pc = Math.max(0, randomEnemy.pc - 2);
          player.forbidAttackTarget = randomEnemy.index;
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
        if (randomEnemy) this.applyDirectDamage(randomEnemy, 2, player);
        break;
      case "act_mag_amnesia":
        if (randomEnemy) {
          randomEnemy.pc = Math.max(0, randomEnemy.pc - 2);
          if (randomEnemy.hand.length > 0) randomEnemy.hand.pop();
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
        if (randomEnemy && player.hp < randomEnemy.hp) {
          this.healPlayer(player, 2);
          this.applyDirectDamage(randomEnemy, 1, player);
        } else {
          this.drawCards(player, 2);
        }
        break;
      case "act_mut_mirror":
        player.buffNextDefense += 3;
        break;
      case "act_mut_equality":
        if (randomEnemy) player.pc = randomEnemy.pc;
        break;
    }

    if (card.shift) this.shiftArena();
    UI.setBanner(`✨ ${player.name} gioca l'Azione <b>${card.name}</b>!`);
    UI.renderTable();
  },

  activateLeaderSkill(playerIdx) {
    const player = GameState.players[playerIdx];
    if (GameState.activePlayerIndex !== playerIdx || player.usedLeaderThisRound) {
      UI.setBanner(`Abilità Leader già usata in questo Round o non è il tuo turno.`);
      return;
    }
    if (player.leader.skillType !== "active") {
      UI.setBanner(`${player.leader.name} ha un'abilità Passiva sempre attiva!`);
      return;
    }

    player.usedLeaderThisRound = true;
    if (player.leader.id === "ldr_zarok") {
      if (!player.awakened) this.applyDirectDamage(player, 2, player);
      player.buffNextAttack += 3;
      UI.setBanner(`👑 ${player.leader.name} attiva Furia: +3 ATK al prossimo attacco!`);
    } else if (player.leader.id === "ldr_squik") {
      if (player.hand.length > 0) player.hand.pop();
      this.drawCards(player, 2);
      if (player.awakened) this.gainPc(player, 1);
      UI.setBanner(`👑 Squik mescola le pozioni: pescate 2 carte!`);
    } else if (player.leader.id === "ldr_malakor") {
      const target = this.getAlivePlayers().find((p) => p.index !== player.index && p.pc >= (player.awakened ? 3 : 4));
      if (target) {
        target.pc -= 1;
        this.gainPc(player, 1);
        if (player.awakened) {
          this.applyDirectDamage(target, 1, player);
          this.healPlayer(player, 1);
        }
        UI.setBanner(`👑 Malakor drena risorse da ${target.name}!`);
      }
    } else if (player.leader.id === "ldr_morphos") {
      const target = this.getAlivePlayers().find((p) => p.index !== player.index);
      if (target) {
        this.healPlayer(player, 1);
        this.gainPc(player, 1);
        this.applyDirectDamage(target, 1, player);
        UI.setBanner(`👑 Morphos assorbe energia vitale da ${target.name}!`);
      }
    }
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

  // Risoluzione completa del Combattimento (Patch 1.4: Attaccante -> Difensore -> Danni -> Pescata Attiva)
  resolveCombat(attackerIdx, defenderIdx, atkCard) {
    const attacker = GameState.players[attackerIdx];
    const defender = GameState.players[defenderIdx];

    // Pagamento Costo Attaccante
    const atkCost = this.getEffectiveCardCost(attacker, atkCard);
    attacker.pc = Math.max(0, attacker.pc - atkCost);
    attacker.hand = attacker.hand.filter((c) => c.uid !== atkCard.uid);

    if (attacker.leader.id === "ldr_vaelen" && atkCard.cost >= 5) {
      this.drawCards(attacker, 1);
      if (attacker.awakened) this.gainPc(attacker, 1);
    }

    // Scelta Creatura Difensiva (Se il difensore ha una Creatura che può permettersi)
    let defCard = null;
    const affordableDefenders = defender.hand.filter(
      (c) => c.type === "creature" && defender.pc >= this.getEffectiveCardCost(defender, c)
    );
    if (affordableDefenders.length > 0) {
      // Ordina per DIF migliore
      affordableDefenders.sort((a, b) => (Number(b.dif) || 4) - (Number(a.dif) || 4));
      defCard = affordableDefenders[0];
      const defCost = this.getEffectiveCardCost(defender, defCard);
      defender.pc = Math.max(0, defender.pc - defCost);
      defender.hand = defender.hand.filter((c) => c.uid !== defCard.uid);
    }

    // Calcolo Valori Base (? = 2 base prima della risoluzione copia)
    let atkVal = atkCard.atk === "?" ? 2 : Number(atkCard.atk);
    let difVal = defCard ? (defCard.dif === "?" ? 2 : Number(defCard.dif)) : 0;

    if (attacker.shieldSlamActive) {
      atkVal = atkCard.dif === "?" ? 4 : Number(atkCard.dif);
      attacker.shieldSlamActive = false;
    }

    // Modificatori Mutaformi e Creature
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

    // Bonus Buff Azioni e Arene
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

    // Effetti Speciali Pre-Calcolo (Golia, Apprendista, Sacerdote, Bombarolo, Spettro)
    if (atkCard.effectCode === "gob_goliath") this.applyDirectDamage(attacker, 2, attacker);
    if (atkCard.effectCode === "mag_apprentice") this.gainPc(attacker, 1);
    if (defCard?.effectCode === "mag_apprentice") this.gainPc(defender, 1);
    if (atkCard.effectCode === "vik_runepriest") this.healPlayer(attacker, 2);
    if (defCard?.effectCode === "vik_runepriest") this.healPlayer(defender, 2);
    if (defCard?.effectCode === "gob_bomber") this.applyDirectDamage(attacker, 2, defender);
    if (atkCard.effectCode === "mag_phantom") difVal = Math.max(0, difVal - 4);
    if (defCard?.effectCode === "mag_mirage") atkVal = Math.min(3, atkVal);

    // Calcolo Danni Finali (ATK - DIF)
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

      // Progresso Obiettivo Furia Cieca (Goblin: 5+ danni per 2 volte)
      if (attacker.objective.id === "obj_gob_1" && damage >= 5) {
        attacker.objectiveProgress++;
        if (attacker.objectiveProgress >= 2) this.triggerVictory(attacker, "Obiettivo Furia Cieca completato!");
      }
    } else if (defCard) {
      // Il Difensore ha bloccato a 0 danni!
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

    // Regola della Difesa Attiva (Patch 1.2): Attaccante pesca 1; Difensore pesca 1 SOLO SE ha giocato una Creatura!
    this.drawCards(attacker, 1);
    if (defCard) {
      this.drawCards(defender, 1);
    }

    // Aggiorna contatori di turno e Iniziativa Dinamica (La Patata Bollente)
    attacker.playedThisRound = true;
    defender.attacksTakenThisRound++;
    GameState.lastAttackerIndex = attackerIdx;

    atkCard.computedAtk = atkVal;
    if (defCard) defCard.computedDif = difVal;

    UI.renderBattleSlots(
      atkCard,
      defCard,
      `⚔️ <b>${attacker.name}</b> (${atkVal} ATK) attacca <b>${defender.name}</b> (${
        defCard ? `${difVal} DIF` : "Nessuna difesa"
      }) ➔ <b>${damage} danni!</b>`
    );

    this.advanceTurn(defenderIdx);
  },

  executePassTurn(playerIdx) {
    const player = GameState.players[playerIdx];
    player.playedThisRound = true;

    // Passiva di Ragnar (Vichinghi)
    if (player.leader.id === "ldr_ragnar") {
      this.gainPc(player, player.awakened ? 3 : 2);
      this.healPlayer(player, player.awakened ? 2 : 1);
    }
    // Penalità Arena dei Gladiatori
    if (GameState.options.arenasEnabled && GameState.currentArena?.modifier?.passPenaltyHp) {
      this.applyDirectDamage(player, 1, player);
    }

    UI.setBanner(`🛡️ <b>${player.name}</b> decide di Passare il turno per risparmiare Punti Costo.`);
    this.advanceTurn(null);
  },

  // Gestisce l'Iniziativa Dinamica: precedenza a chi è stato attaccato se non ha ancora giocato nel Round!
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
      // Altrimenti il primo nell'ordine base che non ha ancora giocato
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

      if (GameState.players[nextIdx].isAI) {
        setTimeout(() => this.runAITurn(nextIdx), 1100);
      }
    }
  },

  startNewGlobalRound() {
    // Check Obiettivi di Fine Round (Patch 1.1)
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
    // Shifta l'ordine base di 1 posizione (P2, P3, P4, P1...)
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
      this.gainPc(p, pcRegen);
      this.drawCards(p, 1, true);
    });

    const firstIdx = GameState.baseOrder.find((idx) => !GameState.players[idx].eliminated);
    GameState.activePlayerIndex = firstIdx;
    UI.setBanner(`🔄 <b>Inizia il Round Globale ${GameState.round}!</b> Tutti rigenerano +${pcRegen} PC e pescano 1 carta.`);
    UI.renderTable();

    if (GameState.players[firstIdx].isAI) {
      setTimeout(() => this.runAITurn(firstIdx), 1200);
    }
  },

  // Turno intelligente degli avversari (quando giochi in modalità locale/test)
  runAITurn(aiIdx) {
    if (GameState.gameOver) return;
    const ai = GameState.players[aiIdx];

    // 1. Gioca eventualmente una carta Azione se conveniente
    const playableActions = ai.hand.filter(
      (c) => c.type === "action" && ai.pc >= this.getEffectiveCardCost(ai, c)
    );
    if (playableActions.length > 0 && ai.pc >= 4) {
      this.playActionCard(ai, playableActions[0]);
    }

    // 2. Cerca una Creatura e un bersaglio valido per attaccare
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