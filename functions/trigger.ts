import {
  createGame,
} from '@/game';
import { getGameResultMsgData, getPlayerActionMsgData, getRoomStatusMsgData } from '@/msg';
import {
  comparePokerType,
  getMaxPokerType,
  getPokerListText,
  getPokerTypeText,
  randomPokerList,
} from '@/poker';
import { RobotAction, RoomInfo, RoomStatus, TriggerActionOption } from '@/types';
import { ConfigKey, getConfigValue } from '@/help';
import { findRunningRoomInfo, updateRoomInfo } from '@/room';
import { createCardInfo, sendCardMsg } from '@/fstools';
import { BetInfo, BetType, GameInfo, GameStatus, PlayerBetInfo, PlayerResult, PokerInfo, PokerTypeInfo, RoundInfo, RoundType } from './types';

export const handleTrigger = async (
  actionInfo: RobotAction<TriggerActionOption>
): Promise<TriggerResponse> => {
  console.log('handleTrigger', actionInfo);
  try {
    const res = await _handleTrigger(actionInfo);
    return {
      toast: {
        type: 'success',
        content: '执行成功',
      },
      card: res,
    }
  } catch (error: any) {
    console.error(error);
    return {
      toast: {
        type: 'error',
        content: error.message,
      },
    };
  }
};

const _handleTrigger = async (actionInfo: RobotAction<TriggerActionOption>) => {
  //校验value和tag是否正确
  const {
    content_value,
    value,
    tag,
    chat_id = '',
    trigger_user_id,
  } = actionInfo.options || {};
  const create_time = actionInfo.create_time;
  if (!value || !tag) {
    throw new Error('value和tag不能为空');
  }
  const roomInfo = await findRunningRoomInfo(chat_id);
  const gameInfo = roomInfo?.current_game;
  if (!gameInfo) {
    throw new Error('游戏不存在');
  }
  //判断时间是否大于消息时间
  if ((gameInfo.update_time || 0) > create_time) {
    throw new Error('不能进行操作了');
  }

  //截取时间戳
  //call-20241109101010
  const values = value.split('-');
  const action = values[0];
  const timestamp = Number(values[1]);
  if (timestamp && timestamp <= ((roomInfo.update_time || 0) - 2000)) {
    console.log(`卡片已过期,${timestamp},${roomInfo.update_time}`);
    throw new Error("卡片已过期");
  }
  //判断是否是当前用户
  const need_user_id = ['call', 'check', 'fold', 'allin', 'raise', 'raise_ratio'];
  const round = gameInfo.round_list[gameInfo.round_list.length - 1];
  const currentPlayer = round.player_bet_list[round.current_player_index];
  if (need_user_id.includes(action) && currentPlayer.player_id !== trigger_user_id) {
    throw new Error('不是你的回合');
  }

  if (action === 'call') {
    return handleCall(roomInfo);
  } else if (action === 'check') {
    return handleCheck(roomInfo);
  } else if (action === 'fold') {
    return handleFold(roomInfo);
  } else if (action === 'allin') {
    return handleAllin(roomInfo);
  } else if (action === 'refresh') {
    return handleRefresh(roomInfo);
  } else if (action === 'raise_ratio') {
    return handleRaiseRatio(roomInfo, content_value);
  } else if (action === 'raise') {
    return handleRaise(roomInfo, content_value);
  } else if (action === 'next') {
    return handleNextGame(roomInfo);
  } else if (action === 'over') {
    return handleRoomOver(roomInfo);
  }
};

const handleFold = async (roomInfo: RoomInfo) => {
  //玩家弃牌
  //获取游戏数据
  const gameInfo = roomInfo.current_game;
  const player_list = roomInfo.player_list;
  if (!gameInfo || !player_list) {
    throw new Error('游戏数据异常');
  }
  const { round_list } = gameInfo;
  const round = round_list[round_list.length - 1];
  console.log('当前回合信息', round);
  //判断还有多少行动人
  //玩家剩余筹码数量
  const playerAction = round.player_bet_list[round.current_player_index];
  const { player_id } = playerAction;
  const playerInfo = player_list.find((a) => a.player_id === player_id);
  if (!playerInfo) {
    throw new Error('玩家不存在');
  }
  const current_chip_count = playerInfo.chip_count;
  const wait_player_list = updateCurrentPlayerAction(round, {
    play_action_type: BetType.FOLD,
    chip_count: 0,
    create_time: Date.now(),
    bet_before_chip: current_chip_count,
    max_chip_count: round.current_max_chips,
  });

  if (wait_player_list.length === 0 || wait_player_list.length === 1) {
    //结束本轮
    return goGameOver(roomInfo);
  }
  await updateRoomInfo(roomInfo);
  return getGamePlayingCardInfo(gameInfo);
};

