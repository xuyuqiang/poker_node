//收到的消息会分解成各种action，
export enum RobotActionType {
  REPLY = 'REPLY', //@机器人 回复内容
  TRIGGER = 'TRIGGER', //触发器卡片按钮
  UNKOWN = 'UNKOWN',
}

//机器人收到的消息，被解析成各种action
export interface RobotAction<T> {
  action: RobotActionType;
  create_time: number;
  options?: T; //消息内容
}

export interface ReplyActionOption {
  message_id: string; //消息id
  content: string; //回复内容，已经做了全小写处理 ,且去掉了@机器人
  reply_user_id: string;
  chat_id?: string; //回复表情，没有该值
}

export interface TriggerActionOption {
  message_id: string; //消息id
  value: string; //按钮值
  content_value: string; //其他值
  tag: string; //按钮tag
  chat_id: string;
  trigger_user_id: string;  //触发按钮的用户
}

export interface RobotMsg<T> {
  schema: string;
  header: {
    event_id: string;
    token: string;
    create_time: string;
    event_type: string;
    tenant_key: string;
    app_id: string;
  };
  event: T;
}

export interface MsgEventReceive {
  message: {
    chat_id: string;
    chat_type: string;
    content: string;
    create_time: string;
    mentions: {
      id: {
        open_id: string;
        union_id: string;
        user_id: string;
      };
      key: string;
      name: string;
      tenant_key: string;
    }[];
    message_id: string;
    message_type: string;
    update_time: string;
    parent_id: string;
    root_id: string;
  };
  sender: {
    sender_id: {
      open_id: string;
      union_id: string;
      user_id: string;
    };
    sender_type: string;
    tenant_key: string;
  };
}

export interface MsgEventReaction {
  action_time: string;
  message_id: string;
  operator_type: string;
  reaction_type: {
    emoji_type: string;
  };
  user_id: {
    open_id: string;
    union_id: string;
    user_id: string;
  };
}

export interface MsgEventTrigger {
  operator: {
    user_id: string;
    open_id: string;
  },
  action: {
    value: string;
    tag: string; // input框的tag
    option: any; //按钮的额外值 ,tag为select_static时有效
    input_value: string; //输入框的值 ,tag为input时有效
  },
  context: {
    open_message_id: string;
    open_chat_id: string;
  }
}

export enum RoomStatus {
  INIT_INFO = 'init_info',
  UN_PERSON_READY = 'un_person_ready',
  ALL_READY = 'all_ready',
  PLAYING = 'playing',
  END = 'end',
}

export interface RoomInfo {
  record_id: string; //等于room_id
  room_id: string; //等于record_id
  chat_id: string;
  status: RoomStatus;
  sb?: number;
  bb?: number;
  per_num?: number;
  rebuy?: number;
  ready_player_ids?: string[];
  btn?: number; //当前btn位置，从0开始
  player_list?: PlayerInfo[];
  current_game?: GameInfo;
  last_game?: GameInfo;
  create_time: number;
  update_time: number;
}

export enum GameStatus {
  PLAYING = 'playing',
  END = 'end',
}

export interface GameInfo {
  player_ids: string[];
  btn: number;
  blind_data: string; //盲注信息 sb,bb
  rebuy: number; //重购
  chat_id: string; //聊天群，冗余字段，方便查询
  round_list: RoundInfo[];
  status: GameStatus;
  pot: number;
  player_result?: { [key: string]: PlayerResult };
  player_pokers?: { [key: string]: PokerInfo[] };
  game_no: number;
  pokers: PokerInfo[];
  create_time?: number;
  update_time?: number;
  room_id: string;
  //TODO:特殊处理
  record_id?: string;
  game_id?: string;
}

//回合信息，定义
export enum RoundType {
  PREFLOP = 0,
  FLOP,
  TURN,
  RIVER,
}

export const RoundTypeList = ['Preflop', 'Flop', 'Turn', 'River'];

export interface RoundInfo {
  round_type: RoundType;
  //公共牌
  public_poker?: PokerInfo[];
  //玩家下注信息
  player_bet_list: PlayerBetInfo[]; //所有用户的下注信息，包括未行动的用户
  current_player_index: number; //当前行动人
  //当前下注的最高值
  current_max_chips: number;
}

export enum BetType {
  WAIT = 'Wait',
  FOLD = 'Flod',
  SB = 'SB', //盲注
  BB = 'BB', //大盲注
  CALL = 'Call',
  RAISE = 'Raise',
  CHECK = 'Check',
  ALLIN = 'All in',
}

export interface BetInfo {
  play_action_type: BetType;
  chip_count: number; //当前额外下注数量
  max_chip_count: number; //当前最大下注数量 , 如果allin的话，就是本轮allin的最大值 ， 否则等于本轮最大值
  create_time: number; //毫米时间戳
  bet_before_chip: number; //行动前的筹码数量
}

export interface PlayerBetInfo {
  player_id: string;
  player_name: string;
  pos_text: string; //位置信息
  bet_list: BetInfo[];
}

export interface PlayerInfo {
  player_id: string; //用户id
  player_name: string; //用户昵称
  chip_count: number; //当前筹码数量
  hand_count: number; //当前买入手数
  buyin: number; //买入筹码数量
  //TODO: 废弃
  room_id?: string;
  record_id?: string; //记录id
}

export interface PlayerResult {
  player_id: string;
  income: number; //本局收益 - 去掉自己的投入 。 本局所有人的收益和为0
  is_win: boolean; //是否是最终的胜利者
  hand_pokers?: PokerInfo[]; //手牌 ,只有摊牌的人，才会有
  result_chip_count: number; //游戏结束后，玩家的筹码数量
  result_poker_type?: PokerTypeInfo; //牌型
}

export enum PokerType {
  //高牌
  HIGH_CARD = 0,
  //一对
  ONE_PAIR,
  //两对
  TWO_PAIR,
  //三条
  THREE_OF_A_KIND,
  //顺子
  STRAIGHT,
  //同花
  FLUSH,
  //葫芦
  FULL_HOUSE,
  //四条
  FOUR_OF_A_KIND,
  //同花顺
  STRAIGHT_FLUSH,
  //皇家同花顺
  ROYAL_FLUSH,
}

export interface PokerTypeInfo {
  type: PokerType;
  poker_list: PokerInfo[]; //牌列表,5张，按照小->大排序
}

//黑红花片
export enum PokerColor {
  SPADE = 0,
  HEART,
  CLUB,
  DIAMOND,
}

export enum PokerPoint {
  One = 1,
  TWO = 2,
  THREE,
  FOUR,
  FIVE,
  SIX,
  SEVEN,
  EIGHT,
  NINE,
  TEN,
  J,
  Q,
  K,
  A,
}

export interface PokerInfo {
  point: PokerPoint;
  color: PokerColor;
}