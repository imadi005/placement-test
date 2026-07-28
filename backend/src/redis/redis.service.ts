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

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>("REDIS_URL") ?? "redis://localhost:6379";
    this.client = new Redis(url);
    this.subscriber = new Redis(url);
  }

  async onModuleDestroy() {
    await this.client?.quit();
    await this.subscriber?.quit();
  }

  attemptStateKey(attemptId: string) {
    return `attempt:${attemptId}:state`;
  }

  attemptViolationsKey(attemptId: string) {
    return `attempt:${attemptId}:violations`;
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

  async incrementViolationCount(attemptId: string): Promise<number> {
    const key = this.attemptViolationsKey(attemptId);
    const count = await this.client.incr(key);
    await this.client.expire(key, TTL_BUFFER_SECONDS);
    return count;
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
    this.subscriber.subscribe(this.testEventsChannel(testId));
    this.subscriber.on("message", (channel, message) => {
      if (channel === this.testEventsChannel(testId)) {
        onMessage(JSON.parse(message));
      }
    });
  }
}
