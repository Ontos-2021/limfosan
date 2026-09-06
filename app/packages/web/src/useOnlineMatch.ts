import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, Greeting, MatchSnapshot } from '@limfosan/shared';
import { emitAck, getSocket } from './socket';
import { useToasts } from './toasts';

export type OnlineConnection =
  'idle' | 'joining' | 'connected' | 'reconnecting' | 'error';

export interface OnlineMatch {
  code: string | null;
  snapshot: MatchSnapshot | null;
  connection: OnlineConnection;
  error: string | null;
  greeting: { from: string; text: string; at: number } | null;
  join: (code: string) => void;
  leave: () => void;
  sendAction: (action: Action) => void;
  voteRematch: () => void;
  sendGreeting: (text: Greeting) => void;
}

/**
 * Partida online contra una persona (E4).
 *
 * El servidor es autoritativo: este hook solo transporta comandos y pinta
 * snapshots. Cada gesto del usuario genera un commandId que se conserva
 * hasta su ack: si se cae la conexión en el medio, al volver se reenvía
 * el MISMO id y el servidor no duplica el efecto.
 */
export function useOnlineMatch(
  onRematchCode: (code: string) => void,
): OnlineMatch {
  const [code, setCode] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [connection, setConnection] = useState<OnlineConnection>('idle');
  const [error, setError] = useState<string | null>(null);
  const [greeting, setGreeting] = useState<OnlineMatch['greeting']>(null);
  const pending = useRef<{ commandId: string; action: Action } | null>(null);
  const codeRef = useRef<string | null>(null);
  /** true desde que el servidor confirma unirse hasta salir. */
  const joinedRef = useRef(false);
  const rematchCb = useRef(onRematchCode);
  rematchCb.current = onRematchCode;
  const { push } = useToasts();

  const doJoin = useCallback((normalized: string) => {
    emitAck<{ ok: boolean; error?: string; snapshot?: MatchSnapshot }>(
      getSocket(),
      'mesa:unirse',
      { code: normalized },
    )
      .then((ack) => {
        if (codeRef.current !== normalized) return;
        if (ack.ok && ack.snapshot) {
          joinedRef.current = true;
          setSnapshot(ack.snapshot);
          setConnection('connected');
        } else {
          setError(ack.error ?? 'No se pudo unir a la mesa.');
          setConnection('error');
        }
      })
      .catch(() => {
        if (codeRef.current !== normalized) return;
        setError('Sin respuesta del servidor. Reintentá.');
        setConnection('error');
      });
  }, []);

  const join = useCallback(
    (nextCode: string) => {
      const normalized = nextCode.trim().toUpperCase();
      codeRef.current = normalized;
      joinedRef.current = false;
      setCode(normalized);
      setSnapshot(null);
      setError(null);
      pending.current = null;
      setConnection('joining');
      const socket = getSocket();
      if (socket.connected) {
        // Ya conectado (ej. revancha): unirse directo.
        doJoin(normalized);
      } else {
        // El handler persistente 'connect' emite unirse al conectar.
        socket.connect();
      }
    },
    [doJoin],
  );

  const leave = useCallback(() => {
    codeRef.current = null;
    pending.current = null;
    joinedRef.current = false;
    const socket = getSocket();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try {
        socket.disconnect();
      } catch {
        // Salir nunca puede fallar desde el punto de vista del usuario.
      }
    };
    if (socket.connected) {
      try {
        emitAck(socket, 'mesa:salir').then(finish, finish);
        setTimeout(finish, 1500);
      } catch {
        finish();
      }
    } else {
      // Nunca se llegó a unir: nada que avisar, solo reset local.
      finish();
    }
    setCode(null);
    setSnapshot(null);
    setConnection('idle');
    setError(null);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    const onEstado = (snap: MatchSnapshot) => {
      setSnapshot((prev) => (prev && prev.seq > snap.seq ? prev : snap));
      setConnection((c) =>
        c === 'reconnecting' || c === 'joining' ? 'connected' : c,
      );
    };
    const onError = (err: { code: string; message: string }) => {
      push(err.message, 'error');
    };
    const onRematch = (payload: { code: string }) => {
      rematchCb.current(payload.code);
    };
    const onGreeting = (payload: { from: string; text: string }) => {
      setGreeting({ ...payload, at: Date.now() });
    };
    const onDisconnect = () => {
      if (codeRef.current) setConnection('reconnecting');
    };
    const onConnect = () => {
      const current = codeRef.current;
      if (!current) return;
      // Unirse (o re-unirse) a la mesa actual.
      emitAck<{ ok: boolean; error?: string; snapshot?: MatchSnapshot }>(
        socket,
        'mesa:unirse',
        { code: current },
      )
        .then((ack) => {
          if (codeRef.current !== current) return;
          if (ack.ok && ack.snapshot) {
            joinedRef.current = true;
            setSnapshot(ack.snapshot);
            setConnection('connected');
            const retry = pending.current;
            if (retry) sendActionRef.current(retry.action, retry.commandId);
          } else {
            setError(ack.error ?? 'No se pudo volver a la mesa.');
            setConnection('error');
          }
        })
        .catch(() => {
          if (codeRef.current === current) setConnection('reconnecting');
        });
    };
    const onConnectError = (err: Error) => {
      if (/sesión|origen/i.test(err.message)) {
        getSocket().disconnect();
        setError('Tu sesión venció. Recargá la página para seguir.');
        setConnection('error');
      }
    };
    socket.on('mesa:estado', onEstado);
    socket.on('mesa:error', onError);
    socket.on('mesa:revancha-lista', onRematch);
    socket.on('mesa:saludo', onGreeting);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);
    return () => {
      socket.off('mesa:estado', onEstado);
      socket.off('mesa:error', onError);
      socket.off('mesa:revancha-lista', onRematch);
      socket.off('mesa:saludo', onGreeting);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  const sendActionRef = useRef<(action: Action, commandId?: string) => void>(
    () => undefined,
  );
  sendActionRef.current = (action: Action, commandId?: string) => {
    const id =
      commandId ??
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random()}`;
    pending.current = { commandId: id, action };
    emitAck<{ ok: boolean; error?: string; duplicate?: boolean }>(
      getSocket(),
      'mesa:accion',
      { commandId: id, action },
    )
      .then((ack) => {
        if (pending.current?.commandId === id) pending.current = null;
        if (!ack.ok) push(ack.error ?? 'Jugada rechazada.', 'error');
      })
      .catch(() => {
        // Sin ack (corte en el medio): se reenvía el mismo id al reconectar.
        push('Sin respuesta: se reintentará al reconectar.', 'error');
      });
  };

  const sendAction = useCallback((action: Action) => {
    sendActionRef.current(action);
  }, []);

  const voteRematch = useCallback(() => {
    emitAck<{ ok: boolean; error?: string }>(getSocket(), 'mesa:revancha').then(
      (ack) => {
        if (!ack.ok) push(ack.error ?? 'No se pudo votar.', 'error');
      },
    );
  }, [push]);

  const sendGreeting = useCallback(
    (text: Greeting) => {
      try {
        getSocket().emit('mesa:saludo', { text });
      } catch {
        push('No se pudo enviar el saludo.', 'error');
      }
    },
    [push],
  );

  useEffect(() => {
    if (!greeting) return;
    const timer = setTimeout(() => setGreeting(null), 3000);
    return () => clearTimeout(timer);
  }, [greeting]);

  return {
    code,
    snapshot,
    connection,
    error,
    greeting,
    join,
    leave,
    sendAction,
    voteRematch,
    sendGreeting,
  };
}