const handleCall = async (roomInfo: RoomInfo) => {
  //获取游戏数据
  const { current_game, player_list } = roomInfo;
  if (!current_game || !player_list) {
    throw new Error('游戏数据异常');
  }
  const { round_list } = current_game;
  //找到当前行动人，已经投注金额，然后计算还需要投入
  const round = round_list[round_list.length - 1];
  const playerAction = round.player_bet_list[round.current_player_index];
  const { player_id, bet_list } = playerAction;
  //已经下的注
  const chip_count = bet_list.reduce((a, b) => a + b.chip_count, 0);
  const need_chips = round.current_max_chips - chip_count;
  //玩家剩余筹码数量
  const playerInfo = player_list.find((a) => a.player_id === player_id);
  if (!playerInfo) {
    throw new Error('玩家不存在');
  }
  const current_chip_count = playerInfo.chip_count;
  const isAllin = need_chips >= current_chip_count;
  const play_action_type = isAllin ? BetType.ALLIN : BetType.CALL;
  const onlyChips_count = isAllin ? current_chip_count : need_chips;

  //更新底池
  current_game.pot += onlyChips_count;

  playerInfo.chip_count -= onlyChips_count;

  //更新当前行动人信息
  const wait_player_list = updateCurrentPlayerAction(round, {
    play_action_type,
    chip_count: onlyChips_count,
    create_time: Date.now(),
    bet_before_chip: current_chip_count,
    max_chip_count: isAllin
      ? chip_count + current_chip_count
      : round.current_max_chips,
  });

  if (wait_player_list.length === 0) {
    if (round.round_type === RoundType.RIVER) {
      //这个会更新游戏信息
      return goGameOver(roomInfo);
    } else {
      //下回合
      startNextRound({ gameInfo: current_game });
    }
  }
  await updateRoomInfo(roomInfo);
  return getGamePlayingCardInfo(current_game);
};

const handleCheck = async (roomInfo: RoomInfo) => {
  //获取游戏数据
  const gameInfo = roomInfo.current_game;
  if (!gameInfo) {
    throw new Error('游戏数据异常');
  }
  const { round_list } = gameInfo;
  //当前回合的最高值是多少，你是否可以check
  const round = round_list[round_list.length - 1];
  const playerActionInfo = round.player_bet_list[round.current_player_index];
  if (!playerActionInfo) {
    throw new Error('玩家行动信息不存在');
  }
  const bet_list = playerActionInfo.bet_list;
  //已经下的注
  const chip_count = bet_list.reduce((a, b) => a + b.chip_count, 0);
  if (chip_count < round.current_max_chips) {
    throw new Error('不能check');
  }
  const lastBet = bet_list[bet_list.length - 1];
  //更新当前行动人信息
  const wait_player_list = updateCurrentPlayerAction(round, {
    play_action_type: BetType.CHECK,
    chip_count: 0,
    create_time: Date.now(),
    bet_before_chip: lastBet.bet_before_chip + lastBet.chip_count,
    max_chip_count: round.current_max_chips,
  });

  if (wait_player_list.length === 0) {
    if (round.round_type === RoundType.RIVER) {
      console.log('游戏结束，进行比较大小 --- 进行游戏结束');
      //结束游戏
      return goGameOver(roomInfo);
    } else {
      //开始新一轮
      startNextRound({ gameInfo });
    }
  } else {
    console.log('当前玩家check，下一个玩家开始行动');
  }
  await updateRoomInfo(roomInfo);
  return getGamePlayingCardInfo(gameInfo);
};

const handleRaiseRatio = async (roomInfo: RoomInfo, content?: string) => {
  if (!content) {
    throw new Error('加注比例不能为空');
  }
  const raise_ratio = parseInt(content);
  const pot = roomInfo.current_game?.pot || 0;
  const raise_chip = Math.floor(pot * (1 / raise_ratio));
  return handleRaise(roomInfo, raise_chip.toString());
}

