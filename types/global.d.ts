interface FunctionContext {
  body: any;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  method?: string;
  // 根据实际需要添加其他属性
}

declare const process: { env: { [key: string]: string | undefined } };

declare module 'dayjs' {
    const dayjs: any;
    export default dayjs;
}
