export enum ConfigKey {
  TABLE_TOKEN = 'TABLE_TOKEN',
  TABLE_ROOM_ID = 'TABLE_ROOM_ID',
  ROBOT_ID = 'ROBOT_ID',
  ROBOT_APP_ID = 'ROBOT_APP_ID',
  ROBOT_SECRET = 'ROBOT_SECRET',
  CARD_PLAY_ACTION = 'CARD_PLAY_ACTION',
  CARD_GAME_RESULT = 'CARD_GAME_RESULT',
  CARD_READY_GAME = 'CARD_READY_GAME',
  CARD_ROOM_STATUS = 'CARD_ROOM_STATUS',
  CARD_UN_READY_PLAYER = 'CARD_UN_READY_PLAYER'
}

export const getConfigValue = (key: ConfigKey) => {
  return process.env[key] || '';
}

export const isRobotId = (id: string) => {
  return id === process.env.ROBOT_ID;
};

//随机数 0-max,包括max
export function getRandomInt(max: number) {
  // 确保 min 和 max 是整数
  max = Math.floor(max);
  // 生成 min 到 max 之间的随机整数（包括 min 和 max）
  return Math.floor(Math.random() * (max - 0 + 1)) + 0;
}

//生成随机id
export function getRandomId() {
  return crypto.randomUUID();
}

//位置生成text
export function getPositionText(count: number, btn: number, current: number) {
  if (count < 2) {
    throw new Error('人数不能小于2');
  }
  if (count > 9) {
    throw new Error(`最多支持9人桌${count}|${btn}|${current}`);
  }
  //2个人位置有点特殊
  if (count === 2) {
    if (btn === current) {
      return 'BTN/SB';
    }
    return 'BB';
  }
  if (btn === current) {
    return 'BTN';
  }
  //小盲
  if (btn + 1 === current || (btn === count - 1 && current === 0)) {
    return 'SB';
  }
  if (
    btn + 2 === current ||
    (btn === count - 2 && current === 0) ||
    (btn === count - 1 && current === 1)
  ) {
    return 'BB';
  }
  //4人以上
  if (
    btn + 3 === current ||
    (btn === count - 3 && current === 0) ||
    (btn === count - 2 && current === 1) ||
    (btn === count - 1 && current === 2)
  ) {
    return 'UTG';
  }
  //5人以上,CO位 ，btn-1位置
  if (btn - 1 === current || (btn === 0 && current === count - 1)) {
    return 'CO';
  }

  //6人 MP位计算 ,btn-2位置
  if (count >= 6 && count <= 8) {
    if (
      btn - 2 === current ||
      (btn === 1 && current === count - 1) ||
      (btn === 0 && current === count - 2)
    ) {
      return 'MP';
    }
  }
  //7人,UTG+1
  if (count >= 7) {
    if (
      btn + 4 === current ||
      (btn === count - 4 && current === 0) ||
      (btn === count - 3 && current === 1) ||
      (btn === count - 2 && current === 2) ||
      (btn === count - 1 && current === 3)
    ) {
      return 'UTG+1';
    }
  }

  //8人,UTG+2
  if (count >= 8) {
    if (
      btn + 5 === current ||
      (btn === count - 5 && current === 0) ||
      (btn === count - 4 && current === 1) ||
      (btn === count - 3 && current === 2) ||
      (btn === count - 2 && current === 3) ||
      (btn === count - 1 && current === 4)
    ) {
      return 'UTG+2';
    }
  }

  //9人桌, HJ位 btn-2位置
  if (count >= 9) {
    if (
      btn - 2 === current ||
      (btn === 0 && current === count - 2) ||
      (btn === 1 && current === count - 1)
    ) {
      return 'HJ';
    }
    //mp btn-3位置
    if (
      btn - 3 === current ||
      (btn === 0 && current === count - 3) ||
      (btn === 1 && current === count - 2) ||
      (btn === 2 && current === count - 1)
    ) {
      return 'MP';
    }
  }
  throw new Error(`最多支持9人桌${count}|${btn}|${current}`);
}

export const findSBIndex = (count: number, btn: number) => {
  if (count === 2) {
    return btn;
  }
  //小盲
  if (btn === count - 1) {
    return 0;
  }
  return btn + 1;
};

export const findBBIndex = (count: number, btn: number) => {
  if (count === 2) {
    return btn === 0 ? 1 : 0;
  }
  //小盲
  if (btn === count - 1) {
    return 1;
  }
  if (btn === count - 2) {
    return 0;
  }
  return btn + 2;
};

export const isNumber = (value: string) => {
  return /^\d+$/.test(value);
};
