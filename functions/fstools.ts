import { ConfigKey } from "@/help";

type TableBaseParams = {
  app_token: string;
  table_id: string;
  fk?: string;
};

type TableRecordParams = TableBaseParams & {
  id?: string;
  fields: any;
};

type TableQueryParams = TableBaseParams & {
  page_size?: number;
  [key: string]: any;
};

type FSTokenInfo = {
  tenant_access_token: string;
  expire: number; //过期时间, 单位秒， 最大有效期是 2 小时。
  expire_time: number; //过期时间, 单位毫秒
  msg: string;
}

let _fsTokenInfo: FSTokenInfo | undefined = undefined;
export const getTenantAccessToken = async (fk?: string): Promise<string> => {
  if (_fsTokenInfo) { //提前5分钟有效期
    const d = _fsTokenInfo as FSTokenInfo;
    if (d.expire_time - Date.now() > 5 * 60 * 1000) {
      return d.tenant_access_token;
    }
  }

  //发送post请求
  const res = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      body: JSON.stringify({
        app_id: getConfig(ConfigKey.ROBOT_APP_ID),
        app_secret: getConfig(ConfigKey.ROBOT_SECRET),
      }),
      method: 'POST',
    }
  );
  const data = await res.json();
  console.log('token请求结果', data);
  const { tenant_access_token, expire, msg } = data || {};
  if (!tenant_access_token) {
    throw new Error('token error:' + msg);
  }
  _fsTokenInfo = {
    tenant_access_token,
    expire,
    expire_time: Date.now() + expire * 1000,
    msg,
  };
  return tenant_access_token;
};

//单条记录新增
export const insertTableRecord = async ({
  app_token,
  table_id,
  fields,
  fk,
}: TableRecordParams) => {
  return request({
    url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records`,
    data: {
      fields,
    },
    tag: 'insertTableRecord',
    fk,
  });
};

//批量新增https://open.feishu.cn/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/batch_create
export const batchInsertTableRecord = async ({
  app_token,
  table_id,
  records,
  fk,
}: TableBaseParams & { records: any[]; fk?: string }) => {
  return request({
    url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records/batch_create`,
    data: {
      records,
    },
    tag: 'batchInsertTableRecord',
    fk,
  })
};

export const updateTableRecord = async ({
  app_token,
  fk,
  table_id,
  fields,
  id,
}: TableRecordParams) => {
  return request({
    url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records/${id}`,
    method: 'PUT',
    data: {
      fields,
    },
    tag: 'updateTableRecord',
    fk,
  })
};

//批量更新
export type batchUpdateTableRecordParams = {
  app_token: string;
  fk?: string;
  table_id: string;
  records: {
    record_id: string;
    fields: any;
  }[];
}
export const batchUpdateTableRecord = async ({
  app_token,
  fk,
  table_id,
  records,
}: batchUpdateTableRecordParams) => {
  //https://open.feishu.cn/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/batch_update
  return request({
    url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records/batch_update`,
    data: {
      records,
    },
    tag: 'batchUpdateTableRecord',
    fk,
  })

}

/**
 * filter 写法参考 = https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/bitable-v1/app-table-record/record-filter-guide
 */
export const findTableRecord = async ({
  app_token,
  table_id,
  fk,
  filter,
  sort,
}: TableQueryParams) => {
  return request({
    url: `https://open.feishu.cn/open-apis/bitable/v1/apps/${app_token}/tables/${table_id}/records/search`,
    data: {
      filter,
      sort,
    },
    tag: 'findTableRecord',
  })
};

//消息
type SendMsgParams = {
  chat_id: string;
  text: string;
}
type SendMsgResponse = {
  message_id: string;
  chat_id: string;
};
export const sendMsg = async ({
  chat_id,
  text,
}: SendMsgParams): Promise<SendMsgResponse> => {
  return request({
    url: 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    data: {
      receive_id: chat_id,
      msg_type: 'text',
      content: JSON.stringify({
        text,
      }),
    },
    tag: 'sendMsg',
  })
};

//获取游戏卡片需要的信息
type CreateCardInfo = {
  template_id: string;
  data: any;
};
export function createCardInfo({ template_id, data }: CreateCardInfo) {
  console.log('createCardInfo', template_id, JSON.stringify(data));
  return {
    type: 'template',
    data: {
      template_id: template_id,
      template_variable: {
        ...data,
        timestamp: Date.now().toString(), //增加时间戳
      },
    },
  };
}

//发送发片消息
type SendCardMsgParams = {
  chat_id: string;
  template_id: string;
  data: any;//模版里的数据
}
export const sendCardMsg = async ({ chat_id, template_id, data }: SendCardMsgParams) => {
  return request({
    url: 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    data: {
      receive_id: chat_id,
      msg_type: 'interactive',
      content: JSON.stringify(createCardInfo({ template_id, data })),
    },
    tag: 'sendCardMsg',
  })
}

