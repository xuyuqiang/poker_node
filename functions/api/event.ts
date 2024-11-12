import cloud from '@lafjs/cloud'
import { ConfigKey, getConfigValue, isNumber, isRobotId } from '@/help';
import { replyMsg, sendCardMsg, sendMsg } from '@/fstools';
import {
  MsgEventReaction,
  MsgEventReceive,
  MsgEventTrigger,
  ReplyActionOption,
  RobotAction,
  RobotActionType,
  RobotMsg,
  RoomStatus,
  TriggerActionOption,
} from '@/types';
import {
  createRoom,
  findRunningRoomInfo,
  joinRoom,
  updateRoomInfo,
} from '@/room';
import { createGame } from '@/game';
import { getRoomStatusMsgData } from '@/msg';
import { handleTrigger } from '@/trigger';
import { GameStatus } from '../types';
const db = cloud.mongo.db

export default async function (ctx: FunctionContext) {
  console.log('Hello World', JSON.stringify(ctx.body));
  let { challenge } = ctx.body || {};
  if (challenge) {
    return {
      challenge,
    };
  }
  const req_params = ctx.body;
  //判断飞书消息是否是机器人消息
  const isMsg = await isRobotMsg(req_params);
  console.log('[event]isMsg', isMsg);
  if (!isMsg) {
    return {
      msg: 'hello world',
    };
  }
  const msg = req_params as RobotMsg<any>;
  const actionInfo = getRobotActionInfo(msg);
  const chat_id = actionInfo.options?.chat_id;
  console.log('[event]actionInfo', actionInfo); 
  if (!chat_id) {
    //更新消息状态
    return "HELLO WORLD";
  }
  const doc = await db.collection('lock').findOne({
    key: chat_id
  })
  if (doc) {
    console.log('[event]正在处理中', chat_id);
    return {
      toast: {
        type: 'error',
        content: '正在处理中，请稍后重试',
      },
    };
  }
  await db.collection('lock').insertOne({
    key: chat_id,
    value: true,
  })
  if (actionInfo.action === RobotActionType.REPLY) {
    try {
      //去处理内容
      const res = await handleReplyMsg(actionInfo);
      console.log('[处理消息结果]', res);
    } catch (error: any) {
      //回复消息给用户
      await replyMsg({
        message_id: actionInfo.options.message_id,
        text: error.message,
      });
    }
  } else if (actionInfo.action === RobotActionType.TRIGGER) {
    //处理触发器
    console.log('触发器', actionInfo);
    const res = await handleTrigger(actionInfo);
    //释放锁
    await db.collection('lock').deleteOne({
      key: chat_id
    })
    return res;
  }
  await db.collection('lock').deleteOne({
    key: chat_id
  })
  return {
    code: 0,
    msg: 'success',
  };
}

async function isRobotMsg(msg: any) {
  const event_type = msg?.header?.event_type;
  if (
    event_type === 'im.message.receive_v1' ||
    event_type === 'im.message.reaction.created_v1' ||
    event_type === 'card.action.trigger'
  ) {
    const event_id = msg?.header?.event_id;
    const doc = await db.collection('lock').findOne({
      key: event_id
    })
    if (doc) {
      return false;
    }
    await db.collection('lock').insertOne({
      key: 'event_id_' + event_id,
      value: 1,
    })

    //判断消息时间是否在5分钟内 ,如果超过5分钟，就不处理了
    const create_time = Number(msg?.event?.message?.create_time);
    if (event_type !== 'card.action.trigger' && Date.now() - create_time > 5 * 60 * 1000) {
      console.log(`消息时间超过5分钟,${create_time}`);
      return false;
    }
    return true;
  }
  return false;
}

function getRobotActionInfo(msg: RobotMsg<any>): RobotAction<any> {
  const create_time = msg.event?.message?.create_time || msg.header?.create_time;
  const event_type = msg.header?.event_type;
  //回复机器人的消息
  const content = getReplyContent(msg);
  if (content) {
    return {
      action: RobotActionType.REPLY,
      create_time: Number(create_time),
      options: content,
    };
  } else if (event_type === 'card.action.trigger') {
    const event = msg.event as MsgEventTrigger;
    return {
      action: RobotActionType.TRIGGER,
      create_time: Number(create_time),
      options: {
        message_id: event.context.open_message_id,
        value: event.action.value,
        tag: event.action.tag,
        chat_id: event.context.open_chat_id,
        trigger_user_id: event.operator.open_id,
        content_value: event.action.input_value || event.action.option,
      } as TriggerActionOption,
    };
  }
  return {
    action: RobotActionType.UNKOWN,
    create_time,
  };
}

