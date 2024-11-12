import {
  sendCardMsg,
} from '@/fstools';
import {
  genPosInfoList,
  getNextIndex,
  sendPlayerMsg,
} from '@/player';
import { ConfigKey, findBBIndex, findSBIndex, getConfigValue } from '@/help';
import { createPokerList, dealPoker, getPokerText } from '@/poker';
import {
  getPlayerActionMsgData,
  getPlayersMsgData,
  getRoomInfoMsgData,
} from '@/msg';
import { BetType, GameInfo, GameStatus, PlayerBetInfo, PlayerInfo, PokerInfo, RoundInfo, RoundType } from './types';

// -----------  业务函数  ------------

//创建游戏
type CreateGameParams = {
  room_id: string;
  player_ids: string[];
  sb: number;
  bb: number;
  btn: number;
  chat_id: string;
  game_no: number;
  rebuy: number;
  players: PlayerInfo[];
};
export const createGame = async ({
  room_id,
  player_ids,
  sb = 0,
  bb = 0,
  btn = 0,
  chat_id,
  game_no = 1,
  rebuy, //重购
  players,
}: CreateGameParams): Promise<GameInfo> => {
  if (!player_ids || player_ids.length < 2) {
    throw new Error('no ready player');
  }
  if (sb <= 0 || bb <= 0) {
    throw new Error('sb or bb is less than 0');
  }
  console.log('[createGame]', player_ids);
  const pokerList: PokerInfo[] = createPokerList();
  const playerCount = players.length;
  const sendData = {
    no: game_no.toString(),
    ...getRoomInfoMsgData({
      sb,
      bb,
      per_num: playerCount,
      rebuy: rebuy || 0,
    }),
    ...getPlayersMsgData({
      players,
      btn,
    }),
  };
  console.log('sendData', sendData);
  await sendCardMsg({
    chat_id,
    template_id: getConfigValue(ConfigKey.CARD_READY_GAME),
    data: sendData,
  });
  const playerDict = dealPoker({
    players,
    btn,
    pokerList,
  });
  console.log('发牌情况', playerDict);
  //存储牌信息
  // await storePoker(playerDict, gameInfo.game_id, pokerList);
  //给每个人发送底牌信息
  for (const player_id of player_ids) {
    const p = playerDict[player_id];
    await sendPlayerMsg({
      player_id,
      chat_id,
      text: `第${game_no}局的底牌：\n${getPokerText(p[0])},${getPokerText(
        p[1]
      )}`,
    });
  }

  //开始扣除大小盲信息进入底池
  const sbPlayer = players[findSBIndex(playerCount, btn)];
  const bbIndex = findBBIndex(playerCount, btn);
  const bbPlayer = players[bbIndex];
  sbPlayer.chip_count -= sb;
  bbPlayer.chip_count -= bb;
  const pot = sb + bb;

  //3.更新当前行动人信息
  //保存信息：玩家id，下注动作，下注数量
  //按顺序执行玩家的行动路线
  const posInfoList = genPosInfoList({ playerCount, btn });
  const playerActionList: PlayerBetInfo[] = players.map((p, i) => {
    const action_type =
      p.player_id === sbPlayer.player_id
        ? BetType.SB
        : p.player_id === bbPlayer.player_id
          ? BetType.BB
          : BetType.WAIT;
    const chip_count =
      p.player_id === sbPlayer.player_id
        ? sb
        : p.player_id === bbPlayer.player_id
          ? bb
          : 0;
    return {
      player_id: p.player_id,
      bet_list: [
        {
          play_action_type: action_type,
          chip_count,
          create_time: Date.now(),
          max_chip_count: bb,
          bet_before_chip: p.chip_count + chip_count,
        },
        {
          play_action_type: BetType.WAIT,
          chip_count: 0,
          create_time: Date.now(),
          max_chip_count: bb,
          bet_before_chip: p.chip_count,
        },
      ],
      player_name: p.player_name,
      pos_text: posInfoList[i],
    };
  });
  const currentActionPlayerIndex = getNextIndex(playerCount, bbIndex);
  //Preflop阶段
  const round_list: RoundInfo[] = [];
  round_list.push({
    round_type: RoundType.PREFLOP,
    player_bet_list: playerActionList,
    current_player_index: currentActionPlayerIndex,
    current_max_chips: bb,
  });

  const gameInfo: GameInfo = {
    player_ids,
    btn,
    room_id,
    blind_data: `${sb},${bb}`,
    status: GameStatus.PLAYING,
    pot,
    game_no,
    chat_id,
    pokers: pokerList,
    player_pokers: playerDict,
    rebuy,
    round_list,
  }

  //4.发送消息
  await sendCardMsg({
    chat_id,
    template_id: getConfigValue(ConfigKey.CARD_PLAY_ACTION),
    data: getPlayerActionMsgData({
      pot,
      game_no,
      currentRound: round_list[round_list.length - 1],
    }),
  });

  return gameInfo;
};
