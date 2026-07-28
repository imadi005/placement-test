import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { TestGateway } from "./test.gateway";
import { WsJwtGuard } from "./ws-jwt.guard";
import { TestsModule } from "../tests/tests.module";

@Module({
  imports: [JwtModule.register({}), TestsModule],
  providers: [TestGateway, WsJwtGuard],
})
export class GatewayModule {}
