import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@limfosan/shared';

export type MesaSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: MesaSocket | null = null;

/** Singleton del socket (una sola conexión por pestaña). */
export function getSocket(): MesaSocket {
  if (!socket) {
    socket = io({
      path: '/socket.io/',
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 8000,
      timeout: 12000,
    });
  }
  return socket;
}

/** Emit con ack y timeout propio (los acks del servidor siempre responden). */
export function emitAck<T>(
  sock: MesaSocket,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 15000);
    const emit = sock.emit.bind(sock) as (...call: unknown[]) => unknown;
    emit(...args, (res: T) => {
      clearTimeout(timer);
      resolve(res);
    });
  });
}