//回复机器人的消息
function getReplyContent(
  msg: RobotMsg<MsgEventReceive | MsgEventReaction>
): ReplyActionOption | undefined {
  //直接回复内容
  if (msg.header.event_type === 'im.message.receive_v1') {
    const event = msg.event as MsgEventReceive;
    const { content, mentions, message_id } = event.message;
    //有@机器人
    if (mentions && mentions.length > 0) {
      const m = mentions.find((ii: any) => isRobotId(ii.id.open_id));
      if (m) {
        const contentJSON = JSON.parse(content);
        const result = contentJSON?.text.replace(`${m.key}`, '').trim().toLowerCase();
        //最终消息处理结果
        console.log('回复消息内容-处理后', result);
        return {
          message_id,
          content: result,
          reply_user_id: event.sender.sender_id.open_id,
          chat_id: event.message.chat_id,
        };
      }
    }
  } else if (msg.header.event_type === 'im.message.reaction.created_v1') {
    //表情回复
    const { message_id, reaction_type, user_id } =
      msg.event as MsgEventReaction;
    return {
      message_id,
      content: reaction_type.emoji_type,
      reply_user_id: user_id.open_id,
    };
  }
  return;
}

async function handleReplyMsg(robotAction: RobotAction<ReplyActionOption>) {
  //直接查询房间信息，然后匹配命令
  const { content, chat_id } = robotAction.options as ReplyActionOption;
  if (!content || !chat_id) {
    throw new Error('【处理消息】参数错误');
  }
  console.log('[处理消息]content', content);
  if (isCreateRoom(content)) {
    await handleReplyMsgToCreateRoom(robotAction);
  } else if (isJoinRoom(content)) {
    await handleReplyMsgToJoin(robotAction);
  } else if (isNextGame(content)) {
    await handleReplyMsgToNextGame(robotAction);
  } else if (isInitRoomInfo(content)) {
    await handleReplyMsgToInitRoomInfo(robotAction);
  } else if (isOverGame(content)) {
    await handleReplyMsgToOverGame(robotAction);
  } else if (isRebuy(content)) {
    //重购
    await handleReplyMsgFromRebuy(robotAction);
  }
}

function isCreateRoom(content: string) {
  return content.includes('创建房间');
}

function isInitRoomInfo(content: string) {
  if (!content && !content.includes('|') && content.includes('｜')) {
    return false;
  }
  const [sb, bb, per_num, rebuy] = content.includes('｜')
    ? content.split('｜')
    : content.split('|');
  if (
    sb &&
    bb &&
    per_num &&
    rebuy &&
    isNumber(sb) &&
    isNumber(bb) &&
    isNumber(per_num) &&
    isNumber(rebuy)
  ) {
    return true;
  }
  return false;
}

function isJoinRoom(content: string) {
  return content === 'ok' || content === '[ok]' || content === '👌';
}

function isNextGame(content: string) {
  return content === 'go' || content === '下一局' || content === '继续' || content === '1' || content === 'g';
}

function isOverGame(content: string) {
  return content === '结束' || content === 'over' || content === '结束游戏' || content === '算一下结果' || content === 'o';
}

function isRebuy(content: string) {
  return content.startsWith('rebuy') || content.startsWith('重购') || content.startsWith('b');
}

//处理下一局的命令
async function handleReplyMsgToNextGame(
  robotAction: RobotAction<ReplyActionOption>
) {
  console.log('【处理下一局】');
  const { chat_id = '' } = robotAction.options as ReplyActionOption;
  const roomInfo = await findRunningRoomInfo(chat_id);
  if (!roomInfo) {
    throw new Error('找不到房间信息');
  }
  const { room_id, ready_player_ids = [], sb = 0, bb = 0, per_num = 0, rebuy = 0, player_list, current_game } = roomInfo;
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
    current_game: gameInfo,
    last_game: current_game,
    player_list: player_list,
  });
}

