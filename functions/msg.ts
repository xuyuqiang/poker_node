import { getPositionText } from "@/help";
import { getTestPlayerRealId } from "@/player";
import { getPokerListText, getPokerTypeText } from "@/poker";
import { BetType, PlayerInfo, PlayerResult, RoundInfo, RoundTypeList } from './types';

export type GetRoomInfoMsgDataParams = {
  sb: number;
  bb: number;
  per_num: number;
  rebuy: number;
}
export const getRoomInfoMsgData = ({ sb, bb, per_num, rebuy }: GetRoomInfoMsgDataParams) => {
  return {
    blind_data: `${sb}/${bb}`,
    per_num: per_num.toString(),
    rebuy: rebuy.toString(),
  }
}

// 游戏开始前的信息
/**
 * 房间信息
 * 
 * -------------------------玩家 位置 + 当前筹码数量-------------------------
 * 玩家1 BTN 100
 * 玩家2 SB  10
 * 玩家3 BB 20
 * 玩家4 CO 200
 */
export type GetPlayersMsgDataParams = {
  players: PlayerInfo[];
  btn: number;
}
export const getPlayersMsgData = ({ players, btn }: GetPlayersMsgDataParams) => {
  const len = players.length;
  const array = players.map(({ player_name, chip_count, hand_count, buyin }, i) => {
    const pos_text = getPositionText(len, btn, i);
    const income = chip_count - buyin;
    return {
      name: player_name,
      position: pos_text,
      chip_count: chip_count.toString(),
      income: income > 0 ? `+${income}` : income.toString(),
      no: (i + 1).toString(),
    }
  })
  return {
    array,
  }
}

//游戏开始后的每轮行动的信息
/**
  * 底池：100
  * 当前行动人：@某个人行动
  * -------------------------其他人信息-------------------------
  * 玩家1(BTN)：待行动
  * 玩家2(SB)：call 10
  * 玩家3：call 20
  * 玩家4：fold
  */
export type GetPlayerActionMsgDataParams = {
  pot: number;
  game_no: number;
  currentRound: RoundInfo;
};
export const getPlayerActionMsgData = ({
  pot,
  game_no,
  currentRound,
}: GetPlayerActionMsgDataParams) => {
  console.log('getPlayerActionMsgData', JSON.stringify(currentRound));
  const { player_bet_list, current_player_index } = currentRound;
  const currentPlayer = player_bet_list[current_player_index];
  const array = player_bet_list
    .map((p, i) => {
      //拼接行动信息
      let chip_count = 0;
      const action_desc = p.bet_list
        .map((a) => {
          chip_count = a.bet_before_chip - a.chip_count;
          if (a.play_action_type === BetType.WAIT) {
            return i === current_player_index ? 'Doing' : 'Waiting';
          } else if (a.play_action_type === BetType.BB || a.play_action_type === BetType.SB) {
            return `${a.play_action_type}  ${a.chip_count}`;
          } else if (a.play_action_type === BetType.CALL || a.play_action_type === BetType.RAISE || a.play_action_type === BetType.ALLIN) {
            return `${a.play_action_type} to ${a.max_chip_count}`;
          } else {
            return a.play_action_type
          }
        }).join(' / ')
      return {
        name: p.player_name,
        position: p.pos_text,
        action: action_desc,
        chip_count,
      };
    })
  const pokers_text =
    currentRound.public_poker && currentRound.public_poker.length > 0
      ? getPokerListText(currentRound.public_poker)
      : '无';
  return {
    pot,
    no: game_no.toString(),
    round_text: RoundTypeList[currentRound.round_type],
    user_id: getTestPlayerRealId(currentPlayer.player_id),
    user_name: currentPlayer.player_name,
    array,
    pokers_text,
  };
};

export type GetGameResultMsgDataParams = {
  pot: number;
  game_no: number;
  currentRound: RoundInfo;
  playerResult: { [key: string]: PlayerResult } //每个玩家的收益
};
export const getGameResultMsgData = ({
  pot,
  game_no,
  currentRound,
  playerResult
}: GetGameResultMsgDataParams) => {
  const { player_bet_list, public_poker } = currentRound;
  let winner = '';
  const array = player_bet_list.map(({ player_id, player_name, pos_text, bet_list }) => {
    const { income, is_win, result_chip_count, hand_pokers, result_poker_type } = playerResult[player_id];
    if (is_win) {
      winner = player_name;
    }
    //判断最后是弃牌吗
    const is_fold = bet_list.some((b) => b.play_action_type === BetType.FOLD);
    //拼接结果文案
    let result = is_win ? '赢' : (is_fold ? '弃' : '输');
    if (hand_pokers && hand_pokers.length > 0 && result_poker_type) {
      result += `    (${getPokerListText(hand_pokers)} / ${getPokerTypeText(result_poker_type)})`;
    }
    return {
      name: player_name,
      position: pos_text,
      income: income > 0 ? `+${income}` : income.toString(),
      chip_count: result_chip_count,
      result,
    };
  });
  const pokers_text = public_poker ? getPokerListText(public_poker) : '无';
  return {
    pot,
    no: game_no.toString(),
    array,
    pokers_text,
    winner,
  };
}

export type GetRoomStatusMsgDataParams = {
  title: string;
  sb: number;
  bb: number;
  per_num: number;
  rebuy: number;
  game_count: number;
  players: PlayerInfo[];
}
export const getRoomStatusMsgData = ({ title, sb, bb, per_num, rebuy, game_count, players }: GetRoomStatusMsgDataParams) => {
  const array = players.map(({ player_name, chip_count, buyin }, i) => {
    const income = chip_count - buyin;
    return {
      name: player_name,
      chip_count: chip_count.toString(),
      income: income > 0 ? `+${income}` : income.toString(),
    }
  });
  return {
    title,
    blind_data: `${sb}/${bb}`,
    per_num: per_num.toString(),
    rebuy: rebuy.toString(),
    game_count: game_count.toString(),
    array,
  }
}