import { getRandomInt } from '@/help';
import { PlayerInfo, PokerInfo, PokerPoint, PokerType, PokerTypeInfo } from './types';

//发牌
type DealPokerParams = {
  players: PlayerInfo[];
  btn: number;
  pokerList: PokerInfo[];
};
export const dealPoker = ({
  players,
  btn,
  pokerList,
}: DealPokerParams): { [key: string]: PokerInfo[] } => {
  const playerDict: { [key: string]: PokerInfo[] } = {};
  const playerCount = players.length;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < playerCount; j++) {
      const playerIndex = (btn + 1 + j) % playerCount;
      const player_id = players[playerIndex].player_id;
      const i = getRandomInt(pokerList.length - 1);
      const p = pokerList.splice(i, 1)[0];
      if (!playerDict[player_id]) {
        playerDict[player_id] = [];
      }
      if (playerDict[player_id].length === 1) {
        //排序插入
        const p1 = playerDict[player_id][0];
        if (p1.point > p.point) {
          playerDict[player_id].unshift(p);
        } else {
          playerDict[player_id].push(p);
        }
      } else {
        playerDict[player_id].push(p);
      }
    }
  }
  return playerDict;
};

export const randomPokerList = (pokerList: PokerInfo[], count: number): PokerInfo[] => {
  const result: PokerInfo[] = [];
  for (let i = 0; i < count; i++) {
    const index = getRandomInt(pokerList.length - 1);
    result.push(pokerList.splice(index, 1)[0]);
  }
  return result;
}

export const getPokerText = (pokerInfo: PokerInfo): string => {
  const colors = ['♠️', '❤️', '♣️', '♦️'];
  const points = [
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    'J',
    'Q',
    'K',
    'A',
  ];
  return colors[pokerInfo.color] + points[pokerInfo.point - 2];
};

export const getPokerListText = (pokerList: PokerInfo[]): string => {
  return pokerList.map((p) => getPokerText(p)).join(',');
}

export const getPokerTypeText = (pokerTypeInfo: PokerTypeInfo): string => {
  const pokerTypeTexts = [
    '高牌',
    '一对',
    '两对',
    '三条',
    '顺子',
    '同花',
    '葫芦',
    '四条',
    '同花顺',
    '皇家同花顺',
  ];
  return pokerTypeTexts[pokerTypeInfo.type];
}

export const createPokerList = (): PokerInfo[] => {
  const pokers: PokerInfo[] = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 2; j <= 14; j++) {
      pokers.push({
        point: j,
        color: i,
      });
    }
  }
  return pokers;
};

//一共7张牌，获取所有牌型
export const getMaxPokerType = (pokers: PokerInfo[]): PokerTypeInfo => {
  const n = pokers.length;
  //先排序
  let maxPokerTypeInfo: PokerTypeInfo | null = null;
  const cards = pokers.sort((a, b) => a.point - b.point);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        for (let l = k + 1; l < n; l++) {
          for (let m = l + 1; m < n; m++) {
            const p = [cards[i], cards[j], cards[k], cards[l], cards[m]];
            const pokerTypeInfo = getPokerType(p);
            if (!maxPokerTypeInfo || comparePokerType(pokerTypeInfo, maxPokerTypeInfo) > 0) {
              maxPokerTypeInfo = pokerTypeInfo;
            }
          }
        }
      }
    }
  }
  return maxPokerTypeInfo as PokerTypeInfo;
};

//获取牌型
export const getPokerType = (pokers: PokerInfo[]): PokerTypeInfo => {
  if (isRoyalFlush(pokers)) {
    return {
      type: PokerType.ROYAL_FLUSH,
      poker_list: pokers,
    };
  }
  if (isStraightFlush(pokers)) {
    return {
      type: PokerType.STRAIGHT_FLUSH,
      poker_list: pokers,
    };
  }
  if (isFourOfAKind(pokers)) {
    return {
      type: PokerType.FOUR_OF_A_KIND,
      poker_list: pokers,
    };
  }
  if (isFullHouse(pokers)) {
    return {
      type: PokerType.FULL_HOUSE,
      poker_list: pokers,
    };
  }
  if (isFlush(pokers)) {
    return {
      type: PokerType.FLUSH,
      poker_list: pokers,
    };
  }
  if (isStraight(pokers)) {
    return {
      type: PokerType.STRAIGHT,
      poker_list: pokers,
    };
  }
  if (isThreeOfAKind(pokers)) {
    return {
      type: PokerType.THREE_OF_A_KIND,
      poker_list: pokers,
    };
  }
  if (isTwoPair(pokers)) {
    return {
      type: PokerType.TWO_PAIR,
      poker_list: pokers,
    };
  }
  if (isOnePair(pokers)) {
    return {
      type: PokerType.ONE_PAIR,
      poker_list: pokers,
    };
  }
  return {
    type: PokerType.HIGH_CARD,
    poker_list: pokers,
  };
};