const handleRaise = async (roomInfo: RoomInfo, content?: string) => {
  if (!content) {
    throw new Error('加注金额不能为空');
  }
  //提取加注金额
  const gameInfo = roomInfo.current_game;
  const player_list = roomInfo.player_list;
  if (!gameInfo || !player_list) {
    throw new Error('游戏数据异常');
  }
  const raise_chip = parseInt(content);
  if (!raise_chip || raise_chip <= 0) {
    throw new Error('加注金额错误');
  }
  //获取玩家信息
  const { round_list } = gameInfo;
  const round = round_list[round_list.length - 1];
  const current_max_chips = round.current_max_chips;
  if (raise_chip < current_max_chips * 2) {
    throw new Error('加注必须是2倍及以上');
  }
  const playerAction = round.player_bet_list[round.current_player_index];
  const { player_id, bet_list } = playerAction;
  //已经下的注
  const chip_count = bet_list.reduce((a, b) => a + b.chip_count, 0);
  const need_chips = raise_chip - chip_count;
  //玩家剩余筹码数量
  const playerInfo = player_list.find((a) => a.player_id === player_id);
  if (!playerInfo) {
    throw new Error('玩家不存在');
  }
  const current_chip_count = playerInfo.chip_count;
  if (need_chips > current_chip_count) {
    throw new Error('筹码不足');
  }
  //更新底池
  gameInfo.pot += need_chips;
  playerInfo.chip_count -= need_chips;
  //更新当前行动人信息
  round.current_max_chips = raise_chip;
  const play_action_type =
    need_chips === current_chip_count ? BetType.ALLIN : BetType.RAISE;
  updateCurrentPlayerAction(
    round,
    {
      play_action_type: play_action_type,
      chip_count: need_chips,
      max_chip_count: raise_chip,
      create_time: Date.now(),
      bet_before_chip: current_chip_count,
    },
    true
  );

  await updateRoomInfo(roomInfo);
  return getGamePlayingCardInfo(gameInfo);
};

const handleAllin = async (roomInfo: RoomInfo) => {
  const gameInfo = roomInfo.current_game;
  const player_list = roomInfo.player_list;
  if (!gameInfo || !player_list) {
    throw new Error('游戏数据异常');
  }
  const { round_list } = gameInfo;
  const round = round_list[round_list.length - 1];
  const playerAction = round.player_bet_list[round.current_player_index];
  const { player_id, bet_list } = playerAction;
  //已经下注
  const chip_count = bet_list.reduce((a, b) => a + b.chip_count, 0);
  const playerInfo = player_list.find((a) => a.player_id === player_id);
  if (!playerInfo) {
    throw new Error('玩家不存在');
  }
  const current_chip_count = playerInfo.chip_count;
  const total_chip_count = current_chip_count + chip_count;
  //如果大于当前最大值，表示加注
  const isUpdateAfterPlayer = total_chip_count > round.current_max_chips;
  //更新底池
  gameInfo.pot += current_chip_count;
  if (isUpdateAfterPlayer) {
    round.current_max_chips = total_chip_count;
  }

  playerInfo.chip_count -= current_chip_count;

  //更新当前行动人信息
  const wait_player_list = updateCurrentPlayerAction(
    round,
    {
      play_action_type: BetType.ALLIN,
      chip_count: current_chip_count,
      create_time: Date.now(),
      bet_before_chip: current_chip_count,
      max_chip_count: total_chip_count,
    },
    isUpdateAfterPlayer
  );

  if (wait_player_list.length === 0) {
    if (round.round_type === RoundType.RIVER) {
      return goGameOver(roomInfo);
    } else {
      //下回合
      startNextRound({ gameInfo });
    }
  }
  await updateRoomInfo(roomInfo);
  return getGamePlayingCardInfo(gameInfo);
};

const handleRefresh = async (roomInfo: RoomInfo) => {
  const gameInfo = roomInfo.current_game;
  if (!gameInfo) {
    throw new Error('游戏数据异常');
  }
  if (gameInfo.status === GameStatus.END) {
    return createCardInfo({
      template_id: getConfigValue(ConfigKey.CARD_GAME_RESULT),
      data: getGameResultMsgData({
        pot:gameInfo.pot,
        game_no: gameInfo.game_no,
        currentRound: gameInfo.round_list[gameInfo.round_list.length - 1],
        playerResult:gameInfo.player_result,
      }),
    });
  }
  return getGamePlayingCardInfo(gameInfo);
}

