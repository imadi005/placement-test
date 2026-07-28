import { UseGuards } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { WsJwtGuard } from "./ws-jwt.guard";
import { RedisService } from "../redis/redis.service";
import { TestsService } from "../tests/tests.service";

// Room naming: `test:{testId}` — every socket that joins a test (student
// taking it, coordinator monitoring it) lands in the same room, so a
// coordinator's Start/Stop broadcasts to everyone at once via `server.to()`.
//
// This gateway deliberately does NOT duplicate answer/violation persistence
// logic — those stay in AttemptsService via REST (single source of truth).
// The gateway's job is real-time fan-out: relaying Redis pub/sub events to
// whichever sockets are in a test's room, per design doc §6.
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL ?? "http://localhost:3000", credentials: true } })
export class TestGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private subscribedTests = new Set<string>();

  constructor(private redis: RedisService, private testsService: TestsService) {}

  handleConnection(client: Socket) {
    // Auth happens per-message via WsJwtGuard rather than here, so an
    // unauthenticated connection can exist briefly but can't call anything.
  }

  handleDisconnect(client: Socket) {
    // Room membership is cleaned up automatically by socket.io on disconnect.
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("test:join")
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { testId: string }) {
    const room = `test:${body.testId}`;
    await client.join(room);

    const user = client.data.user;

    if (user.role === "student") {
      await this.redis.addActiveStudent(body.testId, user.id);
    }

    // Subscribe once per test to the Redis channel and fan out to the room
    // — guards against re-subscribing on every join (see note in
    // RedisService.subscribeToTestEvents about listener stacking).
    if (!this.subscribedTests.has(body.testId)) {
      this.subscribedTests.add(body.testId);
      this.redis.subscribeToTestEvents(body.testId, (event) => {
        this.server.to(room).emit("test:event", event);
      });
    }

    const activeCount = await this.redis.getActiveStudentCount(body.testId);
    return { joined: room, activeStudentCount: activeCount };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage("coordinator:test_control")
  async handleTestControl(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { testId: string; action: "start" | "stop" }
  ) {
    const user = client.data.user;
    if (user.role !== "coordinator") {
      return { error: "Only coordinators can control test state" };
    }

    const updated =
      body.action === "start"
        ? await this.testsService.start(body.testId)
        : await this.testsService.stop(body.testId);

    await this.redis.publishTestEvent(body.testId, {
      type: "test_status_changed",
      status: updated.status,
    });

    return { success: true, status: updated.status };
  }
}
