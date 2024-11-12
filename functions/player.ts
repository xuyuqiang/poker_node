import {
  getChatMembers,
  recordToNormalData,
  sendOnlyMsg,
} from '@/fstools';
import { getPositionText } from '@/help';
import { PlayerInfo } from './types';


export type CreateAllPlayerParams = {
  player_ids: string[];
  chip_count: number;
  chat_id: string;
};
export const createAllPlayer = async ({
  player_ids,
  chat_id,
  chip_count,
}: CreateAllPlayerParams): Promise<PlayerInfo[]> => {
  //获取群成员所有名字
  const menbers = await getChatMembers({ chat_id });
  //插入玩家信息
  const players = player_ids.map((player_id: string) => {
    let name = getTestPlayerName(player_id);
    if (!name) {
      name =
        menbers.items.find((m) => m.member_id === player_id)?.name || player_id;
    }
    return {
      player_id,
      chip_count: chip_count || 0,
      hand_count: 1,
      buyin: chip_count || 0,
      player_name: name,
    };
  });
  return players;
};

type GenPosInfoListParams = {
  playerCount: number;
  btn: number;
};
export const genPosInfoList = ({
  playerCount,
  btn,
}: GenPosInfoListParams): string[] => {
  const posList: string[] = [];
  for (let i = 0; i < playerCount; i++) {
    const posInfo = getPositionText(playerCount, btn, i);
    posList.push(posInfo);
  }
  return posList;
};

//获取当前玩家信息，防止索引越界
export const getCurrentPlayer = (
  players: PlayerInfo[],
  index: number
): PlayerInfo => {
  return players[index % players.length];
};

export const getNextIndex = (player_count: number, index: number): number => {
  return (index + 1) % player_count;
};

//给玩家单独发送消息
type SendPlayerMsgParams = {
  player_id: string;
  text: string;
  chat_id: string;
};
export const sendPlayerMsg = async ({
  player_id,
  chat_id,
  text,
}: SendPlayerMsgParams) => {
  //TODO: 插入当前玩家信息
  //过滤测试玩家 't+数字_'开头
  const playerPrefix = getTestPlayerPrefix(player_id);
  if (playerPrefix) {
    //说明是测试玩家
    player_id = player_id.replace(playerPrefix, '');
    text = `[测试玩家${playerPrefix}]${text}`;
  }
  console.log('发送消息给玩家', player_id, text);
  return sendOnlyMsg({
    chat_id: chat_id,
    text: text,
    open_id: player_id,
  });
};

function fsToPlayerInfo(item: string): PlayerInfo | Promise<PlayerInfo> {
  return recordToNormalData(item) as PlayerInfo;
}

export function getTestPlayerPrefix(player_id: string) {
  const match = player_id.match(/^t\d+_/);
  return match ? match[0] : null;
}

export function getTestPlayerRealId(player_id: string) {
  return player_id.replace(/^t\d+_/, '');
}

export function getTestPlayerName(player_id: string) {
  const r = getTestPlayerPrefix(player_id);
  return r ? `测试玩家${r}` : undefined;
}

