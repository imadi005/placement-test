import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";

export interface JwtPayload {
  sub: string; // user id
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
    });
  }

  // Runs on every authenticated request. We re-fetch role from the DB rather
  // than trusting the JWT payload alone for sensitive actions — the payload
  // is used for quick guard checks, but controllers doing anything
  // destructive (batch changes, question edits) should re-verify via this
  // fresh `user` object, not the raw token claims.
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Account is inactive or no longer exists");
    }
    return { id: user.id, role: user.role, fullName: user.fullName, email: user.email };
  }
}
