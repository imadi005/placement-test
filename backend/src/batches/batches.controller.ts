import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { BatchesService } from "./batches.service";
import { ChangeBatchDto } from "./dto/change-batch.dto";

@Controller("batches")
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchesController {
  constructor(private batchesService: BatchesService) {}

  // RBAC matrix (design doc §8): batch upgrade/downgrade — coordinator + admin only
  @Post("change")
  @Roles("coordinator", "admin")
  async change(@Body() dto: ChangeBatchDto, @CurrentUser() user: { id: string }) {
    return this.batchesService.changeBatch(dto, user.id);
  }

  @Get("distribution")
  @Roles("coordinator", "admin")
  distribution() {
    return this.batchesService.getDistribution();
  }

  @Get(":studentId/history")
  @Roles("coordinator", "admin")
  async history(@Param("studentId") studentId: string) {
    return this.batchesService.historyForStudent(studentId);
  }
}
