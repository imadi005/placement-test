import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

// Socket.io has no Authorization header concept the way HTTP does — the
// client sends the access token via `io(url, { auth: { token } })` and this
// guard verifies it on every gateway method, same trust model as the HTTP
// JwtStrategy (re-fetches the user rather than trusting the payload alone).
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwt: JwtService, private config: ConfigService, private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = client.handshake?.auth?.token;
    if (!token) throw new UnauthorizedException("No token provided on socket handshake");

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new Error("inactive");

      client.data.user = { id: user.id, role: user.role };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired socket token");
    }
  }
}
