// Rounds and money: a match is first to 5 round wins (at most 9 rounds). Each round
// opens with a 6-second buy freeze, runs 100 seconds live, then ends on elimination,
// detonation, defusal or the timer. Winners take $325, losers $190, a kill pays $300
// and a plant or defusal $300. Bots buy for themselves: a rifle when they can afford
// one, an SMG otherwise, armour when rich.
import { WEAPONS } from './weapons.js';

export const BUY_TIME = 6;
export const ROUND_TIME = 100;
export const END_TIME = 4;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const WIN_MONEY = 325;
export const LOSS_MONEY = 190;
export const KILL_MONEY = 300;
export const OBJECTIVE_MONEY = 300;

export function createRounds() {
  const rounds = {
    number: 0,
    phase: 'buy',
    phaseTime: BUY_TIME,
    timer: ROUND_TIME,
    score: { vanguard: 0, sentinel: 0 },
    endReason: '',
    winner: null,
    matchOver: false,
  };

  function botBuys(bot) {
    const money = bot.money;
    if (money >= WEAPONS.rifle.price && bot.weaponId !== 'rifle') {
      bot.money -= WEAPONS.rifle.price;
      return 'rifle';
    }
    if (money >= WEAPONS.smg.price && bot.weaponId === 'pistol') {
      bot.money -= WEAPONS.smg.price;
      return 'smg';
    }
    return bot.weaponId;
  }

  rounds.startMatch = function startMatch() {
    rounds.number = 0;
    rounds.score.vanguard = 0;
    rounds.score.sentinel = 0;
    rounds.winner = null;
    rounds.matchOver = false;
    rounds.phase = 'buy';
    rounds.phaseTime = BUY_TIME;
    rounds.timer = ROUND_TIME;
  };
  rounds.startRound = function startRound() {
    rounds.number += 1;
    rounds.phase = 'buy';
    rounds.phaseTime = BUY_TIME;
    rounds.timer = ROUND_TIME;
    rounds.endReason = '';
    rounds.winner = null;
  };
  rounds.beginLive = function beginLive() {
    rounds.phase = 'live';
  };
  rounds.endRound = function endRound(winner, reason) {
    rounds.phase = 'end';
    rounds.phaseTime = END_TIME;
    rounds.winner = winner;
    rounds.endReason = reason;
    rounds.score[winner] += 1;
    if (rounds.score[winner] >= WIN_ROUNDS || rounds.number >= MAX_ROUNDS) {
      rounds.matchOver = true;
    }
  };
  rounds.buyForBot = function buyForBot(bot) {
    return botBuys(bot);
  };
  rounds.awardMoney = function awardMoney(wallets, winner, kills, planters, defusers) {
    for (const wallet of wallets) {
      let gain = wallet.team === winner ? WIN_MONEY : LOSS_MONEY;
      gain += (kills[wallet.id] || 0) * KILL_MONEY;
      if (planters.includes(wallet.id)) gain += OBJECTIVE_MONEY;
      if (defusers.includes(wallet.id)) gain += OBJECTIVE_MONEY;
      wallet.money += gain;
    }
  };
  rounds.canBuy = function canBuy(playerMoney, price) {
    return playerMoney >= price;
  };

  return rounds;
}
