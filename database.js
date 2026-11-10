/* ============================================================================
   FAZIONI — DATABASE COMPLETO PATCH 1.4 & GENERATORE ARTWORK UNICO (160 CARTE)
   ============================================================================ */

const DB = {
  // 1. LE 8 ARENE (CAMPI DI BATTAGLIA)
  arenas: [
    {
      id: "arena_tundra",
      name: "Tundra Perenne",
      icon: "snowflake",
      orbColors: ["#1d4ed8", "#0284c7", "#38bdf8"],
      desc: "Tutte le Creature giocate in Difesa ottengono +1 DIF.",
      modifier: { defBonus: 1 }
    },
    {
      id: "arena_vulcano",
      name: "Fossa Vulcanica",
      icon: "flame",
      orbColors: ["#b91c1c", "#ea580c", "#7f1d1d"],
      desc: "Ogni volta che un giocatore subisce danni diretti agli HP da un attacco nemico, subisce +1 danno extra (non si applica all'autolesionismo Goblin).",
      modifier: { extraAttackDamage: 1 }
    },
    {
      id: "arena_santuario",
      name: "Santuario Etereo",
      icon: "sparkles",
      orbColors: ["#7e22ce", "#4f46e5", "#c084fc"],
      desc: "Tutte le Carte Azione costano 1 PC in meno (minimo 1 PC, salvo abilità Leader).",
      modifier: { actionDiscount: 1 }
    },
    {
      id: "arena_palude",
      name: "Palude Nebbiosa",
      icon: "cloud-fog",
      orbColors: ["#0f766e", "#115e59", "#042f2e"],
      desc: "Le Creature in Attacco con Costo 3 o inferiore ottengono +1 ATK. Gli effetti di annullamento non funzionano contro i difensori.",
      modifier: { lowCostAtkBonus: 1, protectDefenderEffects: true }
    },
    {
      id: "arena_gladiatori",
      name: "Arena dei Gladiatori",
      icon: "swords",
      orbColors: ["#b45309", "#991b1b", "#78350f"],
      desc: "Chi decide di Passare il turno senza attaccare subisce 1 danno diretto agli HP per codardia.",
      modifier: { passPenaltyHp: 1 }
    },
    {
      id: "arena_oasi",
      name: "Oasi Mutagena",
      icon: "dna",
      orbColors: ["#059669", "#ca8a04", "#065f46"],
      desc: "Chi vince uno scontro (infliggendo danno agli HP in attacco o subendo 0 danni in difesa) pesca 1 carta extra dal mazzo.",
      modifier: { drawOnWinClash: 1 }
    },
    {
      id: "arena_miniere",
      name: "Miniere di Cristallo",
      icon: "gem",
      orbColors: ["#0369a1", "#6d28d9", "#0ea5e9"],
      desc: "Il tetto massimo di Punti Costo sale a 12 PC e la rigenerazione di inizio Round sale a +4 PC.",
      modifier: { maxPcCap: 12, roundPcRegen: 4 }
    },
    {
      id: "arena_cimitero",
      name: "Cimitero Dimenticato",
      icon: "skull",
      orbColors: ["#374151", "#4c1d95", "#111827"],
      desc: "Il bonus Taglia di Eliminazione è raddoppiato: +4 PC a chi infligge il colpo di grazia e +6 HP all'assistman.",
      modifier: { doubleBounty: true }
    }
  ],

  // 2. LE 4 FAZIONI (OBIETTIVI, LEADER E ARCHETIPI CARTE)
  factions: {
    goblin: {
      id: "goblin",
      name: "Goblin",
      tagline: "Aggro, Sacrificio & Velocità",
      color: "rose",
      cardClass: "card-goblin",
      icon: "flame",
      objectives: [
        {
          id: "obj_gob_1",
          name: "Furia Cieca",
          desc: "Vinci se riesci a infliggere 5 o più danni diretti agli HP in un singolo scontro per 2 volte nella partita."
        },
        {
          id: "obj_gob_2",
          name: "Carne da Macello",
          desc: "Vinci se subisci danni durante le tue difese per 3 volte nella partita e resti in vita."
        },
        {
          id: "obj_gob_3",
          name: "Bancarotta del Sangue",
          desc: "Vinci se elimini un avversario (0 HP) in un momento in cui tu hai esattamente 0 PC."
        }
      ],
      leaders: [
        {
          id: "ldr_zarok",
          name: "Zarok il Sanguinario",
          threshold: 6,
          baseDesc: "Attiva (1/Round): Paga 2 HP -> La tua Creatura attaccante ottiene +3 ATK.",
          awakenedDesc: "RISVEGLIO (≤6 HP): Attiva (1/Round): +3 ATK gratis in attacco; se fa danno agli HP ti curi di 1 HP.",
          skillType: "active"
        },
        {
          id: "ldr_grim",
          name: "Grim Mercante di Rottami",
          threshold: 6,
          baseDesc: "Passiva: Ogni volta che subisci danni agli HP (anche dalle tue carte), guadagni +1 PC.",
          awakenedDesc: "RISVEGLIO (≤6 HP): Passiva: Guadagni +1 PC quando subisci danni e riduci ogni danno subito di 1 (min. 1).",
          skillType: "passive"
        },
        {
          id: "ldr_squik",
          name: "Squik l'Alchimista Pazzo",
          threshold: 6,
          baseDesc: "Attiva (1/Round): Scarta 1 carta per pescarne 2 (subisci 1 danno se peschi un'Azione).",
          awakenedDesc: "RISVEGLIO (≤6 HP): Attiva (1/Round): Pesca 2 carte, scartane 1, guadagni +1 PC e non subisci danni.",
          skillType: "active"
        }
      ],
      archetypes: [
        {
          type: "creature", cost: 1, atk: 3, dif: 1, shift: false,
          effectCode: "gob_kamikaze",
          effectText: "Attacco: Se infligge almeno 1 danno agli HP nemici, subisci 1 danno diretto.",
          names: ["Sgorbio Esplosivo", "Recluta Kamikaze", "Fiondatore Pazzo", "Corridore delle Mine"]
        },
        {
          type: "creature", cost: 2, atk: 4, dif: 1, shift: false,
          effectCode: "gob_raider",
          effectText: "Attacco: Se infligge danno agli HP nemici, rubi 1 PC al bersaglio.",
          names: ["Predone Ingozzato", "Ladruncolo di Rame", "Tagliaborse Veloce", "Sciacallo delle Grotte"]
        },
        {
          type: "creature", cost: 2, atk: 3, dif: 2, shift: false,
          effectCode: "gob_shaman",
          effectText: "Attacco: Se questa carta infligge danno agli HP avversari, ti curi di 2 HP.",
          names: ["Sciamano Sanguinario", "Curatore di Tribù"]
        },
        {
          type: "creature", cost: 3, atk: 2, dif: 2, shift: false,
          effectCode: "gob_bomber",
          effectText: "Difesa: Prima del calcolo danni, infligge 2 danni diretti agli HP dell'attaccante.",
          names: ["Bombarolo Folle", "Lanciatore di Barili", "Piromane Sghignazzante", "Artificiere Cieco"]
        },
        {
          type: "creature", cost: 3, atk: 5, dif: 1, shift: false,
          effectCode: "gob_piercer",
          effectText: "Attacco: Paghi 1 HP per ignorare 2 punti di DIF della creatura avversaria.",
          names: ["Incursore Zannarotta", "Cavalcalupi Feroce", "Spaccascudi Urlante", "Berserker Tascabile"]
        },
        {
          type: "creature", cost: 4, atk: 4, dif: 4, shift: false,
          effectCode: "gob_merc",
          effectText: "Combattimento: Se vince lo scontro (fa danno o blocca a 0), rubi 1 PC all'avversario.",
          names: ["Mercenario Tagliagole", "Bruto Prezzolato", "Aguzzino del Clan", "Cacciatore di Taglie"]
        },
        {
          type: "creature", cost: 6, atk: 8, dif: 3, shift: false,
          effectCode: "gob_goliath",
          effectText: "Combattimento: Quando rivelata, perdi 2 HP.",
          names: ["Golia delle Caverne", "Troll Incatenato", "Ogre Mutante"]
        },
        {
          type: "creature", cost: 8, atk: 10, dif: 5, shift: false,
          effectCode: "gob_grinder",
          effectText: "Perforazione: Infligge sempre almeno 2 danni agli HP. Se il nemico sopravvive, perdi 2 PC.",
          names: ["Macchina Tritacarne"]
        },
        // AZIONI GOBLIN (14)
        {
          type: "action", cost: 1, shift: false,
          effectCode: "act_gob_pact",
          effectText: "Subisci 2 danni agli HP e pesca immediatamente 2 carte.",
          names: ["Patto di Sangue", "Dito Mozzato", "Roulette Goblin", "Furia Cieca"]
        },
        {
          type: "action", cost: 2, shift: false,
          effectCode: "act_gob_adrenaline",
          effectText: "Il tuo prossimo attacco in questo turno ottiene +3 ATK, ma subisci 1 danno a fine turno.",
          names: ["Adrenalina Tossica", "Funghi Allucinogeni", "Intruglio Esplosivo", "Birra di Fiamma"]
        },
        {
          type: "action", cost: 0, shift: false,
          effectCode: "act_gob_ritual",
          effectText: "Subisci 3 danni agli HP. Guadagni immediatamente +4 PC.",
          names: ["Sacrificio Rituale", "Carne nel Calderone", "Scintilla Vitale"]
        },
        {
          type: "action", cost: 3, shift: true,
          effectCode: "act_gob_sabotage",
          effectText: "Un avversario perde 2 PC (non puoi attaccarlo in questo turno). [Spostamento]",
          names: ["Sabotaggio Codardo", "Trappola di Fango", "Sabbia negli Occhi"]
        }
      ]
    },

    vichinghi: {
      id: "vichinghi",
      name: "Vichinghi",
      tagline: "Muro Difensivo, Contrattacco & Accumulo",
      color: "sky",
      cardClass: "card-vichinghi",
      icon: "shield",
      objectives: [
        {
          id: "obj_vik_1",
          name: "Muro di Ferro",
          desc: "Vinci se ti difendi da 4 attacchi nella partita subendo esattamente 0 danni agli HP."
        },
        {
          id: "obj_vik_2",
          name: "Contrattacco Letale",
          desc: "Vinci se elimini un avversario durante il suo turno grazie ai danni riflessi in difesa."
        },
        {
          id: "obj_vik_3",
          name: "Bottino del Valhalla",
          desc: "Vinci a fine Round se hai 10 PC, almeno 7 carte in mano e hai vinto almeno 1 scontro nel Round."
        }
      ],
      leaders: [
        {
          id: "ldr_olaf",
          name: "Olaf Muro-di-Scudi",
          threshold: 6,
          baseDesc: "Provocazione (1/Round): Paga 1 HP per deviare un attacco su di te; se subisci 0 danni guadagni +2 PC.",
          awakenedDesc: "RISVEGLIO (≤6 HP): Provocazione gratuita (0 HP), +2 DIF allo scudo e +2 PC se subisci 0 danni.",
          skillType: "active"
        },
        {
          id: "ldr_freya",
          name: "Freya Valchiria d'Inverno",
          threshold: 7,
          baseDesc: "Passiva: Ogni volta che riduci a 0 il danno di un attacco in difesa, l'attaccante subisce 2 danni agli HP.",
          awakenedDesc: "RISVEGLIO (≤7 HP): Passiva: Se riduci a 0 il danno in difesa, l'attaccante subisce 3 danni e perde 1 PC.",
          skillType: "passive"
        },
        {
          id: "ldr_ragnar",
          name: "Ragnar il Razziatore",
          threshold: 5,
          baseDesc: "Passiva: Se nel tuo turno decidi di Passare senza attaccare, guadagni +2 PC e ti curi di 1 HP.",
          awakenedDesc: "RISVEGLIO (≤5 HP): Se passi guadagni +3 PC e +2 HP; se attacchi la tua Creatura costa 1 PC in meno.",
          skillType: "passive"
        }
      ],
      archetypes: [
        {
          type: "creature", cost: 1, atk: 1, dif: 4, shift: false,
          effectCode: "vik_shieldbearer",
          effectText: "Difesa: Se blocca completamente il danno (0 danni subiti), guadagni +1 PC.",
          names: ["Erik lo Scudiero", "Guardia dei Fiordi", "Sentinella di Legno", "Giovane Hirdman"]
        },
        {
          type: "creature", cost: 2, atk: 2, dif: 5, shift: false,
          effectCode: "vik_frost",
          effectText: "Difesa: L'attaccante perde 1 PC.",
          names: ["Esploratore del Ghiaccio", "Lanciere di Kattegat", "Cacciatore delle Nevi", "Custode della Brina"]
        },
        {
          type: "creature", cost: 3, atk: 4, dif: 3, shift: false,
          effectCode: "vik_berserker",
          effectText: "Attacco: Ottiene +3 ATK (7 ATK) se sei già stato attaccato nel Round o se il bersaglio non ti ha mai attaccato.",
          names: ["Ulf Pelle d'Orso", "Furia di Midgard", "Spaccacrani Urlante", "Predone Sanguinario"]
        },
        {
          type: "creature", cost: 3, atk: 3, dif: 6, shift: false,
          effectCode: "vik_huscarl",
          effectText: "Difesa: Non puoi subire più di 2 danni agli HP da questo scontro.",
          names: ["Huscarl Corazzato", "Veterano della Falange", "Difensore del Passo"]
        },
        {
          type: "creature", cost: 4, atk: 3, dif: 7, shift: false,
          effectCode: "vik_jarl",
          effectText: "Difesa: Se la DIF supera l'ATK nemico, l'attaccante subisce danni agli HP pari alla differenza.",
          names: ["Jarl Torstein", "Maestro d'Ascia Reale", "Campione del Muro"]
        },
        {
          type: "creature", cost: 5, atk: 5, dif: 6, shift: false,
          effectCode: "vik_runepriest",
          effectText: "Combattimento: Quando riveli questa carta, ti curi immediatamente di 2 HP.",
          names: ["Sacerdote di Odino", "Saggio delle Pietre", "Mistico di Asgard"]
        },
        {
          type: "creature", cost: 6, atk: 6, dif: 9, shift: false,
          effectCode: "vik_giant",
          effectText: "Combattimento: Costa 2 PC in meno (Costo 4) se possiedi 8 o più PC.",
          names: ["Colosso di Ghiaccio", "Figlio di Ymir", "Titano della Tundra"]
        },
        {
          type: "creature", cost: 8, atk: 9, dif: 10, shift: false,
          effectCode: "vik_legend",
          effectText: "Combattimento: Ignora gli effetti negativi nemici. Se vince lo scontro, peschi 2 carte.",
          names: ["Fenrir lo Spezzacatene", "Jormungandr il Serpente"]
        },
        // AZIONI VICHINGHI (14)
        {
          type: "action", cost: 1, shift: false,
          effectCode: "act_vik_shieldbuff",
          effectText: "La prossima Creatura che usi per difenderti in questo Round ottiene +3 DIF.",
          names: ["Ferro Battuto", "Incisione Runica", "Saldatura d'Emergenza", "Benedizione del Fabbro"]
        },
        {
          type: "action", cost: 2, shift: false,
          effectCode: "act_vik_mead",
          effectText: "Ti curi di 3 HP e peschi 1 carta.",
          names: ["Corno d'Idromele", "Banchetto del Guerriero", "Riposo del Valoroso"]
        },
        {
          type: "action", cost: 0, shift: true,
          effectCode: "act_vik_prep",
          effectText: "Se non attacchi in questo turno, guadagni +1 PC e peschi 1 carta. [Spostamento]",
          names: ["Attesa Strategica", "Raccogliere le Forze", "Silenzio prima della Tempesta"]
        },
        {
          type: "action", cost: 1, shift: false,
          effectCode: "act_vik_taunt",
          effectText: "Pesca 1 carta. Scegli un avversario: nel suo prossimo turno in questo Round è obbligato ad attaccare te.",
          names: ["Insulto Vichingo", "Richiamo del Corno", "Sfida di Sangue"]
        },
        {
          type: "action", cost: 3, shift: false,
          effectCode: "act_vik_shieldslam",
          effectText: "In questo turno, la tua Creatura attaccante usa il suo valore di DIF al posto dell'ATK!",
          names: ["Colpo di Scudo"]
        }
      ]
    },

    maghi: {
      id: "maghi",
      name: "Maghi",
      tagline: "Controllo, Manipolazione & Vantaggio Carte",
      color: "purple",
      cardClass: "card-maghi",
      icon: "wand-sparkles",
      objectives: [
        {
          id: "obj_mag_1",
          name: "Onniscienza Arcana",
          desc: "Vinci a fine Round se hai 11 o più carte in mano e almeno 15 HP."
        },
        {
          id: "obj_mag_2",
          name: "Supremazia della Mente",
          desc: "Vinci se vinci 3 scontri usando Creature con ATK o DIF base inferiore a quello dell'avversario."
        },
        {
          id: "obj_mag_3",
          name: "Siccità di Mana",
          desc: "Vinci se alla fine di un Round Globale tutti gli avversari in vita hanno esattamente 0 PC."
        }
      ],
      leaders: [
        {
          id: "ldr_eldoria",
          name: "Eldoria Tessitrice del Tempo",
          threshold: 8,
          baseDesc: "Passiva: La tua prima Azione a turno costa 1 PC in meno (min. 0). Limite mano a inizio round: 8.",
          awakenedDesc: "RISVEGLIO (≤8 HP): La prima Azione costa 2 PC in meno e ti cura di 1 HP. Limite mano: 9.",
          skillType: "passive"
        },
        {
          id: "ldr_malakor",
          name: "Malakor Signore del Vuoto",
          threshold: 7,
          baseDesc: "Attiva (1/Round): Ruba 1 PC a un avversario che possiede almeno 4 PC.",
          awakenedDesc: "RISVEGLIO (≤7 HP): Attiva (1/Round): Ruba 1 PC e 1 HP a un avversario che ha almeno 3 PC.",
          skillType: "active"
        },
        {
          id: "ldr_vaelen",
          name: "Archimago Vaelen",
          threshold: 8,
          baseDesc: "Passiva: Ogni volta che giochi una Creatura di Costo 5 o superiore, peschi 1 carta.",
          awakenedDesc: "RISVEGLIO (≤8 HP): Le Creature di Costo 5+ costano 1 PC in meno e quando le giochi peschi 1 carta e +1 PC.",
          skillType: "passive"
        }
      ],
      archetypes: [
        {
          type: "creature", cost: 1, atk: 1, dif: 2, shift: false,
          effectCode: "mag_apprentice",
          effectText: "Combattimento: Quando rivelata, guadagni +1 PC (si ripaga da sola).",
          names: ["Novizio della Torre", "Studioso di Pergamene", "Iniziato del Cristallo", "Custode dei Tomi"]
        },
        {
          type: "creature", cost: 2, atk: 1, dif: 1, shift: false,
          effectCode: "mag_mirage",
          effectText: "Difesa: Annulla l'effetto dell'attaccante e riduce il suo ATK esattamente a 3.",
          names: ["Doppione Etereo", "Spettro di Fumo", "Proiezione Mentale", "Ombra Ingannatrice"]
        },
        {
          type: "creature", cost: 3, atk: 3, dif: 3, shift: false,
          effectCode: "mag_channeler",
          effectText: "Attacco: Guadagna +2 ATK per ogni Carta Azione che hai giocato in questo turno.",
          names: ["Evocatore di Fiamme", "Piromante dell'Accademia", "Tessitore di Fulmini"]
        },
        {
          type: "creature", cost: 3, atk: 3, dif: 4, shift: false,
          effectCode: "mag_siphon",
          effectText: "Combattimento: Il nemico perde 1 PC (se aveva 0 PC, subisce invece 2 danni diretti agli HP).",
          names: ["Parassita Astrale", "Divoratore di Etere", "Spettro Assorbente"]
        },
        {
          type: "creature", cost: 4, atk: 4, dif: 2, shift: false,
          effectCode: "mag_phantom",
          effectText: "Attacco: Ignora fino a 4 punti di DIF della Creatura difensiva avversaria.",
          names: ["Viandante Dimensionale", "Assassino del Vuoto", "Lama Fantasma"]
        },
        {
          type: "creature", cost: 4, atk: 2, dif: 5, shift: false,
          effectCode: "mag_golem",
          effectText: "Combattimento: Riduce l'ATK nemico di un valore pari al Costo in PC della carta nemica (max -4).",
          names: ["Costrutto Gravitazionale", "Golem degli Specchi", "Sentinella del Paradosso"]
        },
        {
          type: "creature", cost: 6, atk: 1, dif: 1, shift: false,
          effectCode: "mag_sage",
          effectText: "Combattimento: Ottiene +1 ATK e +1 DIF per ogni carta che hai attualmente in mano.",
          names: ["Avatar della Conoscenza", "Oracolo dell'Infinito"]
        },
        {
          type: "creature", cost: 8, atk: 7, dif: 8, shift: false,
          effectCode: "mag_archmage",
          effectText: "Combattimento: Annulla l'effetto nemico. Dopo lo scontro riporta i tuoi PC a 5 e peschi 1 carta.",
          names: ["Cronomante Supremo", "Arcimago del Nexus"]
        },
        // AZIONI MAGHI (16)
        {
          type: "action", cost: 1, shift: false,
          effectCode: "act_mag_meditate",
          effectText: "Pesca immediatamente 2 carte.",
          names: ["Lettura delle Stelle", "Sussurri del Grimorio", "Visione Cristallina", "Studio Proibito"]
        },
        {
          type: "action", cost: 0, shift: false,
          effectCode: "act_mag_catalyst",
          effectText: "Scarta 1 carta dalla mano per guadagnare immediatamente +2 PC.",
          names: ["Cristallo di Riserva", "Sacrificio del Tomo", "Distillazione Pura", "Frammento di Leyline"]
        },
        {
          type: "action", cost: 2, shift: false,
          effectCode: "act_mag_barrier",
          effectText: "Ti curi di 1 HP. Al prossimo attacco subito nel Round, dimezza l'ATK nemico e peschi 1 carta.",
          names: ["Scudo di Forza", "Cupola Rifrangente", "Velo di Ghiaccio Arcano"]
        },
        {
          type: "action", cost: 2, shift: false,
          effectCode: "act_mag_bolt",
          effectText: "Scegli un avversario: gli infliggi 2 danni diretti agli HP.",
          names: ["Fulmine Globulare", "Raggio Disintegrante", "Fiamma Azzurra"]
        },
        {
          type: "action", cost: 3, shift: true,
          effectCode: "act_mag_amnesia",
          effectText: "Scegli un avversario: perde 2 PC e scarta 1 carta casuale. [Spostamento]",
          names: ["Vuoto Mentale", "Catene dell'Oblio", "Eclissi della Mente"]
        }
      ]
    },

    mutaformi: {
      id: "mutaformi",
      name: "Mutaformi",
      tagline: "Copia Dinamica, Adattamento & Simbiosi",
      color: "amber",
      cardClass: "card-mutaformi",
      icon: "drama",
      objectives: [
        {
          id: "obj_mut_1",
          name: "Specchio Perfetto",
          desc: "Vinci se elimini un avversario usando una Creatura che ha copiato statistiche o effetto del nemico."
        },
        {
          id: "obj_mut_2",
          name: "Simbiosi Totale",
          desc: "Vinci a fine Round (dal Round 4 in poi) se tu e un avversario avete esattamente gli stessi HP e PC."
        },
        {
          id: "obj_mut_3",
          name: "Ladri di Identità",
          desc: "Vinci se nella partita riesci a copiare o attivare effetti contro tutte e 3 le altre fazioni."
        }
      ],
      leaders: [
        {
          id: "ldr_xylar",
          name: "Xylar dai Mille Volti",
          threshold: 7,
          baseDesc: "Attiva (1/Round): In difesa, paga 1 PC per sostituire la tua Creatura con un'altra dalla mano.",
          awakenedDesc: "RISVEGLIO (≤7 HP): Sostituisci il difensore a Costo 0 PC e la nuova carta ottiene +2 DIF.",
          skillType: "active"
        },
        {
          id: "ldr_morphos",
          name: "Morphos il Parassita",
          threshold: 6,
          baseDesc: "Attiva (1/Round): Scegli un nemico con più HP e più PC di te: tu guadagni +1 HP e +1 PC, lui perde 1 HP.",
          awakenedDesc: "RISVEGLIO (≤6 HP): Ruba 1 HP e 1 PC a qualsiasi avversario abbia più HP oppure più PC di te.",
          skillType: "active"
        },
        {
          id: "ldr_nyx",
          name: "Nyx l'Ombra Riflessa",
          threshold: 7,
          baseDesc: "Passiva: A inizio Round copia un Leader nemico (non lo stesso per 2 round di fila; attive costano +1 PC).",
          awakenedDesc: "RISVEGLIO (≤7 HP): Copia i Leader senza sovrapprezzo (+0 PC) e ne copia il Risveglio se il bersaglio è Risvegliato.",
          skillType: "passive"
        }
      ],
      archetypes: [
        {
          type: "creature", cost: 1, atk: "?", dif: "?", shift: false,
          effectCode: "mut_larva",
          effectText: "Combattimento: ATK e DIF diventano pari al Costo in PC della carta avversaria (min 2, max 4).",
          names: ["Poltiglia Mutevole", "Larva Camaleonte", "Gelatina Riflettente", "Embrione d'Ombra"]
        },
        {
          type: "creature", cost: 2, atk: 2, dif: 3, shift: false,
          effectCode: "mut_stealer",
          effectText: "Combattimento: Copia l'Effetto di combattimento della Creatura avversaria.",
          names: ["Spia Senza Volto", "Infiltrato Silente", "Usurpatore di Pelle", "Maschera Vivente"]
        },
        {
          type: "creature", cost: 3, atk: "?", dif: "?", shift: false,
          effectCode: "mut_doppel",
          effectText: "Combattimento: Copia esattamente ATK e DIF base stampati sulla Creatura avversaria (min 3/3).",
          names: ["Sosia Perfetto", "Riflesso Oscuro", "Gemello Maledetto", "Imitatore Letale"]
        },
        {
          type: "creature", cost: 3, atk: 1, dif: 2, shift: false,
          effectCode: "mut_parasite",
          effectText: "Combattimento: Ottiene +1 ATK e +1 DIF per ogni PC attualmente posseduto dall'avversario.",
          names: ["Sanguisuga Eterea", "Divoratore d'Essenza", "Spettro Simbiotico"]
        },
        {
          type: "creature", cost: 4, atk: 4, dif: 4, shift: false,
          effectCode: "mut_assimilator",
          effectText: "Combattimento: Assorbe 2 punti di ATK o DIF dal nemico (diventa 6/6 e riduce il nemico di 2).",
          names: ["Predatore Genetico", "Mutante Vorace", "Cacciatore di Tratti"]
        },
        {
          type: "creature", cost: 5, atk: 6, dif: 6, shift: false,
          effectCode: "mut_shaper",
          effectText: "Combattimento: Se il nemico ha almeno 2 PC più di te, scambi i tuoi PC con i suoi.",
          names: ["Scultore di Ossa", "Chimera Instabile", "Tessitore Organico"]
        },
        {
          type: "creature", cost: 6, atk: "?", dif: "?", shift: false,
          effectCode: "mut_abomination",
          effectText: "Combattimento: ATK e DIF pari agli HP persi dal nemico (20 meno HP attuali, min 4/4, max 9/9).",
          names: ["Colosso di Mercurio", "Behemoth Liquido"]
        },
        {
          type: "creature", cost: 8, atk: 8, dif: 8, shift: false,
          effectCode: "mut_primordial",
          effectText: "Combattimento: Aggiunge la metà dell'ATK e DIF nemici ai propri valori e ne copia l'effetto.",
          names: ["Progenitore del Caos", "Paziente Zero"]
        },
        // AZIONI MUTAFORMI (15)
        {
          type: "action", cost: 1, shift: true,
          effectCode: "act_mut_molt",
          effectText: "Pesca 1 carta e spia una carta avversaria (+1 PC se è Creatura). [Spostamento su 3 copie]",
          names: ["Cambio di Pelle", "Sguardo Altrui", "Istinto Adattivo", "Evoluzione Forzata"]
        },
        {
          type: "action", cost: 2, shift: false,
          effectCode: "act_mut_mindtheft",
          effectText: "La tua prossima Creatura in questo turno ottiene +2 ATK e +2 DIF copiando tratti nemici.",
          names: ["Sinapsi Rubate", "Eco del Pensiero", "Innestare Ricordi"]
        },
        {
          type: "action", cost: 2, shift: false,
          effectCode: "act_mut_balance",
          effectText: "Scegli un avversario: se hai meno HP di lui, ti curi di 2 HP e lui subisce 1 danno (altrimenti peschi 2).",
          names: ["Patto Simbiotico", "Trasfusione Forzata", "Vasi Comunicanti"]
        },
        {
          type: "action", cost: 1, shift: false,
          effectCode: "act_mut_mirror",
          effectText: "Al prossimo attacco subito nel Round, riduci il danno di 3 e peschi 1 carta.",
          names: ["Scudo di Mercurio", "Riflesso Liquido", "Mimetismo Difensivo"]
        },
        {
          type: "action", cost: 3, shift: false,
          effectCode: "act_mut_equality",
          effectText: "Scegli un avversario: i tuoi PC attuali diventano esattamente uguali ai suoi.",
          names: ["Livellamento Energetico", "Sincronia Perfetta"]
        }
      ]
    }
  },

  // 3. GENERATORE PROCEDURALE DI ARTWORK SVG UNICO PER CIASCUNA DELLE 160 CARTE
  generateUniqueCardArt(cardName, factionId, cardType) {
    let hash = 0;
    for (let i = 0; i < cardName.length; i++) {
      hash = cardName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h1 = Math.abs(hash % 360);
    const h2 = (h1 + 55) % 360;
    const cx = 30 + Math.abs((hash >> 3) % 40);
    const cy = 25 + Math.abs((hash >> 5) % 35);
    const r1 = 14 + Math.abs((hash >> 2) % 18);
    const polyPoints = `${15 + (Math.abs(hash) % 20)},75 50,${12 + (Math.abs(hash >> 4) % 25)} ${85 - (Math.abs(hash >> 2) % 20)},75`;

    const palette = {
      goblin: ["#4ade80", "#16a34a", "#dcfce7"],     // Verde
      vichinghi: ["#38bdf8", "#0284c7", "#e0f2fe"],  // Azzurro
      maghi: ["#c084fc", "#9333ea", "#f3e8ff"],      // Viola
      mutaformi: ["#f87171", "#dc2626", "#fee2e2"]   // Rosso
    }[factionId] || ["#ffffff", "#94a3b8", "#e2e8f0"];

    return `
      <svg viewBox="0 0 100 84" class="w-full h-16 rounded-xl overflow-hidden bg-black/40 border border-white/15 shrink-0">
        <defs>
          <radialGradient id="grad_${Math.abs(hash)}" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stop-color="${palette[0]}" stop-opacity="0.65"/>
            <stop offset="100%" stop-color="#090d16" stop-opacity="0.95"/>
          </radialGradient>
        </defs>
        <rect width="100" height="84" fill="url(#grad_${Math.abs(hash)})"/>
        <circle cx="${cx}" cy="${cy}" r="${r1}" fill="${palette[1]}" fill-opacity="0.35" />
        <polygon points="${polyPoints}" fill="none" stroke="${palette[2]}" stroke-width="1.6" stroke-opacity="0.7" />
        <circle cx="50" cy="42" r="${8 + (Math.abs(hash) % 10)}" fill="none" stroke="${palette[0]}" stroke-width="1.2" stroke-dasharray="4 2"/>
        ${cardType === "action" 
          ? `<path d="M25,42 Q50,${10 + (Math.abs(hash)%25)} 75,42 T25,42" fill="none" stroke="${palette[2]}" stroke-width="1.8"/>`
          : `<line x1="20" y1="${20 + (Math.abs(hash)%40)}" x2="80" y2="${60 - (Math.abs(hash)%40)}" stroke="${palette[2]}" stroke-width="1.5" stroke-opacity="0.5"/>`
        }
      </svg>
    `;
  },

  // Costruisce il mazzo completo di 40 carte uniche per una fazione
  buildDeckForFaction(factionId) {
    const faction = this.factions[factionId];
    const deck = [];
    let cardCounter = 1;

    faction.archetypes.forEach((arch) => {
      arch.names.forEach((uniqueName, idx) => {
        // Per i Mutaformi, solo le prime 3 copie di Muta Rapida hanno [Spostamento] (parità 3 carte per mazzo)
        const hasShift = arch.shift && !(factionId === "mutaformi" && idx === 3);
        deck.push({
          uid: `${factionId}_${cardCounter++}_${Math.random().toString(36).substring(2, 6)}`,
          faction: factionId,
          name: uniqueName,
          type: arch.type,
          cost: arch.cost,
          atk: arch.atk ?? null,
          dif: arch.dif ?? null,
          shift: hasShift,
          effectCode: arch.effectCode,
          effectText: arch.effectText,
          svgArt: this.generateUniqueCardArt(uniqueName, factionId, arch.type)
        });
      });
    });

    // Mescola il mazzo (Fisher-Yates Shuffle)
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }
};