import {
  findTableRecord,
  insertTableRecord,
  recordToNormalData,
  replyMsg,
  sendMsg,
  updateTableRecord,
} from '@/fstools';
import { ConfigKey, getConfigValue, getRandomInt } from '@/help';
import { RoomInfo, RoomStatus } from '@/types';
import { createGame } from '@/game';
import { createAllPlayer } from '@/player';

//--------------  业务函数 --------------
type CreateRoomParams = {
  chat_id: string;
  message_id: string;
};
export const createRoom = async ({ chat_id, message_id }: CreateRoomParams) => {
  //如果已经有房间了，直接返回
  const f = await findRunningRoomInfo(chat_id);
  if (f) {
    console.log('房间已经存在', chat_id);
    //回复该消息
    await replyMsg({
      message_id,
      text: '房间已经存在', //TODO: 提示如何重新创建房间，即增加结束房间的指令
    });
    return;
  }
  const roomInfo = await insertRoom({ chat_id });
  //发送消息
  await sendMsg({
    chat_id,
    text: '正在创建房间，请回复对应的信息（SB|BB|人数|买入），用｜分割',
  });
  return roomInfo;
};

type JoinRoomParams = {
  chat_id: string;
  player_id: string;
  message_time: number;
};
//TODO:多人同时加入，可能会有问题，更新表出现数据丢失
export const joinRoom = async ({ chat_id, player_id, message_time }: JoinRoomParams) => {
  //先查找房间，添加新成员
  const roomInfo = await findRunningRoomInfo(chat_id);
  if (!roomInfo) {
    throw new Error(`房间不存在${chat_id}`);
  }
  //判断时间是否过期
  //判断时间是否大于消息时间
  if ((roomInfo.update_time || 0) > message_time) {
    console.log('消息过期', player_id);
    return;
  }
  if (roomInfo.status !== RoomStatus.UN_PERSON_READY) {
    throw new Error(`房间状态不对${roomInfo.status}`);
  }
  const { room_id, per_num = 0, rebuy, ready_player_ids: player_ids = [] } = roomInfo;
  let len = player_ids.length;
  if (per_num <= len) {
    //人数满了
    throw new Error(`房间人数已满${per_num}`);
  }
  if (player_ids.includes(player_id)) {
    //已经
    throw new Error(`已经加入房间${player_id}`);
  }
  console.log('加入房间', room_id, player_id);
  //加入集合
  player_ids.push(player_id);
  len = player_ids.length;
  let status: RoomStatus = RoomStatus.UN_PERSON_READY;
  if (len === per_num) {
    //最后1个人加入
    status = RoomStatus.PLAYING;
    const i = getRandomInt(len - 1);

    //创建所有玩家
    //创建玩家信息
    const players = await createAllPlayer({
      player_ids,
      chip_count: rebuy || 0,
      chat_id,
    });

    //创建game
    //创建牌局
    const gameInfo = await createGame({
      chat_id: chat_id,
      room_id,
      player_ids: player_ids,
      sb: roomInfo.sb || 1,
      bb: roomInfo.bb || 2,
      btn: i,
      game_no: 1,
      rebuy: roomInfo.rebuy || 0,
      players,
    });

    //更新房间信息
    await updateRoomInfo({
      room_id,
      ready_player_ids: player_ids,
      status,
      btn: i,
      player_list: players,
      current_game: gameInfo,
    });
  } else {
    //更新房间信息
    return updateRoomInfo({
      room_id,
      ready_player_ids: player_ids,
      status,
    });
  }
  return;
};

//废弃
export const getRoomMsgText = (roomInfo: RoomInfo) => {
  return `【房间信息】
大小盲注:${roomInfo.sb}/${roomInfo.bb}，人数:${roomInfo.per_num}，允许买入:${roomInfo.rebuy}
`;
};

export const getRoomMsgCardData = (roomInfo: RoomInfo) => {
  return {
    blind_data: `${roomInfo.sb}/${roomInfo.bb}`,
    per_num: roomInfo.per_num,
    rebuy: roomInfo.rebuy,
  };
};

// -------------- 增删改查 --------------
export const insertRoom = async ({ chat_id }: any): Promise<RoomInfo> => {
  const res = await insertTableRecord({
    app_token: getConfigValue(ConfigKey.TABLE_TOKEN),
    table_id: getConfigValue(ConfigKey.TABLE_ROOM_ID),
    fields: {
      status: RoomStatus.INIT_INFO,
      chat_id,
    },
  });
  return {
    room_id: res.record.id,
    ...res.record.fields,
  };
};

type UpdateRoomInfoParams = Partial<Omit<RoomInfo, 'chat_id' | 'create_time' | 'update_time'>>;

export const updateRoomInfo = async ({
  room_id,
  ready_player_ids,
  current_game,
  last_game,
  player_list,
  ...other
}: UpdateRoomInfoParams): Promise<string> => {
  const { record_id, ...otherData } = other;
  const res = await updateTableRecord({
    app_token: getConfigValue(ConfigKey.TABLE_TOKEN),
    table_id: getConfigValue(ConfigKey.TABLE_ROOM_ID),
    id: room_id,
    fields: {
      ready_player_ids: ready_player_ids
        ? ready_player_ids.join(',')
        : undefined,
      current_game: current_game ? JSON.stringify(current_game) : undefined,
      last_game: last_game ? JSON.stringify(last_game) : undefined,
      player_list: player_list ? JSON.stringify(player_list) : undefined,
      ...otherData,
    },
  });
  console.log('[updateRoomInfo]update-result', JSON.stringify(res));
  return room_id || '';
};

export const findRunningRoomInfo = async (
  chat_id: string
): Promise<RoomInfo | undefined> => {
  const res = await findTableRecord({
    app_token: getConfigValue(ConfigKey.TABLE_TOKEN),
    table_id: getConfigValue(ConfigKey.TABLE_ROOM_ID),
    filter: {
      conjunction: 'and',
      conditions: [
        {
          field_name: 'chat_id',
          operator: 'is',
          value: [chat_id],
        },
        {
          field_name: 'status',
          operator: 'isNot',
          value: [RoomStatus.END],
        },
      ],
    },
  });
  console.log('[findRunningRoomInfo]find-result', JSON.stringify(res?.items));
  //处理结果类型
  const item = res?.items?.[0];
  return fsToRoomInfo(item);
};

function fsToRoomInfo(item: any): RoomInfo | undefined {
  if (!item) {
    return;
  }
  const { ready_player_ids, player_list, current_game, last_game, ...other } = recordToNormalData(item);
  const roomInfo = {
    ...(ready_player_ids
      ? { ready_player_ids: ready_player_ids.split(',') }
      : {}),
    player_list: player_list ? JSON.parse(player_list) : undefined,
    current_game: current_game ? JSON.parse(current_game) : undefined,
    last_game: last_game ? JSON.parse(last_game) : undefined,
    ...other,
  };
  return roomInfo as RoomInfo;
}