const handleNextGame = async (roomInfo: RoomInfo) => {
  console.log('【处理下一局】');
  if (!roomInfo) {
    throw new Error('找不到房间信息');
  }
  const { room_id, chat_id, ready_player_ids = [], sb = 0, bb = 0, per_num = 0, rebuy = 0, player_list, current_game } = roomInfo;
  if (!player_list || !current_game) {
    throw new Error('游戏数据异常');
  }
  //判断是否可以下一局
  if (current_game?.status !== GameStatus.END) {
    throw new Error('游戏还在进行中，不能开始下一局');
  }
  //开始下一局 , 获取最后一局的btn等信息
  const btn = (current_game.btn + 1) % ready_player_ids.length;
  //判断玩家筹码是否充足，否则不能开始下一局 ，TODO：多人桌，有人下桌情况
  const isCanNext = player_list?.every((ii) => ii.chip_count >= bb);
  if (!isCanNext) {
    await sendCardMsg({
      chat_id,
      template_id: getConfigValue(ConfigKey.CARD_ROOM_STATUS),
      data: getRoomStatusMsgData({
        title: '游戏无法进行，玩家筹码低于最小盲注，需要补充，或者下桌',
        sb,
        bb,
        per_num,
        rebuy,
        game_count: current_game.game_no,
        players: player_list,
      }),
    })
    throw new Error('玩家筹码不足，不能开始下一局');
  }
  const gameInfo = await createGame({
    chat_id,
    room_id,
    player_ids: ready_player_ids,
    sb,
    bb,
    btn,
    game_no: current_game.game_no + 1,
    rebuy,
    players: player_list,
  });
  //更新房间信息
  await updateRoomInfo({
    room_id,
    status: RoomStatus.PLAYING,
    current_game: gameInfo,
    last_game: current_game,
    player_list,
  });
}

const handleRoomOver = async (roomInfo: RoomInfo) => {
  const gameInfo = roomInfo.current_game;
  if (gameInfo?.status !== GameStatus.END) {
    throw new Error('游戏还在进行中,不能结束');
  }

  const { sb = 0, bb = 0, per_num = 0, rebuy = 0 } = roomInfo;
  const players = roomInfo.player_list;
  if (!players) {
    throw new Error('玩家信息不存在');
  }

  //结束房间
  await updateRoomInfo({
    room_id: roomInfo.room_id,
    status: RoomStatus.END,
    last_game: gameInfo,
  });
  return createCardInfo({
    template_id: getConfigValue(ConfigKey.CARD_ROOM_STATUS),
    data: getRoomStatusMsgData({
      title: '游戏结果',
      sb,
      bb,
      per_num: per_num,
      rebuy: rebuy,
      game_count: gameInfo.game_no || 0,
      players,
    }),
  })
}

//更新当前行人信息
export function updateCurrentPlayerAction(
  round: RoundInfo,
  bet_info: BetInfo,
  update_after_player = false
) {
  const { player_bet_list } = round;
  //直接找下一个行动人
  let index = round.current_player_index;
  const current_max_chips = round.current_max_chips;
  //更新当前回合最大下注, 以及是否更新后面的玩家补给砝码
  //更新当前行动人信息
  const player_action = player_bet_list[index];
  player_action.bet_list.pop();
  player_action.bet_list.push(bet_info);
  let next = (index + 1) % player_bet_list.length;
  const wait_player_list: PlayerBetInfo[] = [];
  while (next !== index) {
    const next_player = player_bet_list[next];
    //更新所有玩家信息，等待行动
    if (update_after_player === true) {
      const lastBet = next_player.bet_list[next_player.bet_list.length - 1];
      if (
        lastBet.play_action_type !== BetType.FOLD &&
        lastBet.play_action_type !== BetType.ALLIN &&
        lastBet.play_action_type !== BetType.WAIT
      ) {
        next_player.bet_list.push({
          play_action_type: BetType.WAIT,
          chip_count: 0,
          max_chip_count: current_max_chips,
          create_time: Date.now(),
          bet_before_chip: lastBet.bet_before_chip - lastBet.chip_count,
        });
      }
    }
    if (next_player.bet_list.find((a) => a.play_action_type === BetType.WAIT)) {
      wait_player_list.push(next_player);
    }
    next = (next + 1) % player_bet_list.length;
  }
  console.log('查找未行动玩家', wait_player_list);
  if (wait_player_list && wait_player_list.length > 0) {
    const next_player_index = round.player_bet_list.findIndex(
      (a) => a.player_id === wait_player_list[0].player_id
    );
    round.current_player_index = next_player_index;
  }
  return wait_player_list;
}