export const comparePokerType = (p1: PokerTypeInfo, p2: PokerTypeInfo): number => {
  if (p1.type !== p2.type) {
    return p1.type - p2.type;
  }
  return comparePokerList(p1.poker_list, p2.poker_list);
};

//只比较牌面大小
export const comparePokerList = (p1: PokerInfo[], p2: PokerInfo[]): number => {
  //获取所有点数
  const p1p = p1.map((p) => p.point).sort((a, b) => a - b);
  const p2p = p2.map((p) => p.point);

  //处理特殊最小A顺的情况
  if (isStraight(p1) && p1[4].point === PokerPoint.A && p1[0].point === PokerPoint.TWO) {
    p1p[4] = 1;
    p1p.sort((a, b) => a - b);
  }
  if (isStraight(p2) && p2[4].point === PokerPoint.A && p2[0].point === PokerPoint.TWO) {
    p2p[4] = 1;
    p2p.sort((a, b) => a - b);
  }

  for (let i = p1p.length - 1; i >= 0; i--) {
    if (p1p[i] !== p2p[i]) {
      return p1p[i] - p2p[i];
    }
  }
  return 0;
};

//以下牌型，具有包含关系

//皇家同花顺
export const isRoyalFlush = (pokers: PokerInfo[]): boolean => {
  return isStraightFlush(pokers) && pokers[4].point === PokerPoint.A && pokers[0].point === PokerPoint.TEN;
}

//同花顺
export const isStraightFlush = (pokers: PokerInfo[]): boolean => {
  return isFlush(pokers) && isStraight(pokers);
}

//四条
export const isFourOfAKind = (pokers: PokerInfo[]): boolean => {
  const points = pokers.map((p) => p.point).sort((a, b) => a - b);
  return points[0] === points[3] || points[1] === points[4];
}

//是葫芦
export const isFullHouse = (pokers: PokerInfo[]): boolean => {
  const points = pokers.map((p) => p.point).sort((a, b) => a - b);
  return (points[0] === points[2] && points[3] === points[4]) || (points[0] === points[1] && points[2] === points[4]);
}

//是同花
export const isFlush = (pokers: PokerInfo[]): boolean => {
  const color = pokers[0].color;
  return pokers.every((p) => p.color === color);
}

//是顺子
export const isStraight = (pokers: PokerInfo[]): boolean => {
  const points = pokers.map((p) => p.point).sort((a, b) => a - b);
  if (points[0] === 2 && points[4] === 14) {
    points[4] = 1;
    points.sort((a, b) => a - b);
  }
  return points[4] - points[0] === 4 && new Set(points).size === 5;;
}

//是三条
export const isThreeOfAKind = (pokers: PokerInfo[]): boolean => {
  const points = pokers.map((p) => p.point).sort((a, b) => a - b);
  return points[0] === points[2] || points[1] === points[3] || points[2] === points[4];
}

//是两对
export const isTwoPair = (pokers: PokerInfo[]): boolean => {
  const points = pokers.map((p) => p.point).sort((a, b) => a - b);
  return (points[0] === points[1] && points[2] === points[3]) || (points[0] === points[1] && points[3] === points[4]) || (points[1] === points[2] && points[3] === points[4]);
}

//是一对
export const isOnePair = (pokers: PokerInfo[]): boolean => {
  const points = pokers.map((p) => p.point).sort((a, b) => a - b);
  return points[0] === points[1] || points[1] === points[2] || points[2] === points[3] || points[3] === points[4];
}



