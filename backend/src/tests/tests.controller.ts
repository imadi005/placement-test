import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { TestsService } from "./tests.service";
import { CreateTestDto } from "./dto/create-test.dto";

@Controller("tests")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestsController {
  constructor(private testsService: TestsService, private prisma: PrismaService) {}

  @Post()
  @Roles("coordinator")
  create(@Body() dto: CreateTestDto, @CurrentUser() user: { id: string }) {
    return this.testsService.create(dto, user.id);
  }

  // Students see only tests scoped to their batch; staff see everything.
  @Get()
  @Roles("student", "teacher", "coordinator", "admin")
  async list(@CurrentUser() user: { id: string; role: string }) {
    if (user.role === "student") {
      const student = await this.prisma.student.findUnique({ where: { userId: user.id } });
      if (!student) throw new NotFoundException("Student profile not found");
      return this.testsService.findVisibleForStudent(student.batch);
    }
    return this.testsService.findAllForStaff();
  }

  @Get(":id")
  @Roles("student", "teacher", "coordinator", "admin")
  findOne(@Param("id") id: string) {
    return this.testsService.findOne(id);
  }

  @Post(":id/approve-questions")
  @Roles("coordinator")
  approve(@Param("id") id: string) {
    return this.testsService.markApproved(id);
  }

  @Post(":id/schedule")
  @Roles("coordinator")
  schedule(@Param("id") id: string) {
    return this.testsService.schedule(id);
  }

  @Post(":id/start")
  @Roles("coordinator")
  start(@Param("id") id: string) {
    return this.testsService.start(id);
  }

  @Post(":id/stop")
  @Roles("coordinator")
  stop(@Param("id") id: string) {
    return this.testsService.stop(id);
  }
}