type StartNextRoundParams = {
  gameInfo: GameInfo;
};
function startNextRound({ gameInfo }: StartNextRoundParams) {
  const { round_list, btn, pokers } = gameInfo;
  const round = round_list[round_list.length - 1];
  const { player_bet_list } = round;
  const public_poker_count = round.round_type === RoundType.PREFLOP ? 3 : 1;
  const rPokerList = randomPokerList(pokers, public_poker_count);
  const public_poker = (round.public_poker || []).concat(rPokerList); //合并上一次公共牌
  const current_player_index = (btn + 1) % player_bet_list.length;
  //进行下一轮
  //获取btn下一位行动人
  round_list.push({
    public_poker: public_poker,
    round_type: round.round_type + 1,
    player_bet_list: round.player_bet_list.map((a) => {
      const lastBet = a.bet_list[a.bet_list.length - 1];
      return {
        ...a,
        bet_list: [
          {
            play_action_type: BetType.WAIT,
            chip_count: 0,
            create_time: Date.now(),
            max_chip_count: round.current_max_chips,
            bet_before_chip: lastBet.bet_before_chip - lastBet.chip_count,
          },
        ],
      };
    }),
    current_max_chips: 0,
    current_player_index,
  });
  gameInfo.round_list = round_list;
  gameInfo.pokers = pokers;
}

function getGamePlayingCardInfo(gameInfo: GameInfo) {
  const currentRound = gameInfo.round_list[gameInfo.round_list.length - 1];
  return createCardInfo({
    template_id: getConfigValue(ConfigKey.CARD_PLAY_ACTION),
    data: getPlayerActionMsgData({
      pot: gameInfo.pot,
      game_no: gameInfo.game_no,
      currentRound: currentRound,
    }),
  });
}

//开始计算游戏胜利者 ，返回多个胜利者，用于分享pot
function getWinner(gameInfo: GameInfo): {
  player_id: string;
  type?: PokerTypeInfo; //如果不返回type，表示没有摊牌
}[] {
  //winner_id 是多少
  const { round_list, player_pokers = {} } = gameInfo;
  const round = round_list[round_list.length - 1];
  const public_poker = round.public_poker as PokerInfo[];
  const player_bet_list = round.player_bet_list;
  //获取所有没有弃牌的玩家手牌
  const players = player_bet_list.filter((a) => {
    return !a.bet_list.find((b) => b.play_action_type === BetType.FOLD);
  });
  const foldPlayers = getFoldPlayerList(round_list);
  if (players.length === 1) {
    return [
      {
        player_id: players[0].player_id,
      },
      ...foldPlayers.map((a) => ({ player_id: a.player_id })),
    ];
  } else if (players.length === 0) {
    throw new Error('没有玩家可以比较');
  }
  //计算每个玩家的最大牌型
  const playerPokerList = players.map((a) => {
    const player_id = a.player_id;
    const player_poker = player_pokers[player_id];
    return {
      player_id,
      poker: player_poker.concat(public_poker),
    };
  });

  //计算每个玩家的最大牌型
  const playerPokerTypeList = playerPokerList.map((a) => {
    const t = getMaxPokerType(a.poker);
    console.log(
      '玩家牌型',
      a.player_id,
      getPokerListText(a.poker),
      getPokerTypeText(t),
      getPokerListText(t.poker_list)
    );
    return {
      player_id: a.player_id,
      type: t,
    };
  });
  //排序
  playerPokerTypeList.sort((a, b) => {
    return comparePokerType(b.type, a.type);
  });

  //再加上弃牌玩家
  return [
    ...playerPokerTypeList,
    ...foldPlayers.map((a) => ({ player_id: a.player_id })),
  ];
}

