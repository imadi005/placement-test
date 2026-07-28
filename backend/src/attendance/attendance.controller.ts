import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AttendanceService } from "./attendance.service";
import { MarkAttendanceDto } from "./dto/mark-attendance.dto";

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Post("class-assignments/:id/attendance")
  @Roles("teacher")
  mark(
    @Param("id") classAssignmentId: string,
    @Body() dto: MarkAttendanceDto,
    @CurrentUser() user: { id: string }
  ) {
    return this.attendanceService.markForClass(classAssignmentId, user.id, dto);
  }

  @Get("class-assignments/:id/attendance")
  @Roles("teacher")
  getForDate(
    @Param("id") classAssignmentId: string,
    @Query("date") date: string,
    @CurrentUser() user: { id: string }
  ) {
    return this.attendanceService.getForClassOnDate(classAssignmentId, user.id, date);
  }

  // Student's own dashboard widget
  @Get("students/me/attendance")
  @Roles("student")
  async myAttendance(@CurrentUser() user: { id: string }) {
    return this.attendanceService.getStudentSummary(user.id);
  }

  // Coordinator/admin looking up any student's attendance
  @Get("students/:studentId/attendance")
  @Roles("coordinator", "admin")
  async studentAttendance(@Param("studentId") studentId: string) {
    return this.attendanceService.getStudentSummary(studentId);
  }

  // RBAC matrix §8: coordinator/admin — section-wide attendance + teacher assignment view
  @Get("attendance/summary")
  @Roles("coordinator", "admin")
  summary() {
    return this.attendanceService.getSectionSummary();
  }
}
