// Rounds: buy, live, end, and the match. First to 7 round wins takes the match (max 13
// rounds). Attackers win by elimination or detonation; defenders by elimination, defuse
// or the clock. The spike carrier plants by holding E inside a site; defenders defuse by
// holding E beside a planted spike.
import { SITES } from './world.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const END_SECONDS = 4;
export const WIN_ROUNDS = 7;
export const MAX_ROUNDS = 13;

export function createRounds(combat, economy, hooks) {
  const state = {
    phase: 'buy',
    round: 1,
    wins: { vanguard: 0, cinder: 0 },
    timer: BUY_SECONDS,
    winner: null,
    reason: '',
    matchOver: false,
    plantSite: null,
  };

  function siteAt(x, z) {
    for (const site of SITES) {
      if (Math.abs(x - site.center[0]) <= site.half[0] && Math.abs(z - site.center[1]) <= site.half[1]) return site;
    }
    return null;
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.phase = 'end';
    state.timer = END_SECONDS;
    state.winner = winner;
    state.reason = reason;
    state.wins[winner] += 1;
    economy.roundEnd(winner === 'vanguard');
    hooks.onRoundEnd?.(winner, reason, { ...state.wins });
    if (state.wins[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.matchOver = true;
    }
  }

  function nextRound() {
    state.round += 1;
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.winner = null;
    state.reason = '';
    state.plantSite = null;
    hooks.onRoundStart?.(state.round);
  }

  function step(dt, ctx) {
    // ctx: { playerAlive, vanguardAlive, cinderAlive, spike, planting, defusing, playerPos }
    if (state.phase === 'match') return;
    state.timer -= dt;

    if (state.phase === 'buy') {
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        hooks.onLive?.();
      }
      return;
    }

    if (state.phase === 'live') {
      // Plant/defuse progress is driven by main.js (the player) and bots.js (a bot
      // carrier, the defusing Cinder bot); this machine only reads the spike's state.
      if (combat.spike.state === 'detonated') {
        endRound('vanguard', 'Spike detonated at site ' + (combat.spike.site?.key || ''));
        return;
      }
      if (combat.spike.state === 'defused') {
        endRound('cinder', 'Spike defused');
        return;
      }
      if (ctx.cinderAlive === 0) {
        endRound('vanguard', 'Cinder team eliminated');
        return;
      }
      if (ctx.vanguardAlive === 0) {
        endRound('cinder', 'Vanguard team eliminated');
        return;
      }
      if (combat.spike.state === 'planted') {
        // The fuse is the clock now; the round timer stops mattering.
        if (state.timer <= 0) state.timer = 0.01;
        return;
      }
      if (state.timer <= 0) {
        endRound('cinder', 'Time expired — spike never planted');
      }
      return;
    }

    if (state.phase === 'end') {
      if (state.timer <= 0) {
        if (state.matchOver) {
          state.phase = 'match';
          hooks.onMatchEnd?.(state.wins.vanguard > state.wins.cinder ? 'vanguard' : 'cinder', { ...state.wins });
        } else {
          nextRound();
        }
      }
    }
  }

  function reset() {
    state.phase = 'buy';
    state.round = 1;
    state.wins = { vanguard: 0, cinder: 0 };
    state.timer = BUY_SECONDS;
    state.winner = null;
    state.reason = '';
    state.matchOver = false;
    state.plantSite = null;
  }

  return { state, step, endRound, reset, siteAt };
}
