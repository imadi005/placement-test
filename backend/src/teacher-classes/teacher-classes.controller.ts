import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { TeacherClassesService } from "./teacher-classes.service";
import { CreateClassAssignmentDto } from "./dto/create-class-assignment.dto";

@Controller("class-assignments")
@UseGuards(JwtAuthGuard, RolesGuard)
export class TeacherClassesController {
  constructor(private teacherClassesService: TeacherClassesService) {}

  @Post()
  @Roles("coordinator", "admin")
  create(@Body() dto: CreateClassAssignmentDto) {
    return this.teacherClassesService.create(dto);
  }

  // RBAC matrix §8: teacher — "view own calendar"
  @Get("me")
  @Roles("teacher")
  findMine(@CurrentUser() user: { id: string }) {
    return this.teacherClassesService.findForTeacher(user.id);
  }

  @Get(":id/roster")
  @Roles("teacher")
  roster(@Param("id") id: string, @CurrentUser() user: { id: string }) {
    return this.teacherClassesService.getRoster(id, user.id);
  }

  // RBAC matrix §8: coordinator — "which teacher takes which class"
  @Get()
  @Roles("coordinator", "admin")
  findAll() {
    return this.teacherClassesService.findAll();
  }
}
