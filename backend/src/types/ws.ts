import { Socket } from 'socket.io';

export type WsUser = { sub: number; username?: string; email?: string };
export type SocketWithUser = Socket & { user?: WsUser };
