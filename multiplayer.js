/* ============================================================================
   FAZIONI — MODULO MULTIPLAYER ONLINE (SUPABASE REALTIME)
   ============================================================================ */

const Multiplayer = {
  client: null,
  channel: null,
  isHost: false,
  myPlayerIndex: 0,

  // Inizializza il client Supabase (sostituisci con i tuoi dati gratuiti da app.supabase.com)
  init() {
    const SUPABASE_URL = "https://TUO-PROGETTO.supabase.co";
    const SUPABASE_ANON_KEY = "TUA_ANON_KEY_PUBBLICA";
    
    if (typeof supabase !== 'undefined' && SUPABASE_URL.includes("http")) {
      this.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  },

  // Crea o entra in una stanza
  async joinRoom(roomCode, playerData) {
    GameState.roomCode = roomCode;
    
    if (!this.client) {
      // Modalità Simulazione Locale a 4 giocatori se Supabase non è configurato
      UI.setBanner(`Stanza ${roomCode} creata in modalità locale multi-dispositivo simulata.`);
      return;
    }

    this.channel = this.client.channel(`room_${roomCode}`, {
      config: { broadcast: { self: false } }
    });

    this.channel
      .on('broadcast', { event: 'game_action' }, ({ payload }) => {
        this.handleRemoteAction(payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Traccia la presenza dei giocatori nella stanza
          await this.channel.track({ player: playerData, joinedAt: new Date() });
        }
      });
  },

  // Invia un'azione di gioco agli altri 3 dispositivi
  sendAction(actionType, data) {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'game_action',
      payload: { type: actionType, sender: GameState.activePlayerIndex, ...data }
    });
  },

  handleRemoteAction(payload) {
    switch (payload.type) {
      case 'SYNC_STATE':
        Object.assign(GameState, payload.state);
        UI.renderTable();
        break;
      case 'PLAY_CARD':
        Engine.resolveCombat(payload.attackerIdx, payload.defenderIdx, payload.card);
        break;
      case 'PASS_TURN':
        Engine.executePassTurn(payload.playerIdx);
        break;
      default:
        break;
    }
  }
};