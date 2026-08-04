import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

// Key patterns match system-design/placement-test-platform-design.md §4 —
// keep this file as the single place that knows Redis key shapes so nobody
// hand-builds `attempt:${id}:state` strings elsewhere.
const TTL_BUFFER_SECONDS = 60 * 30; // test duration + buffer, generous default

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client!: Redis;
  private subscriber!: Redis;
  // One dispatch table, one "message" listener registered ONCE below —
  // subscribeToTestEvents() used to add a fresh `this.subscriber.on(...)`
  // per distinct testId with nothing ever removing it, so every test ever
  // watched across the process's lifetime left a permanent listener behind
  // (Node's default max-listener cap of 10 would eventually start warning,
  // and every incoming message got checked against every historical test).
  private testEventHandlers = new Map<string, Set<(event: Record<string, unknown>) => void>>();

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.client = new Redis(url);
    this.subscriber = new Redis(url);
    this.subscriber.on("message", (channel, message) => {
      const handlers = this.testEventHandlers.get(channel);
      if (!handlers) return;
      const event = JSON.parse(message);
      for (const handler of handlers) handler(event);
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
    await this.subscriber?.quit();
  }

  attemptStateKey(attemptId: string) {
    return `attempt:${attemptId}:state`;
  }

  testActiveStudentsKey(testId: string) {
    return `test:${testId}:active_students`;
  }

  testEventsChannel(testId: string) {
    return `channel:test:${testId}:events`;
  }

  async setAttemptState(attemptId: string, state: Record<string, unknown>) {
    await this.client.set(this.attemptStateKey(attemptId), JSON.stringify(state), "EX", TTL_BUFFER_SECONDS);
  }

  async getAttemptState<T = Record<string, unknown>>(attemptId: string): Promise<T | null> {
    const raw = await this.client.get(this.attemptStateKey(attemptId));
    return raw ? JSON.parse(raw) : null;
  }

  async addActiveStudent(testId: string, studentId: string) {
    await this.client.sadd(this.testActiveStudentsKey(testId), studentId);
    await this.client.expire(this.testActiveStudentsKey(testId), TTL_BUFFER_SECONDS);
  }

  async removeActiveStudent(testId: string, studentId: string) {
    await this.client.srem(this.testActiveStudentsKey(testId), studentId);
  }

  async getActiveStudentCount(testId: string): Promise<number> {
    return this.client.scard(this.testActiveStudentsKey(testId));
  }

  async publishTestEvent(testId: string, event: Record<string, unknown>) {
    await this.client.publish(this.testEventsChannel(testId), JSON.stringify(event));
  }

  subscribeToTestEvents(testId: string, onMessage: (event: Record<string, unknown>) => void) {
    const channel = this.testEventsChannel(testId);
    if (!this.testEventHandlers.has(channel)) {
      this.testEventHandlers.set(channel, new Set());
      this.subscriber.subscribe(channel);
    }
    this.testEventHandlers.get(channel)!.add(onMessage);
  }
}
