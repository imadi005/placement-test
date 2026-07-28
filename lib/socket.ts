import { io, Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

// One shared socket per browser tab — coordinator screens joining multiple
// test rooms reuse this connection rather than opening a new one each time.
export function getSocket(): Socket {
  if (!socket) {
    const token = typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
    socket = io(API_URL, { auth: { token } });
  }
  return socket;
}