//游戏结束
export async function goGameOver(roomInfo: RoomInfo) {
  console.log('goGameOver');
  //计算结算信息
  const gameInfo = roomInfo.current_game;
  const player_list = roomInfo.player_list;
  if (!gameInfo || !player_list) {
    throw new Error('游戏数据异常');
  }
  const winner_list = getWinner(gameInfo);
  console.log('goGameOver - winner_list', winner_list);
  const winner_id = winner_list[0].player_id;
  const is_showdown = !!winner_list[0].type; //是否摊牌，如果是摊牌，需要展示最后玩家的手牌
  const {
    player_ids,
    round_list,
    pot,
    player_pokers = {},
  } = gameInfo;
  //遍历所有行动玩家的行动信息
  const playerResult: { [key: string]: PlayerResult } = {};
  const lastRound = round_list[round_list.length - 1];
  const public_poker = lastRound.public_poker || [];
  let totalPot = pot; //用于统计边池

  //计算每个玩家的收益
  const playerIncome: { [key: string]: number } = {};
  const playerFoldResult: { [key: string]: boolean } = {};
  const playerResultChipCount: { [key: string]: number } = {};
  round_list.forEach((round, roundIndex) => {
    const isLastRound = roundIndex === round_list.length - 1;
    round.player_bet_list.forEach(({ bet_list, player_id }) => {
      const income = bet_list.reduce((a, b) => a + b.chip_count, 0);
      const isFold = bet_list.some((a) => a.play_action_type === BetType.FOLD);
      playerFoldResult[player_id] = isFold;
      if (!playerIncome[player_id]) {
        playerIncome[player_id] = 0;
      }
      playerIncome[player_id] -= income;

      if (isLastRound) {
        const lastBet = bet_list[bet_list.length - 1];
        playerResultChipCount[player_id] =
          lastBet.bet_before_chip - lastBet.chip_count;
      }
    });
  });

  //遍历所有玩家
  player_ids.forEach((player_id) => {
    const isFold = playerFoldResult[player_id] === true;
    const hand_pokers =
      !isFold && is_showdown ? player_pokers[player_id] : undefined;
    const result_poker_type = hand_pokers
      ? getMaxPokerType(public_poker.concat(hand_pokers))
      : undefined;
    let result_chip_count = playerResultChipCount[player_id] || 0;
    //计算每个玩家的收益
    const isW = player_id === winner_id;
    let income = playerIncome[player_id] || 0;
    if (isW) {
      const max_income = Math.min(-income * 2, pot);
      totalPot -= max_income; //剩余pot
      income += max_income;
      result_chip_count += max_income;
    }
    playerResult[player_id] = {
      player_id,
      income,
      is_win: isW,
      hand_pokers,
      result_poker_type,
      result_chip_count,
    };
  });

  let winnerPot = pot - totalPot;
  const winnerPlayer = player_list.find((a) => a.player_id === winner_id);
  if (!winnerPlayer) {
    throw new Error('胜利者不存在');
  }
  winnerPlayer.chip_count += winnerPot;
  //判断是否还有边池的情况
  let i = 1;
  while (totalPot > 0) {
    //获取下一个胜利者
    const w = winner_list[i];
    if (!w) {
      console.log('边池计算异常', totalPot);
      break;
    }
    const winner_id = w.player_id;
    const winner = playerResult[winner_id];
    const winnerIncome = -(winner.income * 2);
    //计算边池
    const sidePot = Math.min(totalPot, winnerIncome);
    totalPot -= sidePot;
    winnerPot = sidePot;
    playerResult[winner_id].income += sidePot;
    playerResult[winner_id].result_chip_count += sidePot;
    console.log('边池计算', winner_id, sidePot, totalPot);
    const winnerPlayer = player_list.find((a) => a.player_id === winner_id);
    if (!winnerPlayer) {
      throw new Error('胜利者不存在');
    }
    winnerPlayer.chip_count += winnerPot;
    i++;
  }

  gameInfo.player_result = playerResult;
  gameInfo.status = GameStatus.END;

  //更新游戏信息
  await updateRoomInfo({ ...roomInfo });
  return createCardInfo({
    template_id: getConfigValue(ConfigKey.CARD_GAME_RESULT),
    data: getGameResultMsgData({
      pot,
      game_no: gameInfo.game_no,
      currentRound: lastRound,
      playerResult,
    }),
  });
}

type FoldPlayerInfo = {
  player_id: string;
  fold_time: number;
};

//按照弃牌顺序，从最后一个弃牌的玩家开始，计算边池
function getFoldPlayerList(round_list: RoundInfo[]) {
  //获取所有弃牌玩家
  //获取所有玩家及其下注信息
  const foldPlayer: FoldPlayerInfo[] = [];
  round_list.forEach((round) => {
    round.player_bet_list.forEach((player) => {
      const foldBet = player.bet_list.find(
        (a) => a.play_action_type === BetType.FOLD
      );
      if (foldBet) {
        foldPlayer.push({
          player_id: player.player_id,
          fold_time: foldBet.create_time,
        });
      }
    });
  });
  //排序
  foldPlayer.sort((a, b) => {
    return b.fold_time - a.fold_time;
  });
  return foldPlayer;
}

type TriggerResponse = {
  toast: {
    type: 'info' | 'success' | 'error' | 'warning';
    content: string;
  };
  card?: any;
};