export type UpdateCardMsgParams = {
  message_id: string;
  template_id: string;
  data: any;
}
export const updateCardMsg = async ({ message_id, template_id, data }: UpdateCardMsgParams) => {
  return request({
    url: `https://open.feishu.cn/open-apis/im/v1/messages/${message_id}`,
    data: {
      content: JSON.stringify({
        type: 'template',
        data: {
          template_id,
          template_variable: data,
        }
      }),
    },
    method: 'PATCH',
    tag: 'updateCardMsg',
  })
}

type ReplyMsgParams = {
  message_id: string;
  text: string;
}
export const replyMsg = async ({
  message_id,
  text,
}: ReplyMsgParams) => {
  //https://open.feishu.cn/open-apis/im/v1/messages/:message_id/reply

  const tenant_access_token = await getTenantAccessToken();
  const res = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages/${message_id}/reply`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenant_access_token}`,
        contentType: 'application/json',
      },
      body: JSON.stringify({
        msg_type: 'text',
        content: JSON.stringify({
          text,
        }),
      }),
    }
  );
  const data = await res.json();
  console.log('回复消息结果', data);
  return handleResult(data);
}

//发送仅某人可见的群消息 https://open.feishu.cn/open-apis/ephemeral/v1/send
type SendOnlyMsgParams = {
  chat_id: string;
  open_id: string;
  text: string;
}
export const sendOnlyMsg = async ({ chat_id, open_id, text }: SendOnlyMsgParams) => {
  const tenant_access_token = await getTenantAccessToken();
  const res = await fetch(
    `https://open.feishu.cn/open-apis/ephemeral/v1/send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tenant_access_token}`,
        contentType: 'application/json',
      },
      body: JSON.stringify({
        chat_id,
        open_id,
        msg_type: 'interactive',
        card: {
          elements: [
            {
              tag: 'div',
              text: {
                tag: 'plain_text',
                content: text,
                text_size: 'normal',
                text_align: 'left',
                text_color: 'default',
              },
            },
          ],
        },
      }),
    }
  );
  const data = await res.json();
  console.log('发送私密消息结果', data);
  return handleResult(data);
};

//get https://open.feishu.cn/open-apis/im/v1/chats/:chat_id/members
type GetChatMemberParams = {
  chat_id: string;
}
type ChatMemberResponse = {
  items: [{
    member_id_type: string;
    member_id: string;
    name: string;
  }];
  member_total: number;
  has_more: boolean;
}
export const getChatMembers = async ({ chat_id }: GetChatMemberParams): Promise<ChatMemberResponse> => {
  const tenant_access_token = await getTenantAccessToken();
  const res = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/chats/${chat_id}/members`,
    {
      headers: {
        Authorization: `Bearer ${tenant_access_token}`,
      },
      method: 'GET',
    }
  );
  const data = await res.json();
  console.log('获取群成员结果', data);
  return handleResult(data);
};

type RequestParams = {
  url: string;
  data: any;
  tag: string;
  method?: string;
  fk?: string;
}
const request = async ({ url, data, tag, method, fk }: RequestParams) => {
  //统计时间
  // console.time(tag);
  console.log(`[${tag}] request`, JSON.stringify(data));
  //获取token
  const tenant_access_token = await getTenantAccessToken(fk);
  const res = await fetch(url, {
    method: method || 'POST',
    headers: {
      Authorization: `Bearer ${tenant_access_token}`,
      contentType: 'application/json',
    },
    body: JSON.stringify(data),
  });
  const j = await res.json();
  console.log(`[${tag}] - response`, JSON.stringify(j));
  // console.timeEnd(tag); laf不支持
  return handleResult(j);
}

//记录转换成普通对象类型
export const recordToNormalData = (res: any) => {
  const result: { [key: string]: any } = {
    record_id: res.record_id,
  };
  Object.keys(res.fields).forEach((key) => {
    const item = res.fields[key];
    result[key] = getItemValue(item);
  })
  return result;
}

function getItemValue(item: any) {
  if (isTextData(item)) {
    return item?.[0]?.text;
  } else if (isValueTextData(item)) {
    return item?.value?.[0]?.text;
  }
  return item;
}

/**
 * 
 "blind_data": [{
    "text": "1,2",
    "type": "text"
}],
 * @returns 
 */
function isTextData(item: any) {
  if (item === undefined) {
    return false;
  }
  return Array.isArray(item) && item.length === 1 && item[0].type === 'text';
}
/**
"game_id": {
      "type": 1,
      "value": [{
        "text": "recus71fZ0TlVG",
        "type": "text"
      }]
    },
 */
function isValueTextData(item: any) {
  if (item === undefined) {
    return false;
  }
  //判断是数字类型
  if (typeof item === 'object') {
    return isTextData(item?.value);
  }
  return false;

}

function handleResult(res: any) {
  if (res.code !== 0) {
    throw new Error('记录错误:' + res.msg);
  }
  return res.data;
}
function getConfig(ROBOT_APP_ID: ConfigKey) {
  throw new Error("Function not implemented.");
}