async function handleReplyMsgToCreateRoom(
  robotAction: RobotAction<ReplyActionOption>
) {
  console.log('【创建房间】');
  const { chat_id = '', message_id } = robotAction.options as ReplyActionOption;
  return createRoom({
    chat_id,
    message_id,
  });
}

async function handleReplyMsgToInitRoomInfo(
  robotAction: RobotAction<ReplyActionOption>
) {
  //完善房间信息
  const {
    content,
    chat_id = '',
    message_id,
  } = robotAction.options as ReplyActionOption;
  console.log('【完善房间信息】', content);
  const [sb, bb, per_num, rebuy] = content.includes('｜')
    ? content.split('｜')
    : content.split('|');
  //校验数据是否正确，必须都存在且为数字
  if (
    sb &&
    bb &&
    per_num &&
    rebuy &&
    isNumber(sb) &&
    isNumber(bb) &&
    isNumber(per_num) &&
    isNumber(rebuy)
  ) {
    //查询房间信息
    const roomInfo = await findRunningRoomInfo(chat_id);
    if (!roomInfo) {
      throw new Error('【创建房间】找不到房间信息');
    }
    if (roomInfo.status !== RoomStatus.INIT_INFO) {
      throw new Error('【创建房间】房间状态不对');
    }
    const room_id = roomInfo.room_id;
    //更新房间信息
    await updateRoomInfo({
      room_id,
      sb: parseInt(sb),
      bb: parseInt(bb),
      per_num: parseInt(per_num),
      rebuy: parseInt(rebuy),
      status: RoomStatus.UN_PERSON_READY,
    });
    //发送消息 ,房间已设置好，等待玩家加入
    await sendCardMsg({
      chat_id,
      template_id: getConfigValue(ConfigKey.CARD_UN_READY_PLAYER),
      data: {
        blind_data: `${sb}/${bb}`,
        per_num: per_num,
        rebuy: rebuy,
      },
    });
  } else {
    //发送消息
    await replyMsg({
      message_id,
      text: '房间信息填写错误，请重新填写',
    });
  }
}

async function handleReplyMsgToJoin(
  robotAction: RobotAction<ReplyActionOption>
) {
  //校验回复内容是否正确
  const { reply_user_id, chat_id = '' } =
    robotAction.options as ReplyActionOption;
  return joinRoom({
    chat_id,
    player_id: reply_user_id,
    message_time: robotAction.create_time,
  });
}

//结束游戏
async function handleReplyMsgToOverGame(robotAction: RobotAction<ReplyActionOption>) {
  //结束游戏
  const { chat_id = '' } = robotAction.options as ReplyActionOption;
  //获取房间信息
  const roomInfo = await findRunningRoomInfo(chat_id);
  if (!roomInfo) {
    throw new Error('找不到房间信息');
  }
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
  });

  //统计结果
  await sendCardMsg({
    chat_id,
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

async function handleReplyMsgFromRebuy(
  robotAction: RobotAction<ReplyActionOption>
) {
  //提取rebuy手数
  const {
    reply_user_id,
    content,
    chat_id = '',
  } = robotAction.options as ReplyActionOption;
  const roomInfo = await findRunningRoomInfo(chat_id);
  if (!roomInfo) {
    throw new Error('找不到房间信息');
  }
  const { rebuy = 0, room_id } = roomInfo;
  const count = parseInt(content.replace('rebuy', '').trim());
  if (count <= 0) {
    throw new Error('重购手数错误');
  }
  if (count > 5) {
    throw new Error('重购手数不能超过5次');
  }

  const player_list = roomInfo.player_list;
  const res = player_list?.find((ii) => ii.player_id === reply_user_id);
  if (!res) {
    throw new Error('玩家信息不存在');
  }
  res.chip_count += count * rebuy;
  res.hand_count += count;
  res.buyin += count * rebuy;
  await updateRoomInfo({
    room_id,
    player_list,
  });

  //发送消息
  await sendMsg({
    chat_id,
    text: `${res.player_name}重购${count}次,现在筹码数：${res.chip_count}`,
  })
  return res;
}
